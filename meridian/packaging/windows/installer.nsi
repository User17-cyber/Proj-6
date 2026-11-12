; Meridian VPN installer for Windows.
; Built by scripts/build-release.sh:
;   makensis -DVERSION=1.0.0 -DARCH=x64 -DSRCDIR=<folder with Meridian.exe and wintun.dll> -DOUTFILE=<path> installer.nsi
Unicode true
SetCompressor /SOLID lzma
RequestExecutionLevel admin

!ifndef VERSION
  !define VERSION "0.0.0"
!endif
!ifndef ARCH
  !define ARCH "x64"
!endif

!include "MUI2.nsh"
!include "x64.nsh"

Name "Meridian VPN"
OutFile "${OUTFILE}"
InstallDir "$PROGRAMFILES64\Meridian"
BrandingText "Meridian VPN ${VERSION}"
VIProductVersion "${VERSION}.0"
VIAddVersionKey "ProductName" "Meridian VPN"
VIAddVersionKey "FileDescription" "Meridian VPN installer"
VIAddVersionKey "FileVersion" "${VERSION}"
VIAddVersionKey "ProductVersion" "${VERSION}"

!define MUI_ICON "..\icons\icon.ico"
!define MUI_UNICON "..\icons\icon.ico"
!define MUI_ABORTWARNING
!define MUI_WELCOMEPAGE_TITLE "Install Meridian VPN"
!define MUI_WELCOMEPAGE_TEXT "Meridian is a private VPN with a built-in ad and tracker blocker and a world map for choosing where websites see you.$\r$\n$\r$\nThe installer adds the Meridian service, which runs the secure tunnel in the background.$\r$\n$\r$\nClick Next to continue."
!define MUI_FINISHPAGE_RUN
!define MUI_FINISHPAGE_RUN_TEXT "Open Meridian"
!define MUI_FINISHPAGE_RUN_FUNCTION LaunchApp

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_LICENSE "${SRCDIR}\LICENSE.txt"
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"

!define UNINSTKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\MeridianVPN"

Function .onInit
  ${IfNot} ${RunningX64}
    MessageBox MB_ICONSTOP "Meridian needs 64-bit Windows 10 or newer."
    Abort
  ${EndIf}
  !if "${ARCH}" == "arm64"
    ${IfNot} ${IsNativeARM64}
      MessageBox MB_ICONSTOP "This installer is for ARM-based Windows PCs. Download the x64 installer instead."
      Abort
    ${EndIf}
  !else
    ${If} ${IsNativeARM64}
      MessageBox MB_ICONEXCLAMATION "This is the x64 build. The ARM64 build runs faster on this PC."
    ${EndIf}
  !endif
  SetRegView 64
FunctionEnd

Function LaunchApp
  ; Start the app as the signed-in user, not with the installer's admin rights.
  Exec '"$WINDIR\explorer.exe" "$INSTDIR\Meridian.exe"'
FunctionEnd

Section "Meridian" SecMain
  ; Shortcuts for every account on this PC, not only the administrator.
  SetShellVarContext all
  SetOutPath "$INSTDIR"
  ; Stop a running service so its files can be replaced.
  IfFileExists "$INSTDIR\Meridian.exe" 0 +2
    nsExec::ExecToLog '"$INSTDIR\Meridian.exe" service stop'
  Sleep 1500
  File "${SRCDIR}\Meridian.exe"
  File "${SRCDIR}\wintun.dll"
  File "${SRCDIR}\LICENSE.txt"
  File /oname=meridian.ico "..\icons\icon.ico"
  WriteUninstaller "$INSTDIR\Uninstall.exe"

  CreateShortcut "$SMPROGRAMS\Meridian VPN.lnk" "$INSTDIR\Meridian.exe" "" "$INSTDIR\meridian.ico" 0
  CreateShortcut "$DESKTOP\Meridian VPN.lnk" "$INSTDIR\Meridian.exe" "" "$INSTDIR\meridian.ico" 0

  WriteRegStr HKLM "${UNINSTKEY}" "DisplayName" "Meridian VPN"
  WriteRegStr HKLM "${UNINSTKEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKLM "${UNINSTKEY}" "Publisher" "Meridian"
  WriteRegStr HKLM "${UNINSTKEY}" "DisplayIcon" "$INSTDIR\meridian.ico"
  WriteRegStr HKLM "${UNINSTKEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKLM "${UNINSTKEY}" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegDWORD HKLM "${UNINSTKEY}" "NoModify" 1
  WriteRegDWORD HKLM "${UNINSTKEY}" "NoRepair" 1
  WriteRegDWORD HKLM "${UNINSTKEY}" "EstimatedSize" 20000

  DetailPrint "Installing the Meridian service..."
  nsExec::ExecToLog '"$INSTDIR\Meridian.exe" service install'
  Pop $0
  ${If} $0 != 0
    MessageBox MB_ICONEXCLAMATION "The Meridian service could not be installed (code $0). Meridian will try again when you open it."
  ${EndIf}
SectionEnd

Section "Uninstall"
  SetRegView 64
  SetShellVarContext all
  nsExec::ExecToLog '"$INSTDIR\Meridian.exe" service uninstall'
  Sleep 1000
  Delete "$SMPROGRAMS\Meridian VPN.lnk"
  Delete "$DESKTOP\Meridian VPN.lnk"
  Delete "$INSTDIR\Meridian.exe"
  Delete "$INSTDIR\wintun.dll"
  Delete "$INSTDIR\LICENSE.txt"
  Delete "$INSTDIR\meridian.ico"
  Delete "$INSTDIR\Uninstall.exe"
  RMDir "$INSTDIR"
  DeleteRegKey HKLM "${UNINSTKEY}"
  MessageBox MB_YESNO "Also delete your saved locations and settings?" IDNO +2
    RMDir /r "$APPDATA\Meridian"
SectionEnd
