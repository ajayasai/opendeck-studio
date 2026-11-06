# Independent one-case-per-slide paragraph-spacing experiment, ignored outputs.
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$evidenceDirectory = Join-Path $projectRoot 'test-results/autofit-powerpoint/paragraph-spacing'
New-Item -ItemType Directory -Force -Path $evidenceDirectory | Out-Null
$previousProcessIds = @(Get-Process POWERPNT -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id)
$application = $null; $presentation = $null
try {
  $application = New-Object -ComObject PowerPoint.Application
  $presentation = $application.Presentations.Add(0)
  $presentation.PageSetup.SlideWidth = 600; $presentation.PageSetup.SlideHeight = 400
  $plans = @(
    @{ name = 'baseline-one'; spacing = ,@(0, 0) },
    @{ name = 'spaced-one'; spacing = ,@(10, 20) },
    @{ name = 'baseline-two'; spacing = @(@(0, 0), @(0, 0)) },
    @{ name = 'spaced-two'; spacing = @(@(10, 20), @(10, 20)) },
    @{ name = 'baseline-three'; spacing = @(@(0, 0), @(0, 0), @(0, 0)) },
    @{ name = 'spaced-three'; spacing = @(@(10, 20), @(10, 20), @(10, 20)) },
    @{ name = 'varying-three'; spacing = @(@(11, 7), @(19, 5), @(3, 23)) },
    @{ name = 'after-dominates'; spacing = @(@(0, 40), @(5, 0)) },
    @{ name = 'before-dominates'; spacing = @(@(0, 5), @(40, 0)) },
    @{ name = 'equal-adjacent'; spacing = @(@(0, 20), @(20, 0)) }
  )
  $results = @()
  for ($index = 0; $index -lt $plans.Count; $index++) {
    $plan = $plans[$index]
    $slide = $presentation.Slides.Add($index + 1, 12)
    $shape = $slide.Shapes.AddTextbox(1, 60, 70, 450, 250)
    $shape.Name = $plan.name
    $shape.Fill.Visible = 0; $shape.Line.Visible = 0
    $frame = $shape.TextFrame2
    $frame.AutoSize = 0; $frame.WordWrap = -1; $frame.VerticalAnchor = 1
    $frame.MarginLeft = 9; $frame.MarginTop = 9; $frame.MarginRight = 9; $frame.MarginBottom = 9
    $count = $plan.spacing.Count
    $frame.TextRange.Text = (@('Hgx') * $count) -join "`r"
    $frame.TextRange.Font.Name = 'Arial'; $frame.TextRange.Font.Size = 24; $frame.TextRange.Font.Fill.ForeColor.RGB = 2702850
    for ($p = 1; $p -le $count; $p++) {
      # Reacquire paragraph range for each setter: PowerPoint's range object can
      # otherwise retain stale paragraph formatting and reset an earlier setter.
      $shape.TextFrame.TextRange.Paragraphs($p, 1).ParagraphFormat.LineRuleWithin = -1
      $shape.TextFrame.TextRange.Paragraphs($p, 1).ParagraphFormat.SpaceWithin = 1
      $shape.TextFrame.TextRange.Paragraphs($p, 1).ParagraphFormat.LineRuleBefore = 0
      $shape.TextFrame.TextRange.Paragraphs($p, 1).ParagraphFormat.SpaceBefore = [single]$plan.spacing[$p - 1][0]
      $shape.TextFrame.TextRange.Paragraphs($p, 1).ParagraphFormat.LineRuleAfter = 0
      $shape.TextFrame.TextRange.Paragraphs($p, 1).ParagraphFormat.SpaceAfter = [single]$plan.spacing[$p - 1][1]
    }
    $frame.AutoSize = 1
    $null = $frame.TextRange.BoundHeight
    $paragraphs = @()
    for ($p = 1; $p -le $count; $p++) {
      $range = $frame.TextRange.Paragraphs($p, 1)
      $glyph = $range.Characters(1, 1)
      $paragraphs += @{ index = $p; requestedBefore = $plan.spacing[$p - 1][0]; requestedAfter = $plan.spacing[$p - 1][1]; actualBefore = $shape.TextFrame.TextRange.Paragraphs($p, 1).ParagraphFormat.SpaceBefore; actualAfter = $shape.TextFrame.TextRange.Paragraphs($p, 1).ParagraphFormat.SpaceAfter; paragraphTop = $range.BoundTop; paragraphHeight = $range.BoundHeight; firstCharacterTop = $glyph.BoundTop; firstCharacterHeight = $glyph.BoundHeight }
    }
    $slide.Export((Join-Path $evidenceDirectory "$($plan.name).png"), 'PNG', 1200, 800)
    $results += @{ name = $plan.name; slide = $index + 1; paragraphCount = $count; shapeTop = $shape.Top; shapeHeight = $shape.Height; textTop = $frame.TextRange.BoundTop; textHeight = $frame.TextRange.BoundHeight; paragraphs = $paragraphs }
  }
  $presentation.SaveAs((Join-Path $evidenceDirectory 'paragraph-spacing.pptx'), 24)
  @{ productVersion = (Get-Item -LiteralPath (Join-Path $application.Path 'POWERPNT.EXE')).VersionInfo.ProductVersion; results = $results } | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $evidenceDirectory 'native-properties.json')
  $results | ForEach-Object { [pscustomobject]$_ } | Select-Object name, paragraphCount, shapeHeight, textTop, textHeight | Format-Table
} finally {
  if ($null -ne $presentation) { $presentation.Close(); [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($presentation) }
  if ($null -ne $application) {
    if ($previousProcessIds.Count -eq 0 -and $application.Presentations.Count -eq 0) { $application.Quit() }
    [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($application)
  }
  [GC]::Collect(); [GC]::WaitForPendingFinalizers()
}
