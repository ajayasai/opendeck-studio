# Supplemental native geometry experiment. Outputs remain in ignored test-results.
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$evidenceDirectory = Join-Path $projectRoot 'test-results/autofit-powerpoint'
New-Item -ItemType Directory -Force -Path $evidenceDirectory | Out-Null
$previousProcessIds = @(Get-Process POWERPNT -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id)
$application = $null; $presentation = $null
try {
  $application = New-Object -ComObject PowerPoint.Application
  $presentation = $application.Presentations.Add(0)
  $slide = $presentation.Slides.Add(1, 12)
  $results = @()
  $plans = @()
  foreach ($angle in @(0, 0.00001, 0.1, 90, 180, 270, 350, 359.9, 360)) {
    foreach ($anchor in @(1, 3, 4)) { $plans += @{ rotation = $angle; anchor = $anchor; alignment = 1; wrap = $true } }
  }
  foreach ($angle in @(0, 90, 180)) {
    foreach ($alignment in @(1, 2, 3)) { $plans += @{ rotation = $angle; anchor = 1; alignment = $alignment; wrap = $false } }
  }
  foreach ($plan in $plans) {
    $shape = $slide.Shapes.AddTextbox(1, 100, 200, 200, 50)
    $shape.Name = "Resize angle$($plan.rotation) anchor$($plan.anchor) alignment$($plan.alignment) wrap$($plan.wrap)"
    $frame = $shape.TextFrame2
    $frame.AutoSize = 0
    $frame.WordWrap = $(if ($plan.wrap) { -1 } else { 0 })
    $frame.VerticalAnchor = $plan.anchor
    $frame.MarginLeft = 9; $frame.MarginTop = 9; $frame.MarginRight = 9; $frame.MarginBottom = 9
    $frame.TextRange.Text = $(if ($plan.wrap) { "First line.`rSecond line.`rThird line." } else { 'A longer line expands the shape.' })
    $frame.TextRange.Font.Name = 'Arial'; $frame.TextRange.Font.Size = 24
    $shape.TextFrame.TextRange.ParagraphFormat.Alignment = $plan.alignment
    $shape.Rotation = [single]$plan.rotation
    $before = @{ left = $shape.Left; top = $shape.Top; width = $shape.Width; height = $shape.Height }
    $frame.AutoSize = 1
    $null = $frame.TextRange.BoundHeight
    $after = @{ left = $shape.Left; top = $shape.Top; width = $shape.Width; height = $shape.Height }
    $results += @{ requested = $plan; actualRotation = $shape.Rotation; before = $before; after = $after; deltaLeft = $shape.Left - $before.left; deltaTop = $shape.Top - $before.top; deltaWidth = $shape.Width - $before.width; deltaHeight = $shape.Height - $before.height }
  }
  $presentation.SaveAs((Join-Path $evidenceDirectory 'resize-geometry-probe.pptx'), 24)
  @{ version = $application.Version; productVersion = (Get-Item -LiteralPath (Join-Path $application.Path 'POWERPNT.EXE')).VersionInfo.ProductVersion; results = $results } | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $evidenceDirectory 'resize-geometry-probe.json')
  $results | ForEach-Object { [pscustomobject]@{ rotation = $_.actualRotation; anchor = $_.requested.anchor; alignment = $_.requested.alignment; wrap = $_.requested.wrap; deltaX = $_.deltaLeft; deltaY = $_.deltaTop; deltaW = $_.deltaWidth; deltaH = $_.deltaHeight } } | Format-Table
} finally {
  if ($null -ne $presentation) { $presentation.Close(); [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($presentation) }
  if ($null -ne $application) {
    if ($previousProcessIds.Count -eq 0 -and $application.Presentations.Count -eq 0) { $application.Quit() }
    [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($application)
  }
  [GC]::Collect(); [GC]::WaitForPendingFinalizers()
}
