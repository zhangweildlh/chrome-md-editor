# Changelog

All notable changes to this project are documented in this file.

Format based on Keep a Changelog.
Project uses Semantic Versioning.

## [1.3.0] - 2026-07-13

### Added

- Multi-instance editors: each toolbar click / each local `.md` open gets its own tab (`?i=` + per-instance storage keys) — thanks [@zhangweildlh](https://github.com/zhangweildlh) (PR #4 / Issue #3)
- Style toolbar: center/bold/color, highlight, font face/size presets; superscript and subscript
- Session restore: reopen the extension restores last edited content and filename (Issue #2; FileSystemHandle cannot persist, so Save may ask for a path again)
- Richer first-run help tips for common Markdown / HTML snippets

### Fixed

- Preview WYSIWYG round-trip: normalize extra blank lines and preserve `<mark>/<center>/<font>/<span>/<sup>/<sub>` when syncing back to source (helps Issue #1 path/style corruption)
- Local image preview and original `src` preservation remain in place from 1.2.0 (Issue #1)

### Changed

- Extension and package version aligned to **1.3.0**

## [1.2.0] - 2026-07-13

### Added

- Local image preview for relative paths when a folder or `file://` context is available
- Paste image into the editor: writes to sibling `images/` when folder write access exists, otherwise embeds a data URL
- First-run onboarding overlay (drag file / open folder / open example)
- Feedback entry in the status bar linking to GitHub Issues
- Reproducible icon pipeline (`npm run icons`) and Markdown-recognizable toolbar icons
- Unit tests for image path resolution and preview link safety (`npm test`)
- Pack script: `npm run pack` builds and produces `chrome-md-editor-v*.zip` with a nested `dist/` folder

### Fixed

- Preview-pane links open reliably while the preview stays contenteditable for WYSIWYG
- Preserve original Markdown image sources when syncing WYSIWYG preview back to source (avoids writing blob URLs into the document)
- Addresses user report of local images not rendering and path corruption after preview edit (see GitHub Issue #1; please re-test on 1.2.0 before closing)

### Changed

- README quick start and installation guidance oriented around GitHub Releases
- Aligned `package.json` version with `manifest.json` at **1.2.0**

### Notes

- GitHub previously only published **v1.0.0** while `main` already contained the above work. This release closes that distribution gap.
- There was no separate public **v1.1.0** tag. DEVLOG mentions 1.1.0 during content-script work; that stream is included here under 1.2.0.

## [1.0.0] - 2026-02-28

### Added

- Initial Chrome extension (Manifest V3) Markdown editor
- CodeMirror 6 source editing, markdown-it preview, Mermaid diagrams
- WYSIWYG editing in the preview pane
- File System Access open/save and project folder sidebar
- `file://` content script intercept for local `.md` files
- Light/dark themes and split / editor / preview layouts
