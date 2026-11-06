# Original content authored with PowerPoint COM; no user presentation is touched.
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$evidenceDirectory = Join-Path $projectRoot 'test-results/text-decoration-powerpoint'
New-Item -ItemType Directory -Force -Path $evidenceDirectory | Out-Null
$fixturePath = Join-Path $projectRoot 'tests/fixtures/powerpoint-text-decoration.pptx'
$previousProcessIds = @(Get-Process POWERPNT -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id)
$application = $null; $presentation = $null
$cases = [System.Collections.Generic.List[object]]::new()

function Set-OriginalText($shape, [string]$text, [double]$fontSize = 24, [double]$margin = 9) {
  $frame = $shape.TextFrame2
  $frame.AutoSize = 0; $frame.WordWrap = -1; $frame.VerticalAnchor = 1
  $frame.MarginLeft = $margin; $frame.MarginRight = $margin; $frame.MarginTop = $margin; $frame.MarginBottom = $margin
  $frame.TextRange.Text = $text
  $frame.TextRange.Font.Name = 'Arial'; $frame.TextRange.Font.Size = $fontSize
  $frame.TextRange.Font.Fill.ForeColor.RGB = 2702850
  $shape.TextFrame.TextRange.ParagraphFormat.Alignment = 1
  $shape.TextFrame.TextRange.ParagraphFormat.LineRuleBefore = 0
  $shape.TextFrame.TextRange.ParagraphFormat.SpaceBefore = 0
  $shape.TextFrame.TextRange.ParagraphFormat.LineRuleAfter = 0
  $shape.TextFrame.TextRange.ParagraphFormat.SpaceAfter = 0
  $shape.TextFrame.TextRange.ParagraphFormat.LineRuleWithin = -1
  $shape.TextFrame.TextRange.ParagraphFormat.SpaceWithin = 1
}

function Add-Decorated($slide, [string]$name, [int]$preset, [double]$x, [double]$y, [double]$width, [double]$height, [string]$text = '', [double]$fontSize = 24, [double]$margin = 9) {
  if ($preset -eq 0) { $shape = $slide.Shapes.AddTextbox(1, $x, $y, $width, $height) }
  else { $shape = $slide.Shapes.AddShape($preset, $x, $y, $width, $height) }
  $shape.Name = $name
  $shape.Fill.Visible = -1; $shape.Fill.Solid(); $shape.Fill.ForeColor.RGB = 15135463; $shape.Fill.Transparency = 0
  $shape.Line.Visible = -1; $shape.Line.ForeColor.RGB = 10047255; $shape.Line.Weight = 2; $shape.Line.Transparency = 0
  $shape.Shadow.Visible = 0
  if ($text -eq '') { $text = $name }
  Set-OriginalText $shape $text $fontSize $margin
  $cases.Add(@{slide=$slide.SlideIndex;name=$name;requestedPreset=$preset})
  return $shape
}

function Add-Heading($slide, [string]$text) {
  $shape = Add-Decorated $slide ('Heading ' + $slide.SlideIndex) 0 42 24 880 58 $text 28 0
  $shape.Fill.Visible = 0; $shape.Line.Visible = 0
  $shape.TextFrame2.TextRange.Font.Bold = -1
}

function Add-Notes($slide, [string]$text) {
  $slide.NotesPage.Shapes.Placeholders.Item(2).TextFrame.TextRange.Text = $text
}

try {
  $application = New-Object -ComObject PowerPoint.Application
  $presentation = $application.Presentations.Add(0)
  $presentation.PageSetup.SlideWidth = 960; $presentation.PageSetup.SlideHeight = 540

  $slide = $presentation.Slides.Add(1, 12)
  Add-Heading $slide 'Text boxes retain their fill and outline'
  $fill = Add-Decorated $slide 'Fill only' 0 45 130 260 130
  $fill.Line.Visible = 0
  $line = Add-Decorated $slide 'Line only' 0 350 130 260 130
  $line.Fill.Visible = 0; $line.Line.Weight = 4
  $null = Add-Decorated $slide 'Fill and outline' 0 655 130 260 130
  $partial = Add-Decorated $slide 'Partial alpha' 0 45 335 260 130
  $partial.Fill.Transparency = [single]0.5; $partial.Line.Transparency = [single]0.25; $partial.Line.Weight = 6
  $zeroFill = Add-Decorated $slide 'Zero fill alpha' 0 350 335 260 130
  $zeroFill.Fill.Transparency = 1
  $zeroLine = Add-Decorated $slide 'Zero line alpha' 0 655 335 260 130
  $zeroLine.Line.Transparency = 1; $zeroLine.Line.Weight = 8
  Add-Notes $slide 'Original attached text-box solid fills and lines, with explicit opacity zero and partial opacity. No effects or AutoFit.'

  $slide = $presentation.Slides.Add(2, 12)
  Add-Heading $slide 'Native outline dash controls'
  $dashNames = @('Solid', 'Square dot', 'Round dot', 'Dash', 'Dash dot', 'Dash dot dot', 'Long dash', 'Long dash dot')
  for ($i = 0; $i -lt 8; $i++) {
    $x = 45 + ($i % 2) * 465; $y = 105 + [math]::Floor($i / 2) * 105
    $shape = Add-Decorated $slide ('Native dash ' + $dashNames[$i]) 0 $x $y 405 72 $dashNames[$i] 22 12
    $shape.Fill.Visible = 0; $shape.Line.Weight = 4; $shape.Line.DashStyle = $i + 1
  }
  Add-Notes $slide 'Eight documented COM dash styles. Separate XML-derived controls cover every DrawingML preset dash token; the native API does not expose a one-to-one eleven-token enumeration.'

  $slide = $presentation.Slides.Add(3, 12)
  Add-Heading $slide 'Rounded rectangle adjustments'
  $roundPlans = @(@{name='Round default';x=55;y=110;adj=$null}, @{name='Round zero';x=520;y=110;adj=0}, @{name='Round forty percent';x=55;y=330;adj=0.4}, @{name='Round half';x=520;y=330;adj=0.5})
  foreach ($plan in $roundPlans) {
    $shape = Add-Decorated $slide $plan.name 5 $plan.x $plan.y 380 140 "Hgx`rSecond line" 22 0
    if ($null -ne $plan.adj) { $shape.Adjustments.Item(1) = [single]$plan.adj }
  }
  Add-Notes $slide 'All shapes are 380 by140 points, no AutoFit, zero body margins. Default/custom adjustment, XML and native glyph positions allow radius and preset text-region comparison.'

  $slide = $presentation.Slides.Add(4, 12)
  Add-Heading $slide 'Preset geometry changes the available text region'
  $copy = "Hgx first line`rHgx second line`rHgx third line`rHgx fourth line"
  $null = Add-Decorated $slide 'Rectangle text region' 1 40 140 260 300 $copy 20 0
  $null = Add-Decorated $slide 'Ellipse text region' 9 350 140 260 300 $copy 20 0
  $null = Add-Decorated $slide 'Triangle text region' 7 660 140 260 300 $copy 20 0
  Add-Notes $slide 'Identical shape dimensions, top alignment, zero body margins and text. Shapes use native preset geometry, not text boxes layered on drawings.'

  $slide = $presentation.Slides.Add(5, 12)
  Add-Heading $slide 'Centered outlines and rotated text shapes'
  $wide = Add-Decorated $slide 'Centered thick rectangle' 0 80 150 300 220 'Twenty-four point outline' 24 18
  $wide.Fill.Visible = 0; $wide.Line.ForeColor.RGB = 255; $wide.Line.Weight = 24
  $rotated = Add-Decorated $slide 'Rotated round rectangle' 5 540 150 290 170 'Rotated attached decoration' 24 12
  $rotated.Rotation = [single]30; $rotated.Line.Weight = 8; $rotated.Adjustments.Item(1) = [single]0.3
  $ellipse = Add-Decorated $slide 'Rotated ellipse' 9 570 370 260 105 'Ellipse' 20 0
  $ellipse.Rotation = [single]-15
  Add-Notes $slide 'Red outline is centered on x80,y150,width300,height220 points. A rendered pixel envelope can distinguish center from inset stroke alignment. Rotated text and its attached decoration share one transform.'

  $slide = $presentation.Slides.Add(6, 12)
  Add-Heading $slide 'Theme styles and an unsupported gradient control'
  foreach ($style in @(1, 2, 3)) {
    $shape = $slide.Shapes.AddShape(1, (45 + ($style - 1) * 305), 130, 260, 160)
    $shape.Name = "Theme style $style"; $shape.ShapeStyle = $style
    Set-OriginalText $shape "Theme style $style" 24 12
    $shape.Shadow.Visible = 0
    $cases.Add(@{slide=6;name=$shape.Name;requestedPreset=1})
  }
  $gradient = Add-Decorated $slide 'Unsupported gradient fill' 0 45 365 405 100 'Gradient control' 24 12
  $gradient.Fill.ForeColor.RGB = 15135463; $gradient.Fill.BackColor.RGB = 10047255; $gradient.Fill.TwoColorGradient(1, 1)
  $none = Add-Decorated $slide 'Explicit no fill no line' 0 510 365 405 100
  $none.Fill.Visible = 0; $none.Line.Visible = 0
  Add-Notes $slide 'ShapeStyle uses native theme references. Gradient is intentionally unsupported and must cause a warning rather than silently claiming solid-fill equivalence.'

  # These are new-document built-in layouts, never an external/customer template.
  $layout = $presentation.SlideMaster.CustomLayouts.Item(2)
  $layout.Name = 'Original decoration layout'
  $layoutTitle = $layout.Shapes.Placeholders.Item(1)
  $layoutTitle.Fill.Visible = -1; $layoutTitle.Fill.Solid(); $layoutTitle.Fill.ForeColor.RGB = 15135463
  $layoutTitle.Line.Visible = -1; $layoutTitle.Line.ForeColor.RGB = 10047255; $layoutTitle.Line.Weight = 4
  $layoutBody = $layout.Shapes.Placeholders.Item(2)
  $layoutBody.Fill.Visible = -1; $layoutBody.Fill.Solid(); $layoutBody.Fill.ForeColor.RGB = 15330543
  $layoutBody.Line.Visible = -1; $layoutBody.Line.ForeColor.RGB = 255; $layoutBody.Line.Weight = 2
  $slide = $presentation.Slides.AddSlide(7, $layout)
  $title = $slide.Shapes.Placeholders.Item(1); $title.Name = 'Layout inherited title decoration'; $title.TextFrame2.TextRange.Text = 'Decoration inherited from the layout'
  $body = $slide.Shapes.Placeholders.Item(2); $body.Name = 'Layout fill with local line override'; $body.TextFrame2.TextRange.Text = 'Layout fill with a blue six-point local line.'
  $body.Line.Visible = -1; $body.Line.ForeColor.RGB = 16711680; $body.Line.Weight = 6
  $cases.Add(@{slide=7;name=$title.Name;requestedPreset=0}); $cases.Add(@{slide=7;name=$body.Name;requestedPreset=0})
  Add-Notes $slide 'Native slide placeholders inherit layout decoration. The body has only a local line override; the fill should continue to inherit.'

  $masterBody = $presentation.SlideMaster.Shapes.Placeholders.Item(2)
  $masterBody.Fill.Visible = -1; $masterBody.Fill.Solid(); $masterBody.Fill.ForeColor.RGB = 15135463
  $masterBody.Line.Visible = -1; $masterBody.Line.ForeColor.RGB = 10047255; $masterBody.Line.Weight = 5
  $masterLayout = $presentation.SlideMaster.CustomLayouts.Item(4)
  $masterLayout.Name = 'Original master decoration inheritance'
  $slide = $presentation.Slides.AddSlide(8, $masterLayout)
  for ($i=1;$i -le $slide.Shapes.Placeholders.Count;$i++) {
    $placeholder = $slide.Shapes.Placeholders.Item($i)
    $placeholder.Name = "Master decoration placeholder $i"
    $placeholder.TextFrame2.TextRange.Text = $(if($i -eq 1){'Master decoration inheritance'}else{"Original content $i"})
    $cases.Add(@{slide=8;name=$placeholder.Name;requestedPreset=0})
  }
  Add-Notes $slide 'Built-in content layout with a decorated master body placeholder. Source XML determines whether PowerPoint keeps or materializes the inherited properties; no inheritance claim is inferred from API calls alone.'

  $slide = $presentation.Slides.Add(9, 12)
  Add-Heading $slide 'Paragraph edge spacing: original default controls'
  $edgeModes = @('none', 'shrink', 'resize')
  $edgeFlags = @('default', 'false', 'true')
  for ($modeIndex=0;$modeIndex -lt 3;$modeIndex++) {
    for ($flagIndex=0;$flagIndex -lt 3;$flagIndex++) {
      $name = "Edge $($edgeModes[$modeIndex]) $($edgeFlags[$flagIndex])"
      $shape = Add-Decorated $slide $name 0 (45+$flagIndex*305) (100+$modeIndex*140) 260 110 "First paragraph`rMiddle paragraph`rLast paragraph" 14 6
      $shape.TextFrame.TextRange.ParagraphFormat.SpaceBefore = 10
      $shape.TextFrame.TextRange.ParagraphFormat.SpaceAfter = 20
      $shape.TextFrame2.AutoSize = @(0,2,1)[$modeIndex]
    }
  }
  Add-Notes $slide 'All original shapes have native default endpoint spacing. Names reserve XML-derived default/false/true comparisons. Derived shrink uses a saved80percent factor; resize is recalculated in the native probe, not claimed to be authored by COM with an endpoint flag.'

  $presentation.SaveAs($fixturePath, 24)
  $native = @()
  for ($i=1;$i -le $presentation.Slides.Count;$i++) {
    $slide=$presentation.Slides.Item($i)
    $slide.Export((Join-Path $evidenceDirectory "original-slide-$i.png"),'PNG',1280,720)
    foreach ($shape in $slide.Shapes) {
      if (-not $shape.HasTextFrame -or -not $shape.TextFrame2.HasText) { continue }
      $frame=$shape.TextFrame2; $range=$frame.TextRange
      $adjustments=@(); for($j=1;$j -le $shape.Adjustments.Count;$j++){ $adjustments += $shape.Adjustments.Item($j) }
      $native += @{slide=$i;name=$shape.Name;text=$range.Text;shapeType=$shape.Type;autoShapeType=$shape.AutoShapeType;left=$shape.Left;top=$shape.Top;width=$shape.Width;height=$shape.Height;rotation=$shape.Rotation;adjustments=$adjustments;fill=@{visible=$shape.Fill.Visible;type=$shape.Fill.Type;color=$shape.Fill.ForeColor.RGB;transparency=$shape.Fill.Transparency};line=@{visible=$shape.Line.Visible;color=$shape.Line.ForeColor.RGB;transparency=$shape.Line.Transparency;width=$shape.Line.Weight;dash=$shape.Line.DashStyle};frame=@{left=$frame.MarginLeft;right=$frame.MarginRight;top=$frame.MarginTop;bottom=$frame.MarginBottom;autoSize=$frame.AutoSize};textBounds=@{left=$range.BoundLeft;top=$range.BoundTop;width=$range.BoundWidth;height=$range.BoundHeight}}
    }
  }
  @{application='Microsoft PowerPoint';version=$application.Version;productVersion=(Get-Item -LiteralPath (Join-Path $application.Path 'POWERPNT.EXE')).VersionInfo.ProductVersion;generatedUtc=[DateTime]::UtcNow.ToString('o');cases=$native} | ConvertTo-Json -Depth 9 | Set-Content -LiteralPath (Join-Path $evidenceDirectory 'original-native-properties.json')
} finally {
  if ($null -ne $presentation) {$presentation.Close();[void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($presentation)}
  if ($null -ne $application) {
    if ($previousProcessIds.Count -eq 0 -and $application.Presentations.Count -eq 0){$application.Quit()}
    [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($application)
  }
  [GC]::Collect();[GC]::WaitForPendingFinalizers()
}
node (Join-Path $PSScriptRoot 'sanitize-pptx-fixture.mjs') $fixturePath
if($LASTEXITCODE -ne 0){throw 'Text-decoration fixture sanitation failed.'}
Write-Output "Created original fixture: $fixturePath"
