; Invoke with /DVersion=1.2.3 /DSourceDir=... /DOutputDir=...
#ifndef Version
  #error Version required
#endif
#ifndef SourceDir
  #error SourceDir required
#endif
#ifndef OutputDir
  #error OutputDir required
#endif
[Setup]
AppId={{D75DA156-5F05-4E7B-9925-AF84753EBD01}
AppName=WebBrothers Agent
AppVersion={#Version}
DefaultDirName={localappdata}\Programs\WebBrothers Agent
DefaultGroupName=WebBrothers Agent
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir={#OutputDir}
OutputBaseFilename=bmp-agent-windows-amd64-setup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
CloseApplications=yes
SetupMutex=WebBrothersAgentInstaller
UninstallDisplayIcon={app}\browser-agent.exe
[Files]
Source: "{#SourceDir}\browser-agent.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#SourceDir}\launch.ps1"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#SourceDir}\launch.cmd"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#SourceDir}\VERSION"; DestDir: "{app}"; Flags: ignoreversion
[Icons]
Name: "{group}\WebBrothers Agent"; Filename: "{app}\launch.cmd"; WorkingDir: "{app}"
Name: "{userdesktop}\WebBrothers Agent"; Filename: "{app}\launch.cmd"; WorkingDir: "{app}"; Tasks: desktopicon
[Tasks]
Name: desktopicon; Description: "Ish stoliga yorliq qoʻshish"; Flags: unchecked
