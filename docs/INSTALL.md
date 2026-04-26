# Installing CYLview-NG

CYLview-NG is a desktop app for viewing, measuring, styling, and exporting molecular structures. Normal users should install a release build from GitHub Releases; you do not need Rust, Node.js, Tauri, WSL, or any developer tooling.

Download releases here:

https://github.com/Summykai/CYLview-NG/releases

## Windows 10/11

1. Open the newest CYLview-NG release.
2. Download `CYLview-NG-setup.exe`.
3. Run the installer.
4. Launch **CYLview-NG** from the Start menu.

Alternative downloads:

- `CYLview-NG.msi` is useful for MSI-based installation workflows.
- `cylview-ng.exe` is a portable fallback if you do not want an installer.

### Windows first-launch note

Early open-source builds may be unsigned. If Windows SmartScreen appears, choose **More info** and then **Run anyway** only if you downloaded CYLview-NG from the official GitHub Releases page.

### Uninstall on Windows

Use **Settings** → **Apps** → **Installed apps**, find **CYLview-NG**, and choose **Uninstall**.

## Ubuntu / Debian Linux

1. Open the newest CYLview-NG release.
2. Download `CYLview-NG_1.0.0-rc.1_amd64.deb` or the newest matching `.deb`.
3. Install it from a terminal:

```bash
sudo apt install ./CYLview-NG_1.0.0-rc.1_amd64.deb
```

4. Launch **CYLview-NG** from your application menu, or run:

```bash
cylview-ng
```

### Linux alternatives

If an AppImage is published, mark it executable before running:

```bash
chmod +x CYLview-NG_*.AppImage
./CYLview-NG_*.AppImage
```

If a standalone `cylview-ng` binary is published, mark it executable before running:

```bash
chmod +x cylview-ng
./cylview-ng
```

### Uninstall on Ubuntu / Debian

```bash
sudo apt remove cylview-ng
```

## Basic Use

1. Click **Open File**.
2. Choose an `.xyz` or `.pdb` molecular structure.
3. Rotate with left-drag, pan with right-drag, and zoom with the scroll wheel.
4. Use **Measure** mode to click a bond for distance, three atoms for angle, or four atoms for dihedral.
5. Use **Style** to adjust element colours, atom visibility, selected atom styling, and visual bond styles.
6. Use **Poses** to save reusable camera views and **Files** to reopen recent files.
7. Click **Export PNG** to save the current view, including visible labels, as an image.

The desktop app also includes a standard menu bar. Use **File** → **Quit CYLview-NG** to close the app and **Help** → **About CYLview-NG** for version/about details. The **Edit**, **View**, and **Window** menus are scaffolded for future commands.

## File Safety

CYLview-NG treats molecule files as data only. It does not run scripts, shell commands, macros, or computational chemistry job directives embedded in `.xyz`, `.pdb`, or other selected files.

The current app supports XYZ and PDB files for normal opening. It may display inert metadata such as XYZ titles/energies, detected frame counts, PDB residue fields, and parser notes, but it still opens only the first structure frame/model in this release. To keep the desktop app responsive, files larger than 25 MB and structures larger than 5,000 atoms are rejected with a clear error.

## Troubleshooting

- **Windows says the app is unrecognized:** this usually means the build is unsigned. Only continue if the file came from the official GitHub Releases page.
- **Linux says the file is not executable:** run `chmod +x` on AppImage or standalone binary downloads.
- **Ubuntu/Debian cannot install the `.deb`:** run `sudo apt update`, then try the `sudo apt install ./CYLview-NG_..._amd64.deb` command again so apt can resolve dependencies.
- **The app does not open on Linux:** install system WebView/runtime packages for Tauri apps, then retry. On Ubuntu/Debian, the contributor dependency list in `CONTRIBUTING.md` includes the relevant GTK/WebKit packages.
- **A molecule file does not appear in the picker:** CYLview-NG currently advertises `.xyz` and `.pdb`. Use **All Files** only if you know the file is one of those supported formats with a non-standard extension.
- **A file is rejected as too large:** reduce the structure size or split trajectories into individual structures. Large trajectory workflows are planned separately.
