# Installing Cylform

Cylform is a desktop app for viewing, measuring, styling, and exporting molecular structures. Normal users should install a release build from GitHub Releases; you do not need Rust, Node.js, Tauri, WSL, or any developer tooling.

Download releases from the project’s GitHub Releases page. During private release preparation, this may be the personal/private repository; after publication, use the official public repository.

## Windows 10/11

1. Open the newest Cylform release.
2. Download `Cylform-setup.exe`.
3. Run the installer.
4. Launch **Cylform** from the Start menu.

Alternative downloads:

- `cylform.exe` is a portable fallback if you do not want an installer.
- Stable releases may also include `Cylform.msi` for MSI-based installation workflows.

### Windows first-launch note

Early open-source builds may be unsigned. If Windows SmartScreen appears, choose **More info** and then **Run anyway** only if you downloaded Cylform from the official GitHub Releases page.

### Uninstall on Windows

Use **Settings** → **Apps** → **Installed apps**, find **Cylform**, and choose **Uninstall**.

## Ubuntu / Debian Linux

1. Open the newest Cylform release.
2. Download the newest `Cylform_*_amd64.deb` release asset.
3. Install it from a terminal:

```bash
sudo apt install ./Cylform_*_amd64.deb
```

4. Launch **Cylform** from your application menu, or run:

```bash
cylform
```

### Linux alternatives

If an AppImage is published, mark it executable before running:

```bash
chmod +x Cylform_*.AppImage
./Cylform_*.AppImage
```

If a standalone `cylform` binary is published, mark it executable before running:

```bash
chmod +x cylform
./cylform
```

### Uninstall on Ubuntu / Debian

```bash
sudo apt remove cylform
```

## macOS (Apple Silicon)

1. Open the newest Cylform release.
2. Download `Cylform_*_aarch64.dmg`.
3. Open the DMG and drag **Cylform** into your **Applications** folder.
4. Launch **Cylform** from Launchpad or Spotlight.

### macOS first-launch note

Early open-source builds are not code-signed. If Gatekeeper shows a warning on first launch, right-click the app and choose **Open**, or go to **System Settings → Privacy & Security** and click **Open Anyway**.

### Uninstall on macOS

Drag **Cylform** from **Applications** to the Trash, then empty the Trash.

## Basic Use

1. Click **Open File**, use **File → Open File…**, or drag molecule files onto the Cylform window.
2. Choose or drop an `.xyz` or `.pdb` molecular structure.
3. Rotate with left-drag, pan with right-drag, and zoom with the scroll wheel.
4. Use **Measure** mode to click a bond for distance, three atoms for angle, or four atoms for dihedral.
5. Use **Style** to adjust element colours, atom visibility, selected atom styling, and visual bond styles.
6. Use the top molecule tabs to switch between open structures, and use **Open Recent** in the tab bar or **File → Open Recent…** to reopen recent files. Dropping files onto an existing session adds background tabs and keeps the current active view in place.
7. Use **Poses** to save reusable camera views for the current molecule, then add important views to the global **Pose Library**.
8. Use the **View** overlay to switch between CYLview and Houkmol material presets when preparing figures.
9. Click **Export PNG** or use **File → Export PNG…** to save the current view, including visible annotations, as an image.
10. Use **File → Settings…** to configure export scale, default appearance, measurement precision, shortcuts, autosave, session restore, drag/drop behavior, recent-file limits, and app-data diagnostics.

See [Keyboard shortcuts](KEYBOARD_SHORTCUTS.md) for the current default shortcuts. `H` cycles hydrogen visibility only; Houkmol is selected from the material preset controls.

The desktop app also includes a standard menu bar. Use **File** for opening, recent files, closing the current molecule tab, export, Settings, and quitting. **View → Open DevTools** is for local development builds; release builds without DevTools support report that it is unavailable, and the Settings diagnostics section can disable the DevTools menu action. **Help → About Cylform** shows version/about details.

## File Safety

Cylform treats molecule files as data only. It does not run scripts, shell commands, macros, or computational chemistry job directives embedded in `.xyz`, `.pdb`, or other selected files.

The current app supports XYZ and PDB files for normal opening. It may display inert metadata such as XYZ titles/energies, detected frame counts, PDB residue fields, and parser notes, but it still opens only the first structure frame/model in this release. To keep the desktop app responsive, files larger than 25 MB and structures larger than 50,000 atoms are rejected with a clear error.

## Troubleshooting

- **Windows says the app is unrecognized:** this usually means the build is unsigned. Only continue if the file came from the official GitHub Releases page.
- **Linux says the file is not executable:** run `chmod +x` on AppImage or standalone binary downloads.
- **Ubuntu/Debian cannot install the `.deb`:** run `sudo apt update`, then try the `sudo apt install ./Cylform_..._amd64.deb` command again so apt can resolve dependencies.
- **The app does not open on Linux:** install system WebView/runtime packages for Tauri apps, then retry. On Ubuntu/Debian, the contributor dependency list in `CONTRIBUTING.md` includes the relevant GTK/WebKit packages.
- **A molecule file does not appear in the picker or is ignored on drop:** Cylform advertises and accepts the extensions supported by its built-in parser registry. Current release builds support `.xyz` and `.pdb`. Use **All Files** only if you know the file is one of those supported formats with a non-standard extension.
- **A file is rejected as too large:** reduce the structure size or split trajectories into individual structures. Large trajectory workflows are planned separately.
