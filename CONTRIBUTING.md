# Contributing to OpenDeck Studio

OpenDeck is an early-stage, original presentation editor. Useful contributions include reproducible compatibility cases, accessibility fixes, editor interactions, documentation corrections, and small features with explicit limitations.

## Development

1. Fork and clone the repository.
2. Install Node.js 22.12 or later, then run `npm ci`.
3. Run `npm run dev` to start the editor.
4. Make a focused change.
5. Run `npm test` and `npm run build` before opening a pull request.

Use TypeScript's existing document types. Keep document data serializable. UI-only state, such as the active selection or open panel, should not become part of a saved deck without a deliberate schema decision.

## Pull requests

Describe the user-visible problem, the resulting behavior, and how you checked it. Include a before/after screenshot for a substantial visual change. Tests should protect meaningful behavior: undo/redo invariants, import boundaries, transform calculations, document validation, and exported package structure are particularly valuable.

Keep dependency changes intentional and include `package-lock.json`. Update the compatibility matrix whenever a format feature changes. Do not describe a feature as lossless or fully compatible without evidence across independent input files and applications.

Use the [testing checklist](docs/TESTING.md) for browser workflows and file-format acceptance. A jsdom interaction test verifies application logic; it does not establish rendered layout, browser printing, or fullscreen behavior.

## Interoperability work

Base implementation work on public specifications and independently created test documents. Do not submit proprietary application code, leaked materials, confidential decks, restricted fonts, or assets you cannot redistribute.

For a file-format bug, include:

- A minimal synthetic deck that demonstrates the issue.
- The authoring application and version, if known.
- The expected result and the observed result.
- Whether the issue occurs on import, editing, export, or re-opening the export.
- Screenshots when positioning or appearance is involved.

An exported file opening successfully is only one check. Native editability, preserved content, appearance, and presentation behavior are distinct requirements.

## Community and licensing

Be specific, respectful, and constructive. Critique the behavior or implementation, not the person. Contributions are accepted under the repository's MIT license; maintain the attribution and license requirements of any third-party material.

For potential vulnerabilities, follow [SECURITY.md](SECURITY.md) instead of posting sensitive details in a public issue.
