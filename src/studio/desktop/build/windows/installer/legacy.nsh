## An install made before the product was renamed. project.nsi includes this file; scripts/ci/old-name.mjs allows the old name
## here and nowhere else in the installer.
##
## Before the rename the uninstall entry was HKCU\...\Uninstall\NarrationUtils and the program narration-utils.exe. An install over
## one takes its folder, removes the old program and the entries that start it, and drops the old uninstall entry, whose
## uninstall.exe the new one has just replaced. An old install in another folder is left as it is, entry and all, for the
## narrator to remove from Installed apps. Nothing here touches the narrator's settings, downloads or projects.

!include "LogicLib.nsh"

!define LEGACY_UNINST_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\NarrationUtils"
!define LEGACY_EXECUTABLE "narration-utils.exe"

# In .onInit: with no entry of its own yet, the install goes into the old install's folder.
!macro legacy.adoptInstallDir
    ReadRegStr $0 HKCU "${UNINST_KEY}" "InstallLocation"
    ${If} $0 == ""
        ReadRegStr $0 HKCU "${LEGACY_UNINST_KEY}" "InstallLocation"
        ${If} $0 != ""
            StrCpy $INSTDIR $0
        ${EndIf}
    ${EndIf}
!macroend

# In the install section, after the new program and uninstaller are written.
!macro legacy.removeOldInstall
    ReadRegStr $0 HKCU "${LEGACY_UNINST_KEY}" "InstallLocation"
    ${If} $0 != ""
    ${AndIf} $0 == $INSTDIR
        Delete "$INSTDIR\${LEGACY_EXECUTABLE}"
        Delete "$INSTDIR\${LEGACY_EXECUTABLE}.new"
        Delete "$INSTDIR\${LEGACY_EXECUTABLE}.old"
        Delete "$INSTDIR\${LEGACY_EXECUTABLE}.failed"
        Delete "$SMPROGRAMS\Narration Utils.lnk"
        Delete "$SMPROGRAMS\Narration Utils for Audacity.lnk"
        Delete "$DESKTOP\Narration Utils.lnk"
        DeleteRegKey HKCU "${LEGACY_UNINST_KEY}"
        DetailPrint "Replaced the install from before the rename in $INSTDIR."
    ${EndIf}
!macroend
