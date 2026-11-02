"""Published installer discovery must never produce a foreign or partial release."""

import copy
import io
import json
import urllib.error

import pytest

from bmp import installers


def release():
    tag = "agent-v0.1.12"
    return {
        "tag_name": tag,
        "draft": False,
        "prerelease": False,
        "assets": [
            {
                "name": name,
                "browser_download_url": f"{installers.RELEASES_URL}/download/{tag}/{name}",
                "digest": "sha256:" + "a" * 64,
                "size": 100,
                "state": "uploaded",
            }
            for name in installers.INSTALLERS.values()
        ],
    }


def test_complete_latest_installers():
    items = installers.release_installers(release())
    assert len(items) == 3
    assert {i["version"] for i in items} == {"0.1.12"}
    assert all("/download/agent-v0.1.12/" in i["download_url"] for i in items)


@pytest.mark.parametrize(
    "change",
    [
        lambda r: r.update(draft=True),
        lambda r: r.update(prerelease=True),
        lambda r: r.update(tag_name="agent-v../../bad"),
        lambda r: r["assets"].pop(),
        lambda r: r["assets"].append(copy.deepcopy(r["assets"][0])),
        lambda r: r["assets"][0].update(browser_download_url="https://evil.test/a"),
        lambda r: r["assets"][0].update(digest=None),
        lambda r: r["assets"][0].update(size=0),
    ],
)
def test_reject_incomplete_or_untrusted_metadata(change):
    data = release()
    change(data)
    assert installers.release_installers(data) == []


def test_refresh_and_no_stale_fallback(monkeypatch):
    monkeypatch.setattr(installers, "_cached", None)
    monkeypatch.setattr(installers, "_expires", 0)
    calls = []

    def fetch(request, timeout):
        calls.append(request.full_url)
        return io.BytesIO(json.dumps(release()).encode())

    monkeypatch.setattr(installers.urllib.request, "urlopen", fetch)
    assert installers.latest_installers()["status"] == "available"
    assert installers.latest_installers()["status"] == "available"
    assert calls == [installers.LATEST_API]
    monkeypatch.setattr(installers, "_expires", 0)

    def unavailable(*args, **kwargs):
        raise urllib.error.URLError("offline")

    monkeypatch.setattr(installers.urllib.request, "urlopen", unavailable)
    assert installers.latest_installers() == {"items": [], "status": "unavailable"}
