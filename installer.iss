; WinNAS Installer - Inno Setup Script
; Builds a professional installer for WinNAS personal NAS server

#define MyAppName "WinNAS"
#define MyAppVersion "1.0.4"
#define MyAppPublisher "WinNAS"
#define MyAppURL "https://github.com/gogoonbuntu/winnas"
#define MyAppExeName "WinNAS_Server.bat"

[Setup]
AppId={{E7A3F2B1-5C4D-4E6F-8A9B-1C2D3E4F5A6B}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
AllowNoIcons=yes
OutputDir=installer_output
OutputBaseFilename=WinNAS_Setup_{#MyAppVersion}
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
WizardSizePercent=120
DisableProgramGroupPage=auto
PrivilegesRequired=admin
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0
UninstallDisplayName={#MyAppName}
ShowLanguageDialog=yes
DisableWelcomePage=no

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"
Name: "korean"; MessagesFile: "compiler:Languages\Korean.isl"

[Messages]
english.WelcomeLabel1=Welcome to the WinNAS Setup Wizard
english.WelcomeLabel2=This will install WinNAS (Personal NAS Server) on your computer.%n%n📋 Requirements:%n  • Windows 10 or later%n  • Node.js 18+ (guided during setup)%n%nClick Next to continue.
english.FinishedHeadingLabel=WinNAS Setup Complete!
english.FinishedLabel=WinNAS has been successfully installed.%n%n🔧 To complete the initial setup, please check "Run initial setup" and click Finish.%n%nAfter the setup, you can start the server using the "WinNAS Server" shortcut on your desktop.

korean.WelcomeLabel1=WinNAS 설치 마법사
korean.WelcomeLabel2=이 설치 프로그램은 WinNAS (개인 NAS 서버)를 컴퓨터에 설치합니다.%n%n📋 필수 요구사항:%n  • Windows 10 이상%n  • Node.js 18+ (설치 과정에서 안내)%n%n설치를 계속하려면 [다음]을 클릭하세요.
korean.FinishedHeadingLabel=WinNAS 설치 완료!
korean.FinishedLabel=WinNAS가 성공적으로 설치되었습니다.%n%n🔧 초기 설정을 완료하려면 "초기 설정 실행"을 체크하고 [마침]을 클릭하세요.%n%n설정 완료 후 바탕화면의 "WinNAS" 바로가기로 서버를 시작할 수 있습니다.

[CustomMessages]
english.TaskDesktopIcon=Create a desktop shortcut
english.TaskStartupIcon=Run automatically at Windows startup
english.RunSetup=Run initial setup (first time only)
korean.TaskDesktopIcon=바탕화면에 바로가기 생성
korean.TaskStartupIcon=Windows 시작 시 자동 실행
korean.RunSetup=초기 설정 실행 (최초 1회 필요)

[Tasks]
Name: "desktopicon"; Description: "{cm:TaskDesktopIcon}"; GroupDescription: "Shortcuts:"
Name: "startupicon"; Description: "{cm:TaskStartupIcon}"; GroupDescription: "Additional settings:"; Flags: unchecked

[Files]
; Core server files
Source: "server\*"; DestDir: "{app}\server"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "public\*"; DestDir: "{app}\public"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "package.json"; DestDir: "{app}"; Flags: ignoreversion
Source: "package-lock.json"; DestDir: "{app}"; Flags: ignoreversion
Source: "setup.js"; DestDir: "{app}"; Flags: ignoreversion
Source: "README.md"; DestDir: "{app}"; Flags: ignoreversion
Source: "SETUP.md"; DestDir: "{app}"; Flags: ignoreversion

; Batch scripts
Source: "run_setup.bat"; DestDir: "{app}"; Flags: ignoreversion
Source: "WinNAS_Server.bat"; DestDir: "{app}"; Flags: ignoreversion

; Binaries
Source: "cloudflared.exe"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
; Start Menu
Name: "{group}\WinNAS Server"; Filename: "{app}\WinNAS_Server.bat"; WorkingDir: "{app}"; IconFilename: "{sys}\shell32.dll"; IconIndex: 18
Name: "{group}\WinNAS Setup"; Filename: "{app}\run_setup.bat"; WorkingDir: "{app}"; IconFilename: "{sys}\shell32.dll"; IconIndex: 21
Name: "{group}\WinNAS Dashboard"; Filename: "http://localhost:7943"; IconFilename: "{sys}\shell32.dll"; IconIndex: 13
Name: "{group}\Uninstall WinNAS"; Filename: "{uninstallexe}"

; Desktop
Name: "{autodesktop}\WinNAS"; Filename: "{app}\WinNAS_Server.bat"; WorkingDir: "{app}"; IconFilename: "{sys}\shell32.dll"; IconIndex: 18; Tasks: desktopicon

; Startup (optional)
Name: "{userstartup}\WinNAS Server"; Filename: "{app}\WinNAS_Server.bat"; WorkingDir: "{app}"; Tasks: startupicon

[Run]
Filename: "{app}\run_setup.bat"; Description: "{cm:RunSetup}"; WorkingDir: "{app}"; Flags: postinstall skipifsilent unchecked shellexec

[UninstallDelete]
Type: filesandordirs; Name: "{app}\node_modules"
Type: filesandordirs; Name: "{app}\data"
Type: files; Name: "{app}\config.json"

[Code]
var
  NodeJsPage: TWizardPage;
  NodeStatusLabel: TLabel;
  NodeVersionLabel: TLabel;
  NodeFound: Boolean;

function IsNodeInstalled(): Boolean;
var
  ResultCode: Integer;
begin
  Result := Exec('cmd.exe', '/C node --version', '', SW_HIDE, ewWaitUntilTerminated, ResultCode) and (ResultCode = 0);
end;

function GetNodeVersion(): String;
var
  TmpFile: String;
  Lines: TArrayOfString;
  ResultCode: Integer;
begin
  Result := '';
  TmpFile := ExpandConstant('{tmp}\nodeversion.txt');
  if Exec('cmd.exe', '/C node --version > "' + TmpFile + '" 2>&1', '', SW_HIDE, ewWaitUntilTerminated, ResultCode) then
  begin
    if LoadStringsFromFile(TmpFile, Lines) and (GetArrayLength(Lines) > 0) then
      Result := Lines[0];
    DeleteFile(TmpFile);
  end;
end;

procedure OpenNodeJsDownload(Sender: TObject);
var
  ErrorCode: Integer;
begin
  ShellExec('open', 'https://nodejs.org/ko/download/', '', '', SW_SHOWNORMAL, ewNoWait, ErrorCode);
end;

procedure CheckNodeStatus(Sender: TObject);
begin
  NodeFound := IsNodeInstalled();
  if NodeFound then
  begin
    NodeStatusLabel.Caption := '✅ Node.js가 설치되어 있습니다!';
    NodeStatusLabel.Font.Color := clGreen;
    NodeVersionLabel.Caption := '버전: ' + GetNodeVersion();
    NodeVersionLabel.Visible := True;
  end
  else
  begin
    NodeStatusLabel.Caption := '❌ Node.js가 설치되어 있지 않습니다.';
    NodeStatusLabel.Font.Color := clRed;
    NodeVersionLabel.Caption := 'Node.js를 설치한 후 [새로고침]을 눌러주세요.';
    NodeVersionLabel.Visible := True;
  end;
end;

procedure InitializeWizard();
var
  DescLabel: TLabel;
  DownloadBtn: TNewButton;
  RefreshBtn: TNewButton;
begin
  // Create Node.js check page
  NodeJsPage := CreateCustomPage(wpSelectDir,
    'Node.js 확인',
    'WinNAS를 실행하려면 Node.js가 필요합니다.');

  DescLabel := TLabel.Create(NodeJsPage);
  DescLabel.Parent := NodeJsPage.Surface;
  DescLabel.Caption := 'WinNAS는 Node.js 기반 서버입니다.' + #13#10 +
    'Node.js 18 이상이 설치되어 있어야 합니다.' + #13#10#13#10 +
    '아래에서 현재 설치 상태를 확인하세요:';
  DescLabel.Left := 0;
  DescLabel.Top := 0;
  DescLabel.Width := NodeJsPage.SurfaceWidth;
  DescLabel.Height := 70;
  DescLabel.WordWrap := True;

  NodeStatusLabel := TLabel.Create(NodeJsPage);
  NodeStatusLabel.Parent := NodeJsPage.Surface;
  NodeStatusLabel.Caption := '확인 중...';
  NodeStatusLabel.Left := 0;
  NodeStatusLabel.Top := 80;
  NodeStatusLabel.Width := NodeJsPage.SurfaceWidth;
  NodeStatusLabel.Font.Size := 11;
  NodeStatusLabel.Font.Style := [fsBold];

  NodeVersionLabel := TLabel.Create(NodeJsPage);
  NodeVersionLabel.Parent := NodeJsPage.Surface;
  NodeVersionLabel.Caption := '';
  NodeVersionLabel.Left := 0;
  NodeVersionLabel.Top := 110;
  NodeVersionLabel.Width := NodeJsPage.SurfaceWidth;
  NodeVersionLabel.Visible := False;

  DownloadBtn := TNewButton.Create(NodeJsPage);
  DownloadBtn.Parent := NodeJsPage.Surface;
  DownloadBtn.Caption := '📥 Node.js 다운로드 페이지 열기';
  DownloadBtn.Left := 0;
  DownloadBtn.Top := 160;
  DownloadBtn.Width := 250;
  DownloadBtn.Height := 36;
  DownloadBtn.OnClick := @OpenNodeJsDownload;

  RefreshBtn := TNewButton.Create(NodeJsPage);
  RefreshBtn.Parent := NodeJsPage.Surface;
  RefreshBtn.Caption := '🔄 새로고침';
  RefreshBtn.Left := 260;
  RefreshBtn.Top := 160;
  RefreshBtn.Width := 120;
  RefreshBtn.Height := 36;
  RefreshBtn.OnClick := @CheckNodeStatus;
end;

procedure CurPageChanged(CurPageID: Integer);
begin
  if CurPageID = NodeJsPage.ID then
    CheckNodeStatus(nil);
end;

function NextButtonClick(CurPageID: Integer): Boolean;
begin
  Result := True;
  if CurPageID = NodeJsPage.ID then
  begin
    if not NodeFound then
    begin
      if MsgBox('Node.js가 설치되어 있지 않습니다.' + #13#10#13#10 +
        'Node.js 없이는 WinNAS를 실행할 수 없습니다.' + #13#10 +
        'Node.js를 나중에 설치하고 계속 진행하시겠습니까?',
        mbConfirmation, MB_YESNO) = IDNO then
        Result := False;
    end;
  end;
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  ResultCode: Integer;
begin
  if CurStep = ssPostInstall then
  begin
    // Run npm install silently
    WizardForm.StatusLabel.Caption := 'npm 패키지 설치 중... (잠시만 기다려주세요)';
    WizardForm.ProgressGauge.Style := npbstMarquee;
    Exec('cmd.exe', '/C cd /d "' + ExpandConstant('{app}') + '" && npm install --production', 
      ExpandConstant('{app}'), SW_HIDE, ewWaitUntilTerminated, ResultCode);
  end;
end;
