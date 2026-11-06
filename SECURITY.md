# Security policy

## Supported versions

OpenDeck Studio is alpha software. Security fixes target the latest `main` branch and the latest release; older alpha releases are not maintained independently.

## Reporting a vulnerability

Use the repository's **Security → Report a vulnerability** option when private reporting is enabled. If that option is unavailable, open an issue asking for a private reporting channel without including exploit details, private documents, credentials, or personal data. There is no guaranteed response time or bug bounty.

A useful report identifies the affected version, reproduction steps, browser, expected impact, and a minimal synthetic file when a document parser is involved.

## Application boundaries

OpenDeck is a client-side editor with no application backend or sign-in. The static host still serves JavaScript to your browser; use a deployment you trust or self-host. Browser persistence is not encrypted storage and is not a backup.

Imported documents and images are untrusted input. Changes to file handling must preserve bounds on input sizes, reject malformed data, and avoid interpreting document text as executable HTML. Do not execute macros, embedded OLE programs, or other document-supplied code. External relationships must not become automatic network requests.

The browser parser is not a sandbox for malicious archives. Report parser crashes, excessive decompression, script execution, unexpected external requests, or disclosure of local document data as potential security issues. Keep application dependencies current and review dependency updates before publishing a deployment.
