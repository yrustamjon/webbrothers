"""Latest published desktop installers from the project's fixed release source.

Only public release metadata is cached in RAM. No agent/browser data is involved.
OS signing is independent of GitHub's artifact digest.
"""

import json
import re
import threading
import time
import urllib.error
import urllib.request

REPOSITORY = "yrustamjon/webbrothers"
RELEASES_URL = f"https://github.com/{REPOSITORY}/releases"
LATEST_API = f"https://api.github.com/repos/{REPOSITORY}/releases/latest"
INSTALLERS = {
    ("darwin", "amd64"): "bmp-agent-darwin-amd64.dmg",
    ("darwin", "arm64"): "bmp-agent-darwin-arm64.dmg",
    ("windows", "amd64"): "bmp-agent-windows-amd64-setup.exe",
}
_lock = threading.Lock()
_expires = 0.0
_cached = None


def release_installers(release):
    """Reject drafts, prereleases, foreign URLs and incomplete release sets."""
    if not isinstance(release, dict):
        return []
    tag = release.get("tag_name", "")
    if (
        release.get("draft") is not False
        or release.get("prerelease") is not False
        or not isinstance(tag, str)
        or not re.fullmatch(r"agent-v[0-9]+\.[0-9]+\.[0-9]+", tag)
        or not isinstance(release.get("assets"), list)
    ):
        return []
    items = []
    for (platform, arch), filename in INSTALLERS.items():
        url = f"{RELEASES_URL}/download/{tag}/{filename}"
        assets = [
            a
            for a in release["assets"]
            if isinstance(a, dict) and a.get("name") == filename
        ]
        if len(assets) != 1:
            return []
        asset = assets[0]
        digest = asset.get("digest", "")
        if (
            asset.get("state") != "uploaded"
            or asset.get("browser_download_url") != url
            or not isinstance(asset.get("size"), int)
            or not 0 < asset["size"] <= 200 * 1024 * 1024
            or not isinstance(digest, str)
            or not re.fullmatch(r"sha256:[0-9a-f]{64}", digest)
        ):
            return []
        items.append(
            {
                "platform": platform,
                "architecture": arch,
                "filename": filename,
                "version": tag.removeprefix("agent-v"),
                "download_url": url,
                "release_url": f"{RELEASES_URL}/tag/{tag}",
                "sha256": digest.removeprefix("sha256:"),
            }
        )
    return items


def latest_installers():
    global _expires, _cached
    with _lock:
        if _cached is not None and time.monotonic() < _expires:
            return _cached
        items = []
        try:
            request = urllib.request.Request(
                LATEST_API,
                headers={
                    "Accept": "application/vnd.github+json",
                    "User-Agent": "WebBrothers-Agent-Releases",
                    "X-GitHub-Api-Version": "2022-11-28",
                },
            )
            with urllib.request.urlopen(request, timeout=5) as response:
                raw = response.read(1024 * 1024 + 1)
                if len(raw) <= 1024 * 1024:
                    items = release_installers(json.loads(raw))
        except (OSError, ValueError, urllib.error.HTTPError):
            pass
        _cached = {
            "items": items,
            "status": "available" if items else "unavailable",
        }
        # Fail closed without presenting an older release as the latest.
        _expires = time.monotonic() + (60 if items else 15)
        return _cached
