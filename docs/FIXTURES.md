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

## Original text-frame fixture and separate probes

`tests/fixtures/powerpoint-text-frame.pptx` contains six original slides authored through Microsoft PowerPoint COM on Windows. It exercises asymmetric/zero margins, mixed font sizes, top/middle/bottom anchors, wrap/nowrap, hard/soft breaks, genuine layout inheritance, and two content placeholders that share a master body placeholder despite different indexes. Rectangle marker objects show text-box boundaries. Autofit is disabled in these geometry cases. The installed PowerPoint reported version `16.0`; the executable product version recorded for this run was `16.0.20527.20150`.

The authoring script is `scripts/create-powerpoint-text-frame-fixture.ps1`. It also retains `powerpoint-text-frame-attached-outline-probe.pptx`, the original COM-authored form with borders attached directly to text boxes, to reproduce the known decoration omission. Shared sanitation replaces Office profile metadata with project attribution. All fixture content is original and distributed under the repository's MIT license.

COM rejected the attempted negative-margin assignments, leaving the source defaults unchanged. `scripts/prepare-text-frame-probe.mjs` therefore creates the separate `powerpoint-text-frame-clip-probe.pptx` by changing only selected `a:bodyPr` attributes in a copy of the original. It sets signed insets and horizontal/vertical clip flags. This probe is **XML-derived, not directly PowerPoint-authored**, although PowerPoint subsequently opened and rendered it. The script records every changed attribute and verifies the genuine inheritance cases.

Frozen SHA-256 values for this milestone:

| File                                                | SHA-256                                                            |
| --------------------------------------------------- | ------------------------------------------------------------------ |
| `powerpoint-text-frame.pptx`                        | `a9fb9ff78744aee60050b25e17e2c182a37b17fa6163ba09424cef79353ae480` |
| `powerpoint-text-frame-clip-probe.pptx`             | `9a5dfb7572e6b0a18e380384d51ba22dc9644a7fe563c6b631695e18501843b9` |
| `powerpoint-text-frame-attached-outline-probe.pptx` | `067b9739e7ef0d7f422d0d6b25dfa9e4e1a2f97adaff0d5081ec018b6020295d` |
| `examples/text-frame.pptx`                          | `59429c71e92059864c526e0179e7052e8fe36a03162e362f750d9356d14bd01a` |

Generate and verify the committed inputs without recreating them:

```powershell
node scripts/generate-text-frame-example.mjs
powershell -File scripts/verify-text-frame-with-powerpoint.ps1
```

The generator writes `examples/text-frame.opendeck` and its PPTX export, plus an ignored probe export. Native outputs, properties, provenance and round-trip assertions go under `test-results/text-frame-powerpoint/`. Regeneration changes package bytes; update hashes only after inspecting and rechecking the regenerated files. Normal CI reads the committed fixtures without Office.

The semantic and visual findings are recorded in [TESTING.md](TESTING.md). The original and XML-derived paths establish different kinds of evidence; neither establishes full text-layout equivalence.

## Original AutoFit fixture and saved-scale probe (alpha.4)

`tests/fixtures/powerpoint-autofit.pptx` contains seven original slides and 29 text frames authored through the installed Microsoft PowerPoint COM object model. It is project content distributed under the repository's [MIT license](../LICENSE), with no customer document or external template. The native run reported PowerPoint `16.0`, executable product version `16.0.20527.20150`. The package application metadata reports `Microsoft Office PowerPoint` and `AppVersion` `16.0000`; the executable version is separate run evidence.

`scripts/create-powerpoint-autofit-fixture.ps1` creates a new presentation without a visible window, authors plain and mixed-font text, lists, paragraph spacing, fixed-point line spacing, normal/no/shape AutoFit choices, wrapping, anchors, and rotated resize controls, then closes only that presentation. Separate rectangle markers show the shape bounds. The shared sanitizer replaces Office profile attribution with project metadata before redistribution.

In this windowless COM workflow, setting normal AutoFit **did not calculate saved shrink factors**: PowerPoint wrote bare `a:normAutofit` elements, and the oversized control text remained full-size. The original is evidence for the authored choices and default factors, not an independently calculated shrink algorithm. Shape AutoFit did resize its container immediately.

`scripts/prepare-autofit-probe.mjs` creates the separately attributed `powerpoint-autofit-saved-scale-probe.pptx` by changing AutoFit choices and attributes in a copy of that sanitized original. It supplies known font scales and line-spacing reductions, integer and percentage-string encodings, and genuine inherited normal AutoFit with a neighboring explicit no-AutoFit override. Nominal run sizes, paragraph spacing, text, lists, and saved shape geometry remain unchanged. This is an **XML-derived probe, not a directly PowerPoint-authored saved-scale fixture**. PowerPoint subsequently opened, rendered, and saved it. The script records its exact changes in ignored provenance JSON.

Frozen SHA-256 values:

| File                                                       | SHA-256                                                            |
| ---------------------------------------------------------- | ------------------------------------------------------------------ |
| `tests/fixtures/powerpoint-autofit.pptx`                   | `25a7e92c1003af1f3f0ff9a01d7a1a94feb18ae7fd45cebec42a8e9bf175df17` |
| `tests/fixtures/powerpoint-autofit-saved-scale-probe.pptx` | `e2bed4427a4dd064fffe02d9e5a03794a035ce83586edea94040d7fdaa1172eb` |
| `examples/autofit.pptx`                                    | `3a2663395e8705b1d556e5d551baf0b4432edef3fb32c2e8529e67f885d119ad` |

The public `examples/autofit.opendeck` and `.pptx` are OpenDeck derivatives of the **XML-derived saved-scale probe** so the example includes visible shrinking. The original COM baseline takes a separate export path under ignored `test-results/autofit-powerpoint/original-exported.*`; its tested PPTX hash is recorded in [TESTING.md](TESTING.md).

To reproduce export and native acceptance using the committed inputs:

```powershell
node scripts/generate-autofit-example.mjs
powershell -File scripts/verify-autofit-with-powerpoint.ps1
node scripts/check-autofit-office-roundtrip.mjs
```

To intentionally recreate the input fixtures instead, run `create-powerpoint-autofit-fixture.ps1` followed by `node scripts/prepare-autofit-probe.mjs`, then repeat the import tests and native acceptance. Regeneration changes package bytes and may depend on Office defaults. Review content, sanitized metadata, and new hashes before replacing either committed fixture. Normal CI reads the frozen inputs without Office.

Supplemental scripts `probe-autofit-resize.ps1`, `probe-paragraph-spacing.ps1`, and `probe-font-line-metrics.ps1` generate only ignored experiments. The font-metrics script uses `prepare-font-line-metrics.mjs` to make an explicitly XML-derived 80% scale comparison. Their local PPTX files are not redistributed fixtures and have not received the committed-fixture sanitation step. Their measured scope and limitations are recorded in [TESTING.md](TESTING.md).

## Original text-decoration fixture and endpoint-spacing probe (alpha.5)

`tests/fixtures/powerpoint-text-decoration.pptx` contains nine original slides and 50 text frames authored through Microsoft PowerPoint COM. Its project text, layouts and objects are distributed under the repository's [MIT license](../LICENSE); no customer presentation or external template was used. The authoring and native verification used PowerPoint `16.0`, executable product version `16.0.20527.20150`. The final recorded native gate was at `2026-11-06T06:53:15.8765568Z`.

`scripts/create-powerpoint-text-decoration-fixture.ps1` creates its own presentation without a visible window and closes only that presentation. It authors attached text-box fills and outlines, zero/partial paint opacity, eight COM dash controls, rounded rectangles with default/zero/custom radius, ellipse and triangle text regions, centered thick strokes, rotation, native theme styles, genuine layout/master decoration inheritance with a local line override, and an intentionally unsupported gradient. Three rows of paragraph controls use no, normal, and shape AutoFit. Shared sanitation removes Office profile attribution and organization metadata before redistribution.

All original endpoint controls use PowerPoint's default paragraph-edge policy. Their names reserve `default`, `false` and `true` cases for the separate probe; the names do not imply that the original COM authoring set an endpoint flag. Bare normal AutoFit in the original also does not establish a computed shrink factor.

`scripts/prepare-text-decoration-probe.mjs` copies the sanitized original and records 29 explicit alterations. The resulting `powerpoint-text-decoration-probe.pptx` has nine slides and 53 text frames. It adds all eleven DrawingML preset dash tokens, bevel and limited-miter joins, style-reference indexes 0 and 1001, local/default/inherited `spcFirstLastPara` values, known 80% shrink factors, and three-paragraph inheritance comparisons. It is **XML-derived, not directly PowerPoint-authored**. PowerPoint subsequently opened and rendered it. No published older fixture was modified.

Frozen and tested SHA-256 values:

| File                                                                  | SHA-256                                                            |
| --------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `tests/fixtures/powerpoint-text-decoration.pptx`                      | `1c8db93b95bb3f0e75a94cdd1cee9e98dbda3b96caeb56f444d8a65b57e246ce` |
| `tests/fixtures/powerpoint-text-decoration-probe.pptx`                | `9600597635b6508ceb1c863f259b78cf92cea966f38ed5c422eeeb0b0f92a46f` |
| `examples/text-decoration.pptx`                                       | `707459f571d7ed8c364e1bc27ebede8083348ae2def712a9ccef26581f7fb0ed` |
| Ignored `test-results/text-decoration-powerpoint/probe-exported.pptx` | `5c6186a50284b727c38dfbb1f0fc205b67089434b378aa663b169bd3dd5bf10b` |

The public `examples/text-decoration.opendeck` and `.pptx` come **directly from importing the original COM-authored fixture**. The XML-derived probe has a separate ignored export; it is not the source of the public example.

Reproduce the native gate from the committed inputs:

```powershell
node scripts/generate-text-decoration-example.mjs
powershell -File scripts/verify-text-decoration-with-powerpoint.ps1
node scripts/check-text-decoration-office-roundtrip.mjs
```

The generator writes both supported-model derivatives. The verifier opens the two inputs and two exports, records native paint/frame/text bounds, renders PNGs, and saves separate copies. It also runs an explicitly separate resize recomputation experiment after loading the probe's XML-authored endpoint flags. It never saves over either frozen input. The last script compares native properties and re-imports the two exported saved copies.

To intentionally rebuild the fixture inputs, run `create-powerpoint-text-decoration-fixture.ps1` followed by `node scripts/prepare-text-decoration-probe.mjs`, then repeat import and native acceptance. Review the content, sanitized metadata and new hashes before replacing a committed input. Regular CI uses the frozen files without Office. Generated metadata, provenance, native saved copies, research downloads and renders remain under ignored `test-results/text-decoration-powerpoint/`. The published repository does not include the downloaded specification archive. [TESTING.md](TESTING.md) records the 18 inspected export renders, measured geometry and remaining limits.

## Synthetic OOXML and generated round trips

`src/pptx.test.ts` also creates small OOXML packages in memory to isolate relationship ordering, malformed input, theme/layout inheritance, groups, and warning behavior. These synthetic packages deliberately focus on importer cases; they are not all complete, independently validated PowerPoint presentations.

Other tests export original OpenDeck model data through PptxGenJS and OpenDeck's DrawingML text writer, then import it back. These verify the application's supported subset, but the import and export implementations can share assumptions. The committed PowerPoint-authored fixtures add independent input sources; broader visual acceptance remains described in [TESTING.md](TESTING.md).

No third-party Open XML SDK fixture is included in this release.
