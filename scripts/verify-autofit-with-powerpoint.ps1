# Records actual native drawing metrics without editing user files or opening windows.
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$evidenceDirectory = Join-Path $projectRoot 'test-results/autofit-powerpoint'
New-Item -ItemType Directory -Force -Path $evidenceDirectory | Out-Null
$previousProcessIds = @(Get-Process POWERPNT -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id)
$application = $null
$presentation = $null
try {
  $application = New-Object -ComObject PowerPoint.Application
  $inputs = @(@{ prefix = 'original'; path = 'tests/fixtures/powerpoint-autofit.pptx' }, @{ prefix = 'probe'; path = 'tests/fixtures/powerpoint-autofit-saved-scale-probe.pptx' })
  if (Test-Path -LiteralPath (Join-Path $projectRoot 'examples/autofit.pptx')) { $inputs += @{ prefix = 'exported'; path = 'examples/autofit.pptx' } }
  if (Test-Path -LiteralPath (Join-Path $projectRoot 'test-results/autofit-powerpoint/original-exported.pptx')) { $inputs += @{ prefix = 'original-exported'; path = 'test-results/autofit-powerpoint/original-exported.pptx' } }
  $results = @()
  foreach ($inputFile in $inputs) {
    $presentation = $application.Presentations.Open((Join-Path $projectRoot $inputFile.path), -1, 0, 0)
    $cases = @()
    for ($i = 1; $i -le $presentation.Slides.Count; $i++) {
      $slide = $presentation.Slides.Item($i)
      $slide.Export((Join-Path $evidenceDirectory "$($inputFile.prefix)-slide-$i.png"), 'PNG', 1280, 720)
      for ($j = 1; $j -le $slide.Shapes.Count; $j++) {
        $shape = $slide.Shapes.Item($j)
        if (-not $shape.HasTextFrame -or -not $shape.TextFrame2.HasText) { continue }
        $frame = $shape.TextFrame2; $range = $frame.TextRange
        $samples = @(); $positions = [System.Collections.Generic.List[int]]::new(); $positions.Add(1)
        for ($index = 0; $index -lt $range.Text.Length - 1; $index++) { if ([int][char]$range.Text[$index] -in @(10, 11, 13)) { $positions.Add($index + 2) } }
        if ($shape.Name -eq 'Mixed shrink') { $positions.Add(25); $positions.Add(50) }
        foreach ($index in $positions) {
          $character = $range.Characters($index, 1)
          $samples += @{ index = $index; character = $character.Text; comFontSize = $character.Font.Size; comFontName = $character.Font.Name; boundTop = $character.BoundTop; boundLeft = $character.BoundLeft; boundHeight = $character.BoundHeight; boundWidth = $character.BoundWidth }
        }
        $cases += @{ slide = $i; name = $shape.Name; autoSize = $frame.AutoSize; rotation = $shape.Rotation; verticalAnchor = $frame.VerticalAnchor; wordWrap = $frame.WordWrap; shapePt = @{ left = $shape.Left; top = $shape.Top; width = $shape.Width; height = $shape.Height }; insetsPt = @{ left = $frame.MarginLeft; top = $frame.MarginTop; right = $frame.MarginRight; bottom = $frame.MarginBottom }; text = $range.Text; boundsPt = @{ left = $range.BoundLeft; top = $range.BoundTop; width = $range.BoundWidth; height = $range.BoundHeight }; samples = $samples }
      }
    }
    $presentation.SaveCopyAs((Join-Path $evidenceDirectory "$($inputFile.prefix)-resaved.pptx"), 24)
    $results += @{ input = $inputFile.path; sha256 = (Get-FileHash -LiteralPath (Join-Path $projectRoot $inputFile.path) -Algorithm SHA256).Hash; slides = $presentation.Slides.Count; cases = $cases }
    $presentation.Close(); [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($presentation); $presentation = $null
  }
  @{ application = 'Microsoft PowerPoint'; version = $application.Version; productVersion = (Get-Item -LiteralPath (Join-Path $application.Path 'POWERPNT.EXE')).VersionInfo.ProductVersion; verifiedUtc = [DateTime]::UtcNow.ToString('o'); results = $results } | ConvertTo-Json -Depth 9 | Set-Content -LiteralPath (Join-Path $evidenceDirectory 'verification.json')
  Write-Output "Rendered native controls, saved-factor probe, and available OpenDeck exports with sampled character/line bounds."
} finally {
  if ($null -ne $presentation) { $presentation.Close(); [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($presentation) }
  if ($null -ne $application) {
    if ($previousProcessIds.Count -eq 0 -and $application.Presentations.Count -eq 0) { $application.Quit() }
    [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($application)
  }
  [GC]::Collect(); [GC]::WaitForPendingFinalizers()
}
