import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { WINDOWS_INSTALLER } from './assets.mjs';

// Nothing on a developer machine or in a pull request can run makensis (it is only installed in the Windows build job), so these
// tests read the installer definition and hold it to the decisions of docs/operations/ci-and-releases.md#the-windows-setup-program that a later edit could quietly undo.
const repository = fileURLToPath(new URL('../..', import.meta.url));
const installerDir = 'src/studio/desktop/build/windows/installer';
const definition = readFileSync(join(repository, installerDir, 'project.nsi'), 'utf8').replace(/\r\n/g, '\n');
const wailsConfig = JSON.parse(readFileSync(join(repository, 'src/studio/desktop/wails.json'), 'utf8'));

// The code of the definition without its comments and the sentences it shows the narrator.
const code = definition
  .split('\n')
  .filter((line) => !/^\s*#/.test(line))
  .join('\n');
const define = (name) => code.match(new RegExp(`^\\s*!define ${name} "([^"]*)"`, 'm'))?.[1];
const uninstallSection = code.slice(code.indexOf('Section "uninstall"'), code.lastIndexOf('SectionEnd'));
const gitCheckIgnore = (path) => spawnSync('git', ['check-ignore', '-q', path], { cwd: repository }).status;

test('the setup file has the unversioned release name the pipeline collects', () => {
  assert.equal(define('SETUP_FILE'), WINDOWS_INSTALLER);
  assert.match(code, /^OutFile "\.\.\\\.\.\\bin\\\$\{SETUP_FILE\}"/m);
});

test('the installed program is narration-studio.exe, the name the launcher and the updater look for', () => {
  assert.equal(define('PRODUCT_EXECUTABLE'), `${wailsConfig.outputfilename}.exe`);
  assert.equal(define('PRODUCT_EXECUTABLE'), 'narration-studio.exe');
});

test('the install is per user: no elevation, an install folder in the profile and an uninstall entry under HKCU', () => {
  assert.equal(define('WAILS_INSTALL_SCOPE'), 'user');
  assert.equal(define('REQUEST_EXECUTION_LEVEL'), 'user');
  assert.match(code, /^InstallDir "\$LOCALAPPDATA\\Programs\\/m);
  assert.doesNotMatch(code, /PROGRAMFILES|HKLM|"admin"|SetShellVarContext all/i);
});

test('a value Wails passes on the makensis command line is kept, not defined a second time', () => {
  for (const name of ['WAILS_INSTALL_SCOPE', 'REQUEST_EXECUTION_LEVEL']) {
    assert.match(code, new RegExp(`^!ifndef ${name}\\n\\s+!define ${name} "user"\\n!endif`, 'm'), name);
  }
});

test('the publisher, product name and version come from wails.json through wails_tools.nsh, not from this file', () => {
  assert.equal(define('INFO_COMPANYNAME'), undefined);
  assert.equal(define('INFO_PRODUCTNAME'), undefined);
  assert.equal(define('INFO_PRODUCTVERSION'), undefined);
  assert.ok(wailsConfig.info.companyName && wailsConfig.info.productName && /^\d+\.\d+\.\d+$/.test(wailsConfig.info.productVersion));
  assert.match(code, /^!include "wails_tools\.nsh"/m);
  assert.match(code, /^VIProductVersion "\$\{INFO_PRODUCTVERSION\}\.0"/m);
});

test('the Start Menu entry is always made and the desktop shortcut is its own choice', () => {
  const sections = code.match(/^Section [^\n]*$/gm);
  assert.deepEqual(sections, ['Section "${INFO_PRODUCTNAME} (required)"', 'Section "Desktop shortcut"', 'Section "uninstall"']);
  assert.match(code, /!insertmacro MUI_PAGE_COMPONENTS/);
  const [program, desktop] = code.split(/^Section /m).slice(1);
  assert.match(program, /SectionIn RO/);
  assert.match(program, /CreateShortcut "\$SMPROGRAMS\\/i);
  assert.doesNotMatch(program, /\$DESKTOP/);
  assert.match(desktop, /CreateShortCut "\$DESKTOP\\/i);
});

// Audacity cannot start a program itself (docs/research/audacity-launcher-feasibility.md), so the Audacity launcher is a Start Menu
// entry beside the app's own. It passes exactly `--daw Audacity`: no project path and nothing
// else, since the narrator picks the project in the app.
test('the Start Menu always gets a "for Audacity" entry that starts the program with --daw Audacity and nothing else', () => {
  const [program, desktop] = code.split(/^Section /m).slice(1);
  const shortcuts = [...program.matchAll(/^\s*CreateShortcut (.+)$/gim)].map((match) => match[1].trim());
  assert.deepEqual(shortcuts, [
    '"$SMPROGRAMS\\${INFO_PRODUCTNAME}.lnk" "$INSTDIR\\${PRODUCT_EXECUTABLE}"',
    '"$SMPROGRAMS\\${INFO_PRODUCTNAME} for Audacity.lnk" "$INSTDIR\\${PRODUCT_EXECUTABLE}" "--daw Audacity"',
  ]);
  assert.doesNotMatch(desktop, /Audacity/);
});

test('the WebView2 runtime is checked for and only installed when it is missing', () => {
  assert.match(code, /!insertmacro wails\.webview2runtime/);
});

test('the uninstaller removes the program, the copies the updater leaves and the shortcuts, and nothing else', () => {
  const deleted = [...uninstallSection.matchAll(/^\s*Delete "([^"]+)"/gm)].map((match) => match[1]);
  assert.deepEqual(deleted, [
    '$INSTDIR\\${PRODUCT_EXECUTABLE}',
    '$INSTDIR\\${PRODUCT_EXECUTABLE}.new',
    '$INSTDIR\\${PRODUCT_EXECUTABLE}.old',
    '$INSTDIR\\${PRODUCT_EXECUTABLE}.failed',
    '$SMPROGRAMS\\${INFO_PRODUCTNAME}.lnk',
    '$SMPROGRAMS\\${INFO_PRODUCTNAME} for Audacity.lnk',
    '$DESKTOP\\${INFO_PRODUCTNAME}.lnk',
  ]);
});

test('the uninstaller never removes a folder recursively, so a folder the narrator chose keeps its other contents', () => {
  assert.doesNotMatch(uninstallSection, /RMDir\s+\/r/i);
  assert.match(uninstallSection, /^\s*RMDir "\$INSTDIR"$/m);
});

test('the uninstaller leaves settings, the asset cache, the WebView2 data and project sidecars alone', () => {
  const touchesUserData =
    /\$(APPDATA|LOCALAPPDATA|DOCUMENTS|PROFILE)|%APPDATA%|%LOCALAPPDATA%|narration-studio"|RMDir\s+\/r|DeleteRegKey\s+HKCU\s+"Software\\Narration/i;
  const withoutMessages = uninstallSection
    .split('\n')
    .filter((line) => !/^\s*DetailPrint /.test(line))
    .join('\n');
  assert.doesNotMatch(withoutMessages, touchesUserData);
  assert.match(uninstallSection, /DetailPrint "Left in place: [^"]*%APPDATA%\\narration-studio[^"]*%LOCALAPPDATA%\\narration-studio/);
});

test('the uninstall page tells the narrator what is left behind before anything is removed', () => {
  assert.match(definition, /!define MUI_UNCONFIRMPAGE_TEXT_TOP "[^"]*%APPDATA%\\narration-studio[^"]*%LOCALAPPDATA%\\narration-studio[^"]*project folders/);
  assert.match(code, /!insertmacro MUI_UNPAGE_CONFIRM/);
});

test('the installer makes no network request of its own', () => {
  assert.doesNotMatch(code, /inetc|NSISdl|nsisdl|InetLoad|https?:\/\/|ExecWait|Exec |ExecShell /i);
});

test('the installer signs nothing: signing is an owner decision, so no workflow signs it', () => {
  assert.doesNotMatch(definition, /^\s*!(finalize|uninstfinalize)|signtool/im);
});

// Git ignores everything in build/windows except what is listed (.gitignore). The definition has to be tracked or the release build
// would have no definition to compile; the rendered wails_tools.nsh and the bootstrapper the wails3 CLI writes beside it must not be.
test('git tracks the definition and ignores what Wails generates beside it', () => {
  assert.equal(gitCheckIgnore(`${installerDir}/project.nsi`), 1, 'project.nsi must not be ignored');
  assert.equal(gitCheckIgnore(`${installerDir}/wails_tools.nsh`), 0, 'wails_tools.nsh is generated and must stay ignored');
  assert.equal(gitCheckIgnore(`${installerDir}/MicrosoftEdgeWebview2Setup.exe`), 0, 'the bootstrapper is written by the build and must stay ignored');
});

// legacy.nsh is the installer's half of the one-time move from the product's name before the rename (internal/legacyname is the
// app's): an install over an old one takes its folder and replaces it, and touches nothing of the narrator's.
const legacy = readFileSync(join(repository, installerDir, 'legacy.nsh'), 'utf8').replace(/\r\n/g, '\n');
const legacyCode = legacy
  .split('\n')
  .filter((line) => !/^\s*#/.test(line))
  .join('\n');
const legacyMacro = (name) => legacyCode.slice(legacyCode.indexOf(`!macro ${name}`), legacyCode.indexOf('!macroend', legacyCode.indexOf(`!macro ${name}`)));

test('an install over one from before the rename takes its folder and replaces it', () => {
  assert.match(code, /^!include "legacy\.nsh"$/m);
  assert.equal(gitCheckIgnore(`${installerDir}/legacy.nsh`), 1, 'legacy.nsh must not be ignored');
  assert.match(code.slice(code.indexOf('Function .onInit'), code.indexOf('FunctionEnd')), /!insertmacro legacy\.adoptInstallDir/);
  const installSection = code.slice(code.indexOf('Section "${INFO_PRODUCTNAME} (required)"'), code.indexOf('SectionEnd'));
  assert.ok(
    installSection.indexOf('!insertmacro legacy.removeOldInstall') > installSection.indexOf('wails.writeUninstaller'),
    'the old entry goes only after the new uninstaller is written',
  );
  // The folder is adopted only when this product has no entry of its own yet.
  assert.match(legacyMacro('legacy.adoptInstallDir'), /ReadRegStr \$0 HKCU "\$\{UNINST_KEY\}" "InstallLocation"\n\s*\$\{If\} \$0 == ""/);
});

test('removing the old install touches only that install, and only when it is the folder just installed into', () => {
  const remove = legacyMacro('legacy.removeOldInstall');
  assert.match(remove, /\$\{AndIf\} \$0 == \$INSTDIR/);
  for (const line of remove.split('\n').filter((l) => /^\s*(Delete|DeleteRegKey|RMDir)\b/.test(l))) {
    assert.match(line, /^\s*(Delete "\$(INSTDIR|SMPROGRAMS|DESKTOP)\\[^"]+"|DeleteRegKey HKCU "\$\{LEGACY_UNINST_KEY\}")$/, line);
  }
  assert.match(legacyCode, /^!define LEGACY_UNINST_KEY "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\[A-Za-z]+"$/m);
  assert.doesNotMatch(legacyCode, /\$(APPDATA|LOCALAPPDATA|DOCUMENTS|PROFILE)|RMDir|inetc|NSISdl|https?:\/\/|\bExec(Wait|Shell)?\s/i);
});
