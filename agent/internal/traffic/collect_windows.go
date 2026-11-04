//go:build windows

package traffic

import (
	"os"
	"path/filepath"
)

// No interface names, addresses, destinations or traffic contents leave this command.
// Only native .NET per-interface byte counters are serialized. Loopback is excluded.
const windowsCounters = `$ErrorActionPreference='Stop'; [Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false); $rows=@(foreach($n in [System.Net.NetworkInformation.NetworkInterface]::GetAllNetworkInterfaces()) { if($n.NetworkInterfaceType -ne [System.Net.NetworkInformation.NetworkInterfaceType]::Loopback) { $s=$n.GetIPStatistics(); [pscustomobject]@{received_bytes=[uint64]$s.BytesReceived;sent_bytes=[uint64]$s.BytesSent} } }); ConvertTo-Json -Compress -InputObject $rows`

func Collect() (Stats, error) {
	root := os.Getenv("SystemRoot")
	if root == "" {
		root = `C:\Windows`
	}
	output, err := counterCommand(filepath.Join(root, "System32", "WindowsPowerShell", "v1.0", "powershell.exe"), "-NoLogo", "-NoProfile", "-NonInteractive", "-Command", windowsCounters)
	if err != nil {
		return Stats{}, err
	}
	return parseWindows(output)
}
