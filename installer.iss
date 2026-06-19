; ============================================================================
;  Inno Setup script - Thai ID Card Agent
;  Builds ThaiIDCardAgent-Setup.exe which installs the agent and registers it
;  as an auto-start Windows Service named "ThaiIDCardAgent".
;
;  HOW IT WORKS
;    The agent runs on the Bun runtime (the `bun build --compile` single exe
;    currently crashes loading the PC/SC native addon - a Bun bug; see README).
;    So this installer ships the project + node_modules and registers the
;    service with `bun run install-service.ts` (node-windows under the hood,
;    which correctly implements the Windows Service Control Manager protocol).
;
;  PREREQUISITES (on the TARGET machine)
;    - Bun must be installed and on PATH  ->  https://bun.sh
;      (the installer checks for it and warns if missing)
;
;  BUILD THE INSTALLER
;    1. Install Inno Setup 6+        ->  https://jrsoftware.org/isdl.php
;    2. From the project root, make sure dependencies are installed:
;           bun install
;    3. Compile this script:
;           "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" installer.iss
;       (or open installer.iss in the Inno Setup IDE and press F9)
;    4. Output: dist-installer\ThaiIDCardAgent-Setup.exe
; ============================================================================

#define MyAppName "Thai ID Card Agent"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "Thai ID Card Agent"
#define MyServiceName "ThaiIDCardAgent"

[Setup]
AppId={{B8B6F2A1-9C2E-4E2A-9A1B-THAIIDCARD001}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\ThaiIDCardAgent
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
; Service install requires administrative rights.
PrivilegesRequired=admin
OutputDir=dist-installer
OutputBaseFilename=ThaiIDCardAgent-Setup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Files]
; --- Application source + runtime dependencies (run on the Bun runtime) ---
Source: "src\*";               DestDir: "{app}\src";          Flags: recursesubdirs createallsubdirs ignoreversion
Source: "node_modules\*";      DestDir: "{app}\node_modules"; Flags: recursesubdirs createallsubdirs ignoreversion
Source: "patches\*";           DestDir: "{app}\patches";      Flags: recursesubdirs createallsubdirs ignoreversion
Source: "install-service.ts";  DestDir: "{app}"; Flags: ignoreversion
Source: "uninstall-service.ts";DestDir: "{app}"; Flags: ignoreversion
Source: "package.json";        DestDir: "{app}"; Flags: ignoreversion
Source: "bunfig.toml";         DestDir: "{app}"; Flags: ignoreversion
Source: "tsconfig.json";       DestDir: "{app}"; Flags: ignoreversion
Source: "README.md";           DestDir: "{app}"; Flags: ignoreversion isreadme

[Run]
; Register + start the Windows Service after files are copied.
Filename: "{cmd}"; Parameters: "/C bun run install-service.ts"; WorkingDir: "{app}"; \
  StatusMsg: "Registering ThaiIDCardAgent Windows Service..."; Flags: runhidden waituntilterminated

[UninstallRun]
; Stop + remove the service before files are deleted.
Filename: "{cmd}"; Parameters: "/C bun run uninstall-service.ts"; WorkingDir: "{app}"; \
  RunOnceId: "RemoveThaiIDCardService"; Flags: runhidden waituntilterminated

[UninstallDelete]
; node-windows creates a daemon\ folder at runtime - clean it up.
Type: filesandordirs; Name: "{app}\daemon"

[Code]
{ Verify Bun is available on PATH before installing, since the service runs it. }
function BunOnPath(): Boolean;
var
  ResultCode: Integer;
begin
  Result := Exec('cmd.exe', '/C where bun', '', SW_HIDE, ewWaitUntilTerminated, ResultCode)
            and (ResultCode = 0);
end;

function InitializeSetup(): Boolean;
begin
  Result := True;
  if not BunOnPath() then
  begin
    if MsgBox('ไม่พบ Bun runtime บนเครื่องนี้ (จำเป็นต้องใช้รัน ThaiIDCardAgent).' + #13#10 +
              'กรุณาติดตั้ง Bun จาก https://bun.sh แล้วเปิด installer อีกครั้ง.' + #13#10#13#10 +
              'ต้องการดำเนินการต่อโดยไม่ตรวจสอบหรือไม่?',
              mbConfirmation, MB_YESNO) = IDNO then
      Result := False;
  end;
end;
