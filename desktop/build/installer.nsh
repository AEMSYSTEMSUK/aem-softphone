; The One MSP Phone (6 Nov 2026): list the app as a handler for tel: and callto: links. Without this it can't be picked in
; Windows Settings > Default apps when something else (Teams, Phone Link) already owns tel:. Windows won't let an app make
; itself the default, so the person still chooses it there. Per-user install, so SHELL_CONTEXT is HKCU.
!macro customInstall
  WriteRegStr SHELL_CONTEXT "Software\Classes\TheOneMSPPhone.Url" "" "The One MSP Phone link"
  WriteRegStr SHELL_CONTEXT "Software\Classes\TheOneMSPPhone.Url" "URL Protocol" ""
  WriteRegStr SHELL_CONTEXT "Software\Classes\TheOneMSPPhone.Url\DefaultIcon" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME},0"
  WriteRegStr SHELL_CONTEXT "Software\Classes\TheOneMSPPhone.Url\shell\open\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'
  WriteRegStr SHELL_CONTEXT "Software\TheOneMSPPhone\Capabilities" "ApplicationName" "The One MSP Phone"
  WriteRegStr SHELL_CONTEXT "Software\TheOneMSPPhone\Capabilities" "ApplicationDescription" "Calls from your desk phone or this computer"
  WriteRegStr SHELL_CONTEXT "Software\TheOneMSPPhone\Capabilities\URLAssociations" "tel" "TheOneMSPPhone.Url"
  WriteRegStr SHELL_CONTEXT "Software\TheOneMSPPhone\Capabilities\URLAssociations" "callto" "TheOneMSPPhone.Url"
  WriteRegStr SHELL_CONTEXT "Software\RegisteredApplications" "TheOneMSPPhone" "Software\TheOneMSPPhone\Capabilities"
!macroend

!macro customUnInstall
  DeleteRegValue SHELL_CONTEXT "Software\RegisteredApplications" "TheOneMSPPhone"
  DeleteRegKey SHELL_CONTEXT "Software\TheOneMSPPhone"
  DeleteRegKey SHELL_CONTEXT "Software\Classes\TheOneMSPPhone.Url"
!macroend
