; ============================================================================
;  Inno Setup script - Thai ID Card Agent  (SELF-CONTAINED installer)
;
;  Produces ThaiIDCardAgent-Setup.exe. The customer just double-clicks it -
;  NOTHING needs to be pre-installed (the Bun runtime is bundled inside).
;
;  WHAT IT DOES
;    - Copies the app + bundled bun.exe + node_modules to Program Files.
;    - Registers an auto-start Windows Service named "ThaiIDCardAgent" that
;      runs `bun.exe agent.js` (via node-windows / WinSW, which handles the
;      Windows Service Control Manager protocol correctly).
;    - On uninstall, stops + removes the service.
;
;    The agent listens on http://127.0.0.1:9001  (GET /readers, GET /data).
;
;  HOW TO BUILD THIS INSTALLER (on YOUR dev machine, which has Bun)
;    1. bun install
;    2. bun run package          ->  creates dist-bundle\ (app + bun.exe + deps)
;    3. Install Inno Setup 6+    ->  https://jrsoftware.org/isdl.php
;    4. Compile:
;         & "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" installer.iss
;       (or open in the Inno Setup IDE and press F9)
;    5. Output: dist-installer\ThaiIDCardAgent-Setup.exe   <- ship this file
; ============================================================================

#define MyAppName "Thai ID Card Agent"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "Thai ID Card Agent"
#define MyServiceName "ThaiIDCardAgent"

[Setup]
AppId={{7A3D2E1C-9B4F-4C8A-A1D6-2E5F8C0B9A41}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\ThaiIDCardAgent
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
; Registering a service requires administrator rights.
PrivilegesRequired=admin
OutputDir=dist-installer
OutputBaseFilename=ThaiIDCardAgent-Setup
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
UninstallDisplayName={#MyAppName}

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Files]
; Everything the agent needs is staged in dist-bundle by `bun run package`
; (app, bundled bun.exe, node_modules, service scripts, patch, user-guide.html).
Source: "dist-bundle\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs ignoreversion

[Icons]
; Start Menu shortcut that opens the Thai user manual in the default browser.
Name: "{group}\คู่มือการใช้งาน"; Filename: "{app}\user-guide.html"; \
  Comment: "เปิดคู่มือการใช้งาน Thai ID Card Agent"
; Handy uninstall entry in the same Start Menu group.
Name: "{group}\ถอนการติดตั้ง Thai ID Card Agent"; Filename: "{uninstallexe}"

[Run]
; Offer to open the user manual right after install finishes.
Filename: "{app}\user-guide.html"; Description: "เปิดคู่มือการใช้งาน"; \
  Flags: postinstall shellexec skipifsilent
; Register + start the Windows Service, using the BUNDLED bun.exe so the
; service runs on our shipped runtime (no system Bun required).
Filename: "{app}\bun.exe"; Parameters: "run install-service.ts"; WorkingDir: "{app}"; \
  StatusMsg: "Registering ThaiIDCardAgent Windows Service..."; \
  Flags: runhidden waituntilterminated

; Offer to open the agent's health endpoint after install.
Filename: "http://127.0.0.1:9001/readers"; Description: "Open agent (http://localhost:9001)"; \
  Flags: postinstall shellexec skipifsilent

[UninstallRun]
; Stop + remove the service before files are deleted.
Filename: "{app}\bun.exe"; Parameters: "run uninstall-service.ts"; WorkingDir: "{app}"; \
  RunOnceId: "RemoveThaiIDCardService"; Flags: runhidden waituntilterminated

[UninstallDelete]
; node-windows writes a daemon\ folder (WinSW wrapper + logs) at runtime.
Type: filesandordirs; Name: "{app}\daemon"

[Code]
{ Best-effort: ensure any previous install of the service is gone before
  re-installing, so re-running the setup doesn't hit "already installed". }
procedure CurStepChanged(CurStep: TSetupStep);
var
  ResultCode: Integer;
begin
  if CurStep = ssInstall then
  begin
    if Exec('sc.exe', 'query {#MyServiceName}', '', SW_HIDE, ewWaitUntilTerminated, ResultCode) and (ResultCode = 0) then
    begin
      Exec('sc.exe', 'stop {#MyServiceName}', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    end;
  end;
end;
