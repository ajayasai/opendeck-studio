# Original interoperability content authored only through PowerPoint's COM API.
# Creates its own invisible presentation; never edits or closes user documents.
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$fixtureDirectory = Join-Path $projectRoot 'tests/fixtures'
$renderDirectory = Join-Path $projectRoot 'test-results/text-frame-powerpoint'
New-Item -ItemType Directory -Force -Path $fixtureDirectory, $renderDirectory | Out-Null
$fixturePath = Join-Path $fixtureDirectory 'powerpoint-text-frame.pptx'
$attachedOutlinePath = Join-Path $fixtureDirectory 'powerpoint-text-frame-attached-outline-probe.pptx'
$previousProcessIds = @(Get-Process POWERPNT -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id)
$application = $null
$presentation = $null
$cases = [System.Collections.Generic.List[object]]::new()
$rejectedMargins = [System.Collections.Generic.List[object]]::new()

function Add-Frame($slide, [string]$name, [string]$text, [double]$left, [double]$top, [double]$width, [double]$height, [double[]]$insets, [int]$anchor = 1, [bool]$wrap = $true, [double]$fontSize = 24) {
  $shape = $slide.Shapes.AddTextbox(1, $left, $top, $width, $height)
  $shape.Name = $name
  $shape.Fill.Visible = 0
  $shape.Line.Visible = -1
  $shape.Line.ForeColor.RGB = 7498319
  $shape.Line.Weight = 1
  $frame = $shape.TextFrame2
  $frame.AutoSize = 0
  $frame.WordWrap = $(if ($wrap) { -1 } else { 0 })
  $frame.VerticalAnchor = $anchor
  $properties = @('MarginLeft', 'MarginTop', 'MarginRight', 'MarginBottom')
  for ($i = 0; $i -lt 4; $i++) {
    try { $frame.($properties[$i]) = $insets[$i] }
    catch {
      if ($insets[$i] -ge 0) { throw }
      $rejectedMargins.Add(@{ shape = $name; property = $properties[$i]; requested = $insets[$i]; reason = $_.Exception.Message })
    }
  }
  $frame.TextRange.Text = $text
  $frame.TextRange.Font.Name = 'Arial'
  $frame.TextRange.Font.Size = $fontSize
  $frame.TextRange.Font.Fill.ForeColor.RGB = 2702850
  $shape.TextFrame.TextRange.ParagraphFormat.SpaceAfter = 0
  $shape.TextFrame.TextRange.ParagraphFormat.SpaceBefore = 0
  $cases.Add(@{ slide = $slide.SlideIndex; name = $name; requestedInsetsPt = $insets; inherited = $false })
  return $shape
}

function Add-Heading($slide, [string]$text) {
  $heading = Add-Frame $slide ('Heading ' + $slide.SlideIndex) $text 42 24 870 55 @(0, 0, 0, 0) 1 $true 30
  $heading.Line.Visible = 0
  $heading.TextFrame2.TextRange.Font.Bold = -1
  return $heading
}

try {
  $application = New-Object -ComObject PowerPoint.Application
  $presentation = $application.Presentations.Add(0)
  $presentation.PageSetup.SlideWidth = 960
  $presentation.PageSetup.SlideHeight = 540

  $first = $presentation.Slides.Add(1, 12)
  $null = Add-Heading $first 'Insets define the text area'
  $copy = "Same words, different margins.`rMixed font sizes stay editable.`vA soft break follows."
  $asymmetric = Add-Frame $first 'Asymmetric insets' $copy 54 125 390 280 @(36, 24, 18, 12) 1 $true 27
  $asymmetric.TextFrame2.TextRange.Characters(1, 4).Font.Size = 34
  $asymmetric.TextFrame2.TextRange.Characters(1, 4).Font.Bold = -1
  $zero = Add-Frame $first 'Explicit zero insets' $copy 510 125 390 280 @(0, 0, 0, 0) 1 $true 27
  $zero.TextFrame2.TextRange.Characters(1, 4).Font.Size = 34
  $zero.TextFrame2.TextRange.Characters(1, 4).Font.Bold = -1
  $first.NotesPage.Shapes.Placeholders.Item(2).TextFrame.TextRange.Text = 'Original asymmetric and explicit-zero inset cases. Outlines show shape bounds; paragraphs and a soft break use mixed font sizes.'

  $second = $presentation.Slides.Add(2, 12)
  $null = Add-Heading $second 'Vertical anchors use the inset rectangle'
  $null = Add-Frame $second 'Top anchor' "Top anchor`rSecond line" 45 135 265 270 @(18, 30, 12, 48) 1 $true 26
  $null = Add-Frame $second 'Middle anchor' "Middle anchor`rSecond line" 348 135 265 270 @(18, 30, 12, 48) 3 $true 26
  $null = Add-Frame $second 'Bottom anchor' "Bottom anchor`rSecond line" 650 135 265 270 @(18, 30, 12, 48) 4 $true 26
  $second.NotesPage.Shapes.Placeholders.Item(2).TextFrame.TextRange.Text = 'Identical positive insets with top, middle, and bottom anchoring; no auto-fit.'

  $third = $presentation.Slides.Add(3, 12)
  $null = Add-Heading $third 'Wrapping is separate from overflowing'
  $null = Add-Frame $third 'No wrap overflow' 'Unwrapped words extend beyond this outlined frame.' 54 140 240 75 @(24, 12, 30, 18) 1 $false 25
  $null = Add-Frame $third 'Wrapped vertical overflow' 'Wrapped words stay inside the available width and continue below the outlined frame.' 54 315 240 75 @(24, 12, 30, 18) 1 $true 25
  $null = Add-Frame $third 'Hard and soft breaks without wrapping' "Hard break`rSoft`vbreak" 530 315 320 90 @(18, 12, 18, 12) 1 $false 25
  $third.NotesPage.Shapes.Placeholders.Item(2).TextFrame.TextRange.Text = 'AutoSize is disabled. Native overflow extends beyond the outline. The XML-derived probe changes only overflow flags for comparison.'

  $fourth = $presentation.Slides.Add(4, 12)
  $null = Add-Heading $fourth 'Signed margins and explicit boundaries'
  $null = Add-Frame $fourth 'Negative insets' "Margin test: compare the outline.`rSecond line" 100 150 290 160 @(-18, -12, -24, -8) 1 $true 28
  $null = Add-Frame $fourth 'Positive overflow control' "Clip probe: words cross the outlined right edge.`rSecond line crosses the bottom edge.`rThird line." 530 150 240 85 @(30, 15, 42, 22) 1 $false 28
  $null = Add-Frame $fourth 'Negative overflow control' "Clip probe: inspect left and top edges.`rSecond line crosses the bottom edge.`rThird line." 530 350 240 65 @(-18, -12, -24, -8) 1 $false 28
  $fourth.NotesPage.Shapes.Placeholders.Item(2).TextFrame.TextRange.Text = 'Signed inset requests and native acceptance are recorded in original-native-properties.json. Outlines mark shape bounds, not the inset rectangle.'

  # Modify an original layout in this new presentation, then author only text on
  # its slide placeholders. PowerPoint should omit inherited local body values.
  $layout = $presentation.SlideMaster.CustomLayouts.Item(1)
  $layout.Name = 'Original text frame inheritance'
  $layoutTitle = $layout.Shapes.Placeholders.Item(1)
  $layoutTitle.Left = 70; $layoutTitle.Top = 90; $layoutTitle.Width = 820; $layoutTitle.Height = 130
  $layoutTitle.TextFrame2.AutoSize = 0
  $layoutTitle.TextFrame2.MarginLeft = 27
  $layoutTitle.TextFrame2.MarginTop = 13
  $layoutTitle.TextFrame2.MarginRight = 33
  $layoutTitle.TextFrame2.MarginBottom = 17
  $layoutTitle.TextFrame2.VerticalAnchor = 4
  $layoutTitle.TextFrame2.WordWrap = 0
  $layoutBody = $layout.Shapes.Placeholders.Item(2)
  $layoutBody.Left = 70; $layoutBody.Top = 290; $layoutBody.Width = 820; $layoutBody.Height = 130
  $layoutBody.TextFrame2.AutoSize = 0
  $layoutBody.TextFrame2.MarginLeft = 21
  $layoutBody.TextFrame2.MarginTop = 9
  $layoutBody.TextFrame2.MarginRight = 15
  $layoutBody.TextFrame2.MarginBottom = 27
  $layoutBody.TextFrame2.VerticalAnchor = 3
  $layoutBody.TextFrame2.WordWrap = -1
  $fifth = $presentation.Slides.AddSlide(5, $layout)
  $inheritedTitle = $fifth.Shapes.Placeholders.Item(1)
  $inheritedTitle.Name = 'Inherited layout title'
  $inheritedTitle.TextFrame2.TextRange.Text = 'Inherited layout text frame'
  $inheritedTitle.TextFrame2.TextRange.Font.Name = 'Arial'
  $inheritedTitle.TextFrame2.TextRange.Font.Size = 30
  $inheritedBody = $fifth.Shapes.Placeholders.Item(2)
  $inheritedBody.Name = 'Inherited layout body'
  $inheritedBody.TextFrame2.TextRange.Text = "This slide overrides content only.`rInsets, wrapping and anchor come from the layout."
  $inheritedBody.TextFrame2.TextRange.Font.Name = 'Arial'
  $inheritedBody.TextFrame2.TextRange.Font.Size = 24
  $cases.Add(@{ slide = 5; name = 'Inherited layout title'; inherited = $true })
  $cases.Add(@{ slide = 5; name = 'Inherited layout body'; inherited = $true })
  $fifth.NotesPage.Shapes.Placeholders.Item(2).TextFrame.TextRange.Text = 'Original PowerPoint layout inheritance. Verify local slide bodyPr omits margin, anchor and wrap attributes before calling this an inheritance fixture.'

  # Two-content layout has content idx=1 and idx=2, while the master body is
  # idx=1. Both content placeholders must inherit from the master body type.
  $masterTitle = $presentation.SlideMaster.Shapes.Placeholders.Item(1)
  $masterTitle.TextFrame2.AutoSize = 0
  $masterTitle.TextFrame2.MarginLeft = 4
  $masterTitle.TextFrame2.MarginTop = 8
  $masterTitle.TextFrame2.MarginRight = 12
  $masterTitle.TextFrame2.MarginBottom = 16
  $masterTitle.TextFrame2.VerticalAnchor = 1
  $masterTitle.TextFrame2.WordWrap = 0
  $masterBody = $presentation.SlideMaster.Shapes.Placeholders.Item(2)
  $masterBody.TextFrame2.AutoSize = 0
  $masterBody.TextFrame2.MarginLeft = 24
  $masterBody.TextFrame2.MarginTop = 10
  $masterBody.TextFrame2.MarginRight = 16
  $masterBody.TextFrame2.MarginBottom = 20
  $masterBody.TextFrame2.VerticalAnchor = 4
  $masterBody.TextFrame2.WordWrap = -1
  $masterLayout = $presentation.SlideMaster.CustomLayouts.Item(4)
  $sixth = $presentation.Slides.AddSlide(6, $masterLayout)
  $masterSlideTitle = $sixth.Shapes.Placeholders.Item(1)
  $masterSlideTitle.Name = 'Inherited master title'
  $masterSlideTitle.TextFrame2.TextRange.Text = 'Master properties cross placeholder indexes'
  $masterSlideTitle.TextFrame2.TextRange.Font.Name = 'Arial'
  $masterSlideTitle.TextFrame2.TextRange.Font.Size = 28
  $cases.Add(@{ slide = 6; name = 'Inherited master title'; inherited = $true })
  for ($i = 2; $i -le 3; $i++) {
    $content = $sixth.Shapes.Placeholders.Item($i)
    $content.Name = 'Inherited master content ' + ($i - 1)
    $content.TextFrame2.TextRange.Text = "Content placeholder $($i - 1).`rShared master body margins and bottom anchor."
    $content.TextFrame2.TextRange.Font.Name = 'Arial'
    $content.TextFrame2.TextRange.Font.Size = 24
    $content.TextFrame.TextRange.ParagraphFormat.Bullet.Visible = 0
    $cases.Add(@{ slide = 6; name = $content.Name; inherited = $true })
  }
  $sixth.NotesPage.Shapes.Placeholders.Item(2).TextFrame.TextRange.Text = 'Original master inheritance. Layout content placeholders have distinct indexes but resolve to the same body placeholder in the master. Slide and layout bodyPr must omit inherited properties.'

  # Retain the native attached-outline case separately: attached textbox
  # fill/borders are not represented by OpenDeck's current text object model.
  $presentation.SaveAs($attachedOutlinePath, 24)
  foreach ($case in $cases) {
    $slide = $presentation.Slides.Item($case.slide)
    $shape = $slide.Shapes.Item($case.name)
    if ($shape.Line.Visible -eq -1) {
      $marker = $slide.Shapes.AddShape(1, $shape.Left, $shape.Top, $shape.Width, $shape.Height)
      $marker.Name = 'Bounds: ' + $case.name
      $marker.Fill.Visible = 0
      $marker.Line.Visible = -1
      $marker.Line.ForeColor.RGB = $shape.Line.ForeColor.RGB
      $marker.Line.Weight = $shape.Line.Weight
      $marker.ZOrder(1)
      $shape.Line.Visible = 0
    }
  }
  $presentation.SaveAs($fixturePath, 24)
  $properties = @()
  foreach ($case in $cases) {
    $shape = $presentation.Slides.Item($case.slide).Shapes.Item($case.name)
    $frame = $shape.TextFrame2
    $range = $frame.TextRange
    $properties += @{
      slide = $case.slide; name = $case.name; inherited = $case.inherited
      requestedInsetsPt = $case.requestedInsetsPt
      shapePt = @{ left = $shape.Left; top = $shape.Top; width = $shape.Width; height = $shape.Height }
      insetsPt = @{ left = $frame.MarginLeft; top = $frame.MarginTop; right = $frame.MarginRight; bottom = $frame.MarginBottom }
      verticalAnchor = $frame.VerticalAnchor; wordWrap = $frame.WordWrap; autoSize = $frame.AutoSize
      textBoundsPt = @{ left = $range.BoundLeft; top = $range.BoundTop; width = $range.BoundWidth; height = $range.BoundHeight }
      text = $range.Text
    }
  }
  for ($i = 1; $i -le $presentation.Slides.Count; $i++) {
    $presentation.Slides.Item($i).Export((Join-Path $renderDirectory "original-slide-$i.png"), 'PNG', 1280, 720)
  }
  @{ application = 'Microsoft PowerPoint'; version = $application.Version; generatedUtc = [DateTime]::UtcNow.ToString('o'); slideCount = $presentation.Slides.Count; rejectedNegativeMargins = @($rejectedMargins); cases = $properties } | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $renderDirectory 'original-native-properties.json')
  Write-Output "Created $fixturePath and native property/render evidence."
} finally {
  if ($null -ne $presentation) { $presentation.Close(); [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($presentation) }
  if ($null -ne $application) {
    if ($previousProcessIds.Count -eq 0 -and $application.Presentations.Count -eq 0) { $application.Quit() }
    [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($application)
  }
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
}
node (Join-Path $PSScriptRoot 'sanitize-pptx-fixture.mjs') $fixturePath
if ($LASTEXITCODE -ne 0) { throw 'Fixture metadata sanitation failed.' }
node (Join-Path $PSScriptRoot 'sanitize-pptx-fixture.mjs') $attachedOutlinePath
if ($LASTEXITCODE -ne 0) { throw 'Attached outline probe metadata sanitation failed.' }
