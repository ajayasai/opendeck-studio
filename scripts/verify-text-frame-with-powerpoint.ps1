# Native evidence for the original fixture, separately derived clip probe, and
# optional OpenDeck export. Only opens project artifacts in invisible windows.
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$renderDirectory = Join-Path $projectRoot 'test-results/text-frame-powerpoint'
New-Item -ItemType Directory -Force -Path $renderDirectory | Out-Null
$previousProcessIds = @(Get-Process POWERPNT -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id)
$application = $null
$presentation = $null
try {
  $application = New-Object -ComObject PowerPoint.Application
  $inputs = @(@{ prefix = 'original'; path = 'tests/fixtures/powerpoint-text-frame.pptx' }, @{ prefix = 'probe'; path = 'tests/fixtures/powerpoint-text-frame-clip-probe.pptx' })
  if (Test-Path -LiteralPath (Join-Path $projectRoot 'examples/text-frame.pptx')) { $inputs += @{ prefix = 'exported'; path = 'examples/text-frame.pptx' } }
  if (Test-Path -LiteralPath (Join-Path $renderDirectory 'clip-probe-exported.pptx')) { $inputs += @{ prefix = 'probe-exported'; path = 'test-results/text-frame-powerpoint/clip-probe-exported.pptx' } }
  $results = @()
  foreach ($inputFile in $inputs) {
    $presentation = $application.Presentations.Open((Join-Path $projectRoot $inputFile.path), -1, 0, 0)
    $shapes = @()
    for ($i = 1; $i -le $presentation.Slides.Count; $i++) {
      $slide = $presentation.Slides.Item($i)
      $slide.Export((Join-Path $renderDirectory "$($inputFile.prefix)-slide-$i.png"), 'PNG', 1280, 720)
      for ($j = 1; $j -le $slide.Shapes.Count; $j++) {
        $shape = $slide.Shapes.Item($j)
        if ($shape.HasTextFrame -and $shape.TextFrame2.HasText) {
          $frame = $shape.TextFrame2
          $range = $frame.TextRange
          $shapes += @{ slide = $i; name = $shape.Name; insetsPt = @{ left = $frame.MarginLeft; top = $frame.MarginTop; right = $frame.MarginRight; bottom = $frame.MarginBottom }; shapePt = @{ left = $shape.Left; top = $shape.Top; width = $shape.Width; height = $shape.Height }; textBoundsPt = @{ left = $range.BoundLeft; top = $range.BoundTop; width = $range.BoundWidth; height = $range.BoundHeight }; wordWrap = $frame.WordWrap; verticalAnchor = $frame.VerticalAnchor; autoSize = $frame.AutoSize; text = $range.Text }
        }
      }
    }
    $results += @{ input = $inputFile.path; sha256 = (Get-FileHash -LiteralPath (Join-Path $projectRoot $inputFile.path) -Algorithm SHA256).Hash; slideCount = $presentation.Slides.Count; shapes = $shapes }
    if ($inputFile.prefix -eq 'exported') { $presentation.SaveCopyAs((Join-Path $renderDirectory 'powerpoint-resaved.pptx'), 24) }
    if ($inputFile.prefix -eq 'probe') { $presentation.SaveCopyAs((Join-Path $renderDirectory 'probe-resaved.pptx'), 24) }
    if ($inputFile.prefix -eq 'probe-exported') { $presentation.SaveCopyAs((Join-Path $renderDirectory 'probe-exported-resaved.pptx'), 24) }
    $presentation.Close(); [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($presentation); $presentation = $null
  }
  $binary = Join-Path $application.Path 'POWERPNT.EXE'
  $productVersion = (Get-Item -LiteralPath $binary).VersionInfo.ProductVersion
  @{ application = 'Microsoft PowerPoint'; version = $application.Version; productVersion = $productVersion; verifiedUtc = [DateTime]::UtcNow.ToString('o'); results = $results } | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $renderDirectory 'verification.json')
  Write-Output "Rendered and inspected $($results.Count) project artifacts in PowerPoint $($application.Version) ($productVersion)."
} finally {
  if ($null -ne $presentation) { $presentation.Close(); [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($presentation) }
  if ($null -ne $application) {
    if ($previousProcessIds.Count -eq 0 -and $application.Presentations.Count -eq 0) { $application.Quit() }
    [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($application)
  }
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
}
if (Test-Path -LiteralPath (Join-Path $projectRoot 'examples/text-frame.pptx')) {
  node (Join-Path $PSScriptRoot 'check-text-frame-office-roundtrip.mjs')
  if ($LASTEXITCODE -ne 0) { throw 'Native text-frame round-trip check failed.' }
}
