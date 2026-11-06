# Supplemental original native font metrics and explicitly XML-derived scale probe.
# All artifacts stay in ignored test-results. No user presentation is opened.
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$evidenceDirectory = Join-Path $projectRoot 'test-results/autofit-powerpoint/font-metrics'
New-Item -ItemType Directory -Force -Path $evidenceDirectory | Out-Null
$previousProcessIds = @(Get-Process POWERPNT -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id)
$application = $null; $presentation = $null
try {
  $application = New-Object -ComObject PowerPoint.Application
  $presentation = $application.Presentations.Add(0)
  $presentation.PageSetup.SlideWidth = 600; $presentation.PageSetup.SlideHeight = 400
  $plans = @()
  foreach ($font in @('Arial', 'Georgia', 'Calibri', 'Courier New')) {
    foreach ($size in @(24, 30)) {
      foreach ($spacing in @(1, 1.5)) {
        $plans += @{ font = $font; size = $size; spacing = $spacing }
        $slide = $presentation.Slides.Add($plans.Count, 12)
        $shape = $slide.Shapes.AddTextbox(1, 60, 70, 450, 250)
        $shape.Name = "$font $size spacing$spacing"
        $frame = $shape.TextFrame2
        $frame.AutoSize = 0; $frame.WordWrap = 0; $frame.VerticalAnchor = 1
        $frame.MarginLeft = 9; $frame.MarginTop = 9; $frame.MarginRight = 9; $frame.MarginBottom = 9
        $frame.TextRange.Text = "Hgx`vHgx`vHgx"
        $frame.TextRange.Font.Name = $font; $frame.TextRange.Font.Size = $size
        $frame.TextRange.Font.Fill.ForeColor.RGB = 2702850
        $shape.TextFrame.TextRange.ParagraphFormat.LineRuleBefore = 0
        $shape.TextFrame.TextRange.ParagraphFormat.SpaceBefore = 0
        $shape.TextFrame.TextRange.ParagraphFormat.LineRuleAfter = 0
        $shape.TextFrame.TextRange.ParagraphFormat.SpaceAfter = 0
        $shape.TextFrame.TextRange.ParagraphFormat.LineRuleWithin = -1
        $shape.TextFrame.TextRange.ParagraphFormat.SpaceWithin = [single]$spacing
      }
    }
  }
  $presentation.SaveAs((Join-Path $evidenceDirectory 'original.pptx'), 24)
  $presentation.Close(); [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($presentation); $presentation = $null
  & node (Join-Path $PSScriptRoot 'prepare-font-line-metrics.mjs')
  if ($LASTEXITCODE -ne 0) { throw 'Preparing derived scale probe failed.' }
  $results = @()
  foreach ($variant in @('original', 'scaled-probe')) {
    $presentation = $application.Presentations.Open((Join-Path $evidenceDirectory "$variant.pptx"), -1, 0, 0)
    for ($i = 1; $i -le $presentation.Slides.Count; $i++) {
      $slide = $presentation.Slides.Item($i); $shape = $slide.Shapes.Item(1); $range = $shape.TextFrame2.TextRange
      $samples = @()
      foreach ($position in @(1, 5, 9)) {
        $character = $range.Characters($position, 1)
        $samples += @{ character = $character.Text; font = $character.Font.Name; fontSize = $character.Font.Size; top = $character.BoundTop; height = $character.BoundHeight; width = $character.BoundWidth }
      }
      $slide.Export((Join-Path $evidenceDirectory "$variant-$i.png"), 'PNG', 1200, 800)
      $results += @{ variant = $variant; name = $shape.Name; requested = $plans[$i - 1]; samples = $samples; lineAdvance = $samples[1].top - $samples[0].top }
    }
    $presentation.SaveCopyAs((Join-Path $evidenceDirectory "$variant-resaved.pptx"), 24)
    $presentation.Close(); [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($presentation); $presentation = $null
  }
  @{ productVersion = (Get-Item -LiteralPath (Join-Path $application.Path 'POWERPNT.EXE')).VersionInfo.ProductVersion; results = $results } | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $evidenceDirectory 'native-properties.json')
  $results | ForEach-Object { [pscustomobject]@{ variant = $_.variant; name = $_.name; effectiveSize = $_.samples[0].fontSize; advance = $_.lineAdvance; perEm = $_.lineAdvance / $_.requested.spacing / $_.samples[0].fontSize } } | Format-Table
} finally {
  if ($null -ne $presentation) { $presentation.Close(); [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($presentation) }
  if ($null -ne $application) {
    if ($previousProcessIds.Count -eq 0 -and $application.Presentations.Count -eq 0) { $application.Quit() }
    [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($application)
  }
  [GC]::Collect(); [GC]::WaitForPendingFinalizers()
}
