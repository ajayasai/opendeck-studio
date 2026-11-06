# OpenDeck Studio

An open-source presentation studio for the browser. Create slides, keep your files locally, and exchange editable content through PowerPoint's PPTX format.

**Status: 0.1 alpha.** OpenDeck is an original implementation with a focused editor and partial PPTX compatibility. It is not a complete replacement for every PowerPoint workflow. The [compatibility matrix](docs/COMPATIBILITY.md) states the boundaries; the [roadmap](docs/ROADMAP.md) tracks the work ahead.

[Try the public demo](https://ajayasai.github.io/opendeck-studio/) · [Download the release](https://github.com/ajayasai/opendeck-studio/releases) · [Testing evidence](docs/TESTING.md)

![Original OpenDeck sample rendered by Microsoft PowerPoint 16.0](docs/assets/field-notes-powerpoint.png)

The original [sample deck](examples/field-notes.pptx) above was exported by OpenDeck and rendered by PowerPoint 16.0. Its editable objects, notes, and text also passed a PowerPoint save-and-reimport check. This verifies this sample, not all PowerPoint features.

## Run locally

Use Node.js 22.12 or later and npm.

```sh
git clone https://github.com/ajayasai/opendeck-studio.git
cd opendeck-studio
npm ci
npm run dev
```

Open the localhost address printed by Vite. No account, API key, or backend is required.

```sh
npm test        # automated regression tests
npm run build  # TypeScript check and production bundle
npm run preview
```

## What the alpha focuses on

- A slide canvas with selectable text, shapes, images, tables, and charts.
- Slide organization, five visual themes, reusable layouts, speaker notes, and presentation playback.
- Object alignment, layer ordering, grid snapping, keyboard shortcuts, and a slide sorter.
- Fullscreen presenting with a timer, notes panel, next-slide preview, laser pointer, and blackout control.
- Browser printing and Save as PDF through the browser's print dialog.
- Local editing, undo/redo, browser persistence, a searchable presentation library, and a portable native JSON document.
- Editable PPTX export and a deliberately limited PPTX importer with compatibility warnings.
- A small, understandable TypeScript codebase that contributors can extend and self-host.

Formatting is currently per text box, rather than per rich-text run. Tables and charts use simplified models. Advanced PowerPoint content can change or disappear during import/export; keep the original file and review the result before relying on it.

## Your files

The application runs in your browser and does not require a document-upload service. Browser storage belongs to the browser profile and the exact site origin. Clearing site data, changing the hosting address, or using private browsing can make saved work unavailable. Download native JSON backups for work you want to keep; PPTX is an interchange format, not a lossless OpenDeck backup.

Use **File → My presentations** to reopen saved decks. Autosave keeps separate presentations by document ID, so creating a new deck does not intentionally replace the previous deck's library entry. The library is not version history: opening a native backup with the same document ID updates that presentation when saved.

You can edit without an internet connection after the application and its assets are loaded. For predictable offline access, run the built files on a local static server. This release does not install a PWA or guarantee that a hosted page will reopen offline.

## Self-host

Run `npm run build`, then serve the `dist` directory with any static HTTP server. Asset URLs are relative, so deployment under a repository subpath is supported. Do not rely on opening `dist/index.html` directly with a `file://` URL.

The included GitHub Pages workflow builds and tests `main` before deploying. In a fork, select **Settings → Pages → Build and deployment → GitHub Actions** before the first deployment. CI also runs on pull requests.

## Contribute

Start with [CONTRIBUTING.md](CONTRIBUTING.md), the [architecture](docs/ARCHITECTURE.md), and the [roadmap](docs/ROADMAP.md). Compatibility fixes should include a small, shareable fixture and a clear account of what is preserved or lost. The [testing checklist](docs/TESTING.md) separates automated coverage from browser and presentation-application checks that still require verification.

OpenDeck uses React, TypeScript, Vite, Lucide, JSZip, and PptxGenJS. Their licenses remain applicable to their respective components. See [third-party notices](public/third-party-notices.txt), [LICENSE](LICENSE) for OpenDeck's MIT license, and [SECURITY.md](SECURITY.md) for reporting security issues.

OpenDeck Studio is independent of Microsoft. PowerPoint is a Microsoft trademark; its name is used here to identify the file format and interoperability target.
