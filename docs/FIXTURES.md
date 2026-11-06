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

## Synthetic OOXML and generated round trips

`src/pptx.test.ts` also creates small OOXML packages in memory to isolate relationship ordering, malformed input, theme/layout inheritance, groups, and warning behavior. These synthetic packages deliberately focus on importer cases; they are not all complete, independently validated PowerPoint presentations.

Other tests export original OpenDeck model data through PptxGenJS and import it back. These verify the application's supported subset, but the import and export implementations can share assumptions. The committed PowerPoint-authored fixture adds an independent input source; broader visual acceptance remains described in [TESTING.md](TESTING.md).

No third-party Open XML SDK fixture is included in this release.
