# Test fixture provenance

## Original PowerPoint fixture

`tests/fixtures/powerpoint-original.pptx` was created for OpenDeck Studio from original project text and basic objects using the locally installed Microsoft PowerPoint COM object model on Windows. It is distributed under this repository's [MIT license](../LICENSE). It is not a copied customer document or a downloaded presentation template.

The package's application metadata identifies `Microsoft Office PowerPoint`, with `AppVersion` `16.0000`. That field does not identify an exact Office patch/build. The package contains two slides. Its SHA-256 at initial inclusion is:

```text
c5fd29eded9b36ee6eb68f74588c0462c0c15e574ea71f7de49387b495d34ed5
```

The fixture exercises presentation-order relationships, a title-layout placeholder, an explicitly positioned text box, an ellipse, a 3×2 table, and speaker notes. A title slide is moved before the initially created content slide, so a reader must follow the presentation's ordered relationships rather than assume filename order.

The authoring procedure is retained in `scripts/create-powerpoint-fixture.ps1`. It creates a new presentation without a visible window, writes original content, saves the dedicated fixture file, and closes that presentation. `scripts/sanitize-pptx-fixture.mjs` replaces author/editor profile fields with project attribution and clears company, manager, and hyperlink-base metadata before the fixture is redistributed.

To regenerate, on a Windows development machine with PowerPoint installed:

```powershell
powershell -File scripts/create-powerpoint-fixture.ps1
npm test -- src/pptx.test.ts
Get-FileHash -Algorithm SHA256 tests/fixtures/powerpoint-original.pptx
```

Regeneration can change timestamps, internal IDs, theme defaults, and ZIP bytes, so it is not expected to reproduce the same hash. Review the regenerated content and metadata, update the recorded hash, and rerun the assertions before committing it. The normal test suite reads the committed fixture and does not require PowerPoint, Windows, or COM.

PowerPoint authored this input fixture. That fact alone does **not** establish that OpenDeck's output files have been visually reviewed in PowerPoint. Import content/geometry assertions, schema validity, native editability, appearance, and playback remain separate evidence categories.

Separately, the original five-slide exported sample received a native PowerPoint open/render/save and saved-copy import check. Its exact scope and tested hash are recorded in [TESTING.md](TESTING.md).

## Original rich-text PowerPoint fixture

`tests/fixtures/powerpoint-rich-text.pptx` was authored specifically for OpenDeck Studio through the installed Microsoft PowerPoint COM object model on Windows. Its text and layout are original project content, distributed under the repository's [MIT license](../LICENSE). No customer presentation, external template, or third-party fixture was used. The example hyperlink points to `https://example.com/opendeck?from=fixture&mode=rich`; generation and verification did not navigate to it.

The package identifies `Microsoft Office PowerPoint`, with `AppVersion` `16.0000`. It contains two slides and has this SHA-256 at inclusion:

```text
d907c44a0c4b8fe5c7f79d055f7744fb69567fd8610a8b5ddba0cece09bb5f40
```

The first slide exercises mixed bold, italic, color, underline, font family and size, an external text hyperlink, paragraph alignment and before/after/line spacing, an empty paragraph, a soft line break, and speaker notes. The second exercises genuine DrawingML bullet and decimal-number lists, a nested bullet level, a numbered sequence beginning at 3, and notes. PowerPoint serializes the sequence's `startAt="3"` on each of its adjacent numbered paragraphs; the importer normalizes that representation to a start on the first paragraph and continuations thereafter.

The authoring script is `scripts/create-powerpoint-rich-fixture.ps1`. It creates only a new presentation, with no visible window, saves the dedicated fixture, and closes that presentation. The shared `scripts/sanitize-pptx-fixture.mjs` removes Office profile attribution and organization fields. The original fixture's generic core-properties title is intentional and contains no personal data; descriptive fixture content is in its slides and filename. Sanitization is followed by review before redistribution.

To regenerate the original input and run its import assertions:

```powershell
powershell -File scripts/create-powerpoint-rich-fixture.ps1
npm test -- src/pptx.test.ts
Get-FileHash -Algorithm SHA256 tests/fixtures/powerpoint-rich-text.pptx
```

The fixture is committed so regular CI can exercise it without Windows or Office. Regeneration changes timestamps, internal identifiers, and possibly installed Office defaults; inspect the content and metadata and update the hash after rerunning the assertions.

`scripts/generate-rich-example.mjs` imports this fixture into OpenDeck's supported model and generates the original derivative examples `examples/rich-text.opendeck` and `examples/rich-text.pptx`. At the recorded native verification, the rich-text export's SHA-256 was:

```text
5f105283e156f93433862fd40fa28bf0cc5a6df749da48b88050f9c7bb0f6338
```

`scripts/verify-rich-text-with-powerpoint.ps1` opens and renders the original and derivative, saves the derivative again in PowerPoint, and invokes `scripts/check-rich-office-roundtrip.mjs`. Both the semantic checks and the visual comparison's limitations are recorded in [TESTING.md](TESTING.md). Generated native render evidence is kept under ignored `test-results/rich-text-powerpoint/`; the public repository does not bundle a local Office profile or the ignored saved copy.

## Synthetic OOXML and generated round trips

`src/pptx.test.ts` also creates small OOXML packages in memory to isolate relationship ordering, malformed input, theme/layout inheritance, groups, and warning behavior. These synthetic packages deliberately focus on importer cases; they are not all complete, independently validated PowerPoint presentations.

Other tests export original OpenDeck model data through PptxGenJS and OpenDeck's DrawingML text writer, then import it back. These verify the application's supported subset, but the import and export implementations can share assumptions. The committed PowerPoint-authored fixtures add independent input sources; broader visual acceptance remains described in [TESTING.md](TESTING.md).

No third-party Open XML SDK fixture is included in this release.
