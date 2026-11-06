# Original AutoFit fixture authored through PowerPoint COM in a new invisible deck.
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$fixturePath = Join-Path $projectRoot 'tests/fixtures/powerpoint-autofit.pptx'
$evidenceDirectory = Join-Path $projectRoot 'test-results/autofit-powerpoint'
New-Item -ItemType Directory -Force -Path $evidenceDirectory | Out-Null
$previousProcessIds = @(Get-Process POWERPNT -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id)
$application = $null
$presentation = $null
$cases = [System.Collections.Generic.List[object]]::new()

function Add-AutoFitText($slide, [string]$name, [string]$text, [double]$left, [double]$top, [double]$width, [double]$height, [double]$fontSize, [int]$mode = 0, [bool]$wrap = $true, [bool]$marker = $true, [int]$anchor = 1, [double]$rotation = 0) {
  $shape = $slide.Shapes.AddTextbox(1, $left, $top, $width, $height)
  $shape.Name = $name
  $shape.Fill.Visible = 0; $shape.Line.Visible = 0; $shape.Shadow.Visible = 0
  $frame = $shape.TextFrame2
  $frame.AutoSize = 0
  $frame.WordWrap = $(if ($wrap) { -1 } else { 0 })
  $frame.VerticalAnchor = $anchor
  $shape.Rotation = $rotation
  $frame.MarginLeft = 9; $frame.MarginTop = 9; $frame.MarginRight = 9; $frame.MarginBottom = 9
  $frame.TextRange.Text = $text
  $frame.TextRange.Font.Name = 'Arial'
  $frame.TextRange.Font.Size = $fontSize
  $frame.TextRange.Font.Fill.ForeColor.RGB = 2702850
  $paragraphs = $shape.TextFrame.TextRange.ParagraphFormat
  $paragraphs.LineRuleBefore = 0; $paragraphs.SpaceBefore = 0
  $paragraphs.LineRuleAfter = 0; $paragraphs.SpaceAfter = 0
  $paragraphs.LineRuleWithin = -1; $paragraphs.SpaceWithin = 1
  $frame.AutoSize = $mode
  $cases.Add(@{ slide = $slide.SlideIndex; name = $name; requestedMode = $mode; initialShapePt = @{ left = $left; top = $top; width = $width; height = $height }; inherited = $false })
  if ($marker) {
    $outline = $slide.Shapes.AddShape(1, $shape.Left, $shape.Top, $shape.Width, $shape.Height)
    $outline.Name = 'Bounds: ' + $name
    $outline.Fill.Visible = 0; $outline.Line.Visible = -1; $outline.Shadow.Visible = 0
    $outline.Line.ForeColor.RGB = 7498319; $outline.Line.Weight = 1
    $outline.ZOrder(1)
  }
  return $shape
}
function Add-AutoFitHeading($slide, [string]$text) {
  $heading = Add-AutoFitText $slide ('Heading ' + $slide.SlideIndex) $text 32 18 895 60 29 0 $true $false
  $heading.TextFrame2.TextRange.Font.Bold = -1
}

try {
  $application = New-Object -ComObject PowerPoint.Application
  $presentation = $application.Presentations.Add(0)
  $presentation.PageSetup.SlideWidth = 960; $presentation.PageSetup.SlideHeight = 540
  $first = $presentation.Slides.Add(1, 12)
  Add-AutoFitHeading $first 'Fit text while retaining its original styling'
  $copy = "First line of the story.`rSecond line adds detail.`rThird line explains why.`rFourth line makes a point.`rFifth line gives evidence.`rSixth line concludes."
  $null = Add-AutoFitText $first 'No fit baseline' $copy 42 125 270 290 30 0
  $null = Add-AutoFitText $first 'Plain shrink' $copy 345 125 270 290 30 2
  $mixed = Add-AutoFitText $first 'Mixed shrink' $copy 648 125 270 290 30 2
  $mixed.TextFrame2.TextRange.Characters(1, 5).Font.Size = 42
  $mixed.TextFrame2.TextRange.Characters(1, 5).Font.Bold = -1
  $mixed.TextFrame2.TextRange.Characters(25, 6).Font.Size = 20
  $mixed.TextFrame2.TextRange.Characters(25, 6).Font.Italic = -1
  $mixed.TextFrame2.TextRange.Characters(50, 5).Font.Name = 'Georgia'
  $first.NotesPage.Shapes.Placeholders.Item(2).TextFrame.TextRange.Text = 'Original nominal font sizes remain distinct from native saved shrink factors. The baseline can overflow; the other boxes use TextFrame2.AutoSize=2.'

  $second = $presentation.Slides.Add(2, 12)
  Add-AutoFitHeading $second 'Lists and paragraph spacing participate in fitting'
  $list = Add-AutoFitText $second 'Bulleted shrink' "First bullet makes the case`rNested bullet adds detail`rThird bullet gives evidence`rFourth bullet describes impact`rFifth bullet closes the story" 50 125 390 270 34 2
  $list.TextFrame.TextRange.ParagraphFormat.Bullet.Type = 1
  $list.TextFrame.TextRange.ParagraphFormat.Bullet.Character = 8226
  $list.TextFrame.TextRange.Paragraphs(2).IndentLevel = 2
  $list.TextFrame.TextRange.ParagraphFormat.SpaceAfter = 9
  $spaced = Add-AutoFitText $second 'Spaced shrink' "Paragraph one is intentionally long enough to wrap.`rParagraph two has explicit spacing before and after.`rParagraph three completes the test." 520 125 390 270 32 2
  $spaced.TextFrame.TextRange.ParagraphFormat.SpaceBefore = 6
  $spaced.TextFrame.TextRange.ParagraphFormat.SpaceAfter = 12
  $spaced.TextFrame.TextRange.ParagraphFormat.SpaceWithin = 1.5
  $second.NotesPage.Shapes.Placeholders.Item(2).TextFrame.TextRange.Text = 'Native shrinking includes mixed paragraphs, before/after spacing and nested list markers. Saved fontScale and lnSpcReduction are read independently from XML.'

  $third = $presentation.Slides.Add(3, 12)
  Add-AutoFitHeading $third 'Resize the shape instead of shrinking the words'
  $null = Add-AutoFitText $third 'Wrapped shape resize' "A shape grows around wrapped text.`rThe font remains at its authored size.`rThis final line needs more height." 50 125 375 65 28 1
  $null = Add-AutoFitText $third 'No-wrap shape resize' 'A short shape grows wider.' 50 400 190 45 28 1 $false
  $null = Add-AutoFitText $third 'Default-scale normal fit' 'Already fits.' 540 125 320 150 28 2
  $third.NotesPage.Shapes.Placeholders.Item(2).TextFrame.TextRange.Text = 'Original shape resize cases record both requested initial geometry and native saved geometry; the third box retains normal fitting at default scale.'

  $masterBody = $presentation.SlideMaster.Shapes.Placeholders.Item(2)
  $masterBody.TextFrame2.AutoSize = 2
  $masterBody.TextFrame2.TextRange.Font.Name = 'Arial'
  $masterBody.TextFrame2.TextRange.Font.Size = 28
  $layout = $presentation.SlideMaster.CustomLayouts.Item(4)
  $fourth = $presentation.Slides.AddSlide(4, $layout)
  $fourth.Shapes.Title.TextFrame2.TextRange.Text = 'Inherited fitting and a local override'
  $fourth.Shapes.Title.TextFrame2.TextRange.Font.Name = 'Arial'
  $fourth.Shapes.Title.TextFrame2.TextRange.Font.Size = 28
  $inherited = $fourth.Shapes.Placeholders.Item(2)
  $inherited.Name = 'Inherited normal default scale'
  $inherited.TextFrame2.TextRange.Text = 'This short text inherits normal fitting.'
  $inherited.TextFrame2.TextRange.Font.Name = 'Arial'
  $inherited.TextFrame2.TextRange.Font.Size = 28
  $noFit = $fourth.Shapes.Placeholders.Item(3)
  $noFit.Name = 'Local no-fit overrides inherited normal'
  $noFit.TextFrame2.AutoSize = 0
  $noFit.TextFrame2.TextRange.Text = $copy + "`rAn additional long line ensures the original font overflows."
  $noFit.TextFrame2.TextRange.Font.Name = 'Arial'
  $noFit.TextFrame2.TextRange.Font.Size = 36
  $cases.Add(@{ slide = 4; name = $inherited.Name; requestedMode = 2; inherited = $true })
  $cases.Add(@{ slide = 4; name = $noFit.Name; requestedMode = 0; inherited = $false })
  $fourth.NotesPage.Shapes.Placeholders.Item(2).TextFrame.TextRange.Text = 'Verify that local bodyPr omits the inherited normal autofit choice, while the adjacent placeholder explicitly writes noAutofit.'

  $fifth = $presentation.Slides.Add(5, 12)
  Add-AutoFitHeading $fifth 'Saved-scale probes use the same authored text'
  $probeText = "First line`vSecond line`vThird line"
  $scaleOnly = Add-AutoFitText $fifth 'Probe scale only' $probeText 50 110 390 165 24 0
  $reduction = Add-AutoFitText $fifth 'Probe scale and reduction' $probeText 520 110 390 165 24 0
  $fixed = Add-AutoFitText $fifth 'Probe fixed line spacing' $probeText 50 330 390 165 24 0
  $percent = Add-AutoFitText $fifth 'Probe percent-string values' $probeText 520 330 390 165 24 0
  foreach ($probe in @($scaleOnly, $reduction, $percent)) {
    $probe.TextFrame.TextRange.ParagraphFormat.LineRuleWithin = -1
    $probe.TextFrame.TextRange.ParagraphFormat.SpaceWithin = 1.5
  }
  $fixed.TextFrame.TextRange.ParagraphFormat.LineRuleWithin = 0
  $fixed.TextFrame.TextRange.ParagraphFormat.SpaceWithin = 36
  $fifth.NotesPage.Shapes.Placeholders.Item(2).TextFrame.TextRange.Text = 'These original controls use noAutofit. A separately attributed XML-derived probe inserts known saved scales and reduction factors without changing their authored text or spacing.'

  $sixth = $presentation.Slides.Add(6, 12)
  Add-AutoFitHeading $sixth 'Shape resize anchors and rotation'
  $resizeCopy = "First line of text.`rSecond line of text.`rThird line of text."
  $null = Add-AutoFitText $sixth 'Resize top anchor' $resizeCopy 45 160 260 60 24 1 $true $true 1
  $null = Add-AutoFitText $sixth 'Resize middle anchor' $resizeCopy 350 160 260 60 24 1 $true $true 3
  $null = Add-AutoFitText $sixth 'Resize bottom anchor' $resizeCopy 655 160 260 60 24 1 $true $true 4
  $null = Add-AutoFitText $sixth 'Resize rotated top' $resizeCopy 45 380 260 60 24 1 $true $true 1 30
  $null = Add-AutoFitText $sixth 'Resize rotated middle' $resizeCopy 350 380 260 60 24 1 $true $true 3 30
  $null = Add-AutoFitText $sixth 'Resize rotated bottom' $resizeCopy 655 380 260 60 24 1 $true $true 4 30
  $sixth.NotesPage.Shapes.Placeholders.Item(2).TextFrame.TextRange.Text = 'Requested geometry and resulting native positions are recorded separately. Outlines are independent unrotated geometry markers and do not represent rotated text bounds.'

  $seventh = $presentation.Slides.Add(7, 12)
  Add-AutoFitHeading $seventh 'Absolute paragraph spacing and list indents'
  $paragraphProbe = Add-AutoFitText $seventh 'Probe paragraph spacing' "First paragraph`vSecond line`rSecond paragraph" 50 125 390 310 24 0
  $paragraphProbe.TextFrame.TextRange.ParagraphFormat.LineRuleBefore = 0
  $paragraphProbe.TextFrame.TextRange.ParagraphFormat.SpaceBefore = 10
  $paragraphProbe.TextFrame.TextRange.ParagraphFormat.LineRuleAfter = 0
  $paragraphProbe.TextFrame.TextRange.ParagraphFormat.SpaceAfter = 20
  $indentProbe = Add-AutoFitText $seventh 'Probe list indents' "First bullet`rNested bullet`rLast bullet" 520 125 390 310 24 0
  $indentProbe.TextFrame.TextRange.ParagraphFormat.Bullet.Type = 1
  $indentProbe.TextFrame.TextRange.ParagraphFormat.Bullet.Character = 8226
  $indentProbe.TextFrame.TextRange.Paragraphs(2).IndentLevel = 2
  $indentProbe.TextFrame.Ruler.Levels.Item(1).FirstMargin = 0
  $indentProbe.TextFrame.Ruler.Levels.Item(1).LeftMargin = 24
  $indentProbe.TextFrame.Ruler.Levels.Item(2).FirstMargin = 18
  $indentProbe.TextFrame.Ruler.Levels.Item(2).LeftMargin = 42
  $seventh.NotesPage.Shapes.Placeholders.Item(2).TextFrame.TextRange.Text = 'These original controls use noAutofit. The XML-derived probe halves fontScale with zero line reduction, to isolate absolute paragraph spacing and fixed EMU list indents.'

  # Force layout, update independent markers to the shape's actual native size,
  # then save. No original source or previously published fixture is modified.
  foreach ($case in $cases) {
    $slide = $presentation.Slides.Item($case.slide)
    $shape = $slide.Shapes.Item($case.name)
    $null = $shape.TextFrame2.TextRange.BoundHeight
    try {
      $outline = $slide.Shapes.Item('Bounds: ' + $case.name)
      $outline.Left = $shape.Left; $outline.Top = $shape.Top; $outline.Width = $shape.Width; $outline.Height = $shape.Height
    } catch { }
  }
  $presentation.SaveAs($fixturePath, 24)
  for ($i = 1; $i -le $presentation.Slides.Count; $i++) { $presentation.Slides.Item($i).Export((Join-Path $evidenceDirectory "original-slide-$i.png"), 'PNG', 1280, 720) }
  $properties = @()
  foreach ($case in $cases) {
    $shape = $presentation.Slides.Item($case.slide).Shapes.Item($case.name)
    $frame = $shape.TextFrame2
    $range = $frame.TextRange
    $samples = @()
    $positions = [System.Collections.Generic.List[int]]::new()
    $positions.Add(1)
    for ($index = 0; $index -lt $range.Text.Length - 1; $index++) { if ([int][char]$range.Text[$index] -in @(10, 11, 13)) { $positions.Add($index + 2) } }
    if ($case.name -eq 'Mixed shrink') { $positions.Add(25); $positions.Add(50) }
    foreach ($index in $positions) {
      $character = $range.Characters($index, 1)
      $samples += @{ index = $index; character = $character.Text; comFontSize = $character.Font.Size; comFontName = $character.Font.Name; boundTop = $character.BoundTop; boundLeft = $character.BoundLeft; boundHeight = $character.BoundHeight; boundWidth = $character.BoundWidth }
    }
    $properties += @{ slide = $case.slide; name = $case.name; inherited = $case.inherited; requestedMode = $case.requestedMode; initialShapePt = $case.initialShapePt; autoSize = $frame.AutoSize; shapePt = @{ left = $shape.Left; top = $shape.Top; width = $shape.Width; height = $shape.Height }; insetsPt = @{ left = $frame.MarginLeft; top = $frame.MarginTop; right = $frame.MarginRight; bottom = $frame.MarginBottom }; comFontSize = $range.Font.Size; boundsPt = @{ left = $range.BoundLeft; top = $range.BoundTop; width = $range.BoundWidth; height = $range.BoundHeight }; text = $range.Text; samples = $samples }
  }
  @{ application = 'Microsoft PowerPoint'; version = $application.Version; productVersion = (Get-Item -LiteralPath (Join-Path $application.Path 'POWERPNT.EXE')).VersionInfo.ProductVersion; generatedUtc = [DateTime]::UtcNow.ToString('o'); cases = $properties } | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $evidenceDirectory 'original-native-properties.json')
  Write-Output "Created $fixturePath and native AutoFit evidence."
} finally {
  if ($null -ne $presentation) { $presentation.Close(); [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($presentation) }
  if ($null -ne $application) {
    if ($previousProcessIds.Count -eq 0 -and $application.Presentations.Count -eq 0) { $application.Quit() }
    [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($application)
  }
  [GC]::Collect(); [GC]::WaitForPendingFinalizers()
}
node (Join-Path $PSScriptRoot 'sanitize-pptx-fixture.mjs') $fixturePath
if ($LASTEXITCODE -ne 0) { throw 'AutoFit fixture metadata sanitation failed.' }
