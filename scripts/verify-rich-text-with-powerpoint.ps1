# Native-app validation of original rich-text fixture and OpenDeck re-export.
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$renderDirectory = Join-Path $projectRoot 'test-results/rich-text-powerpoint'
New-Item -ItemType Directory -Force -Path $renderDirectory | Out-Null
$previousProcessIds = @(Get-Process POWERPNT -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id)
$application = $null
$presentation = $null
try {
  $application = New-Object -ComObject PowerPoint.Application
  $inputs = @(@{ prefix = 'original'; path = 'tests/fixtures/powerpoint-rich-text.pptx' }, @{ prefix = 'exported'; path = 'examples/rich-text.pptx' })
  $results = @()
  foreach ($inputFile in $inputs) {
    $presentation = $application.Presentations.Open((Join-Path $projectRoot $inputFile.path), -1, 0, 0)
    for ($i = 1; $i -le $presentation.Slides.Count; $i++) {
      $presentation.Slides.Item($i).Export((Join-Path $renderDirectory "$($inputFile.prefix)-slide-$i.png"), 'PNG', 1280, 720)
    }
    $results += @{ input = $inputFile.path; slideCount = $presentation.Slides.Count }
    if ($inputFile.prefix -eq 'exported') { $presentation.SaveCopyAs((Join-Path $renderDirectory 'powerpoint-resaved.pptx'), 24) }
    $presentation.Close(); [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($presentation); $presentation = $null
  }
  @{ application = 'Microsoft PowerPoint'; version = $application.Version; results = $results } | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $renderDirectory 'verification.json')
  $results | ConvertTo-Json
} finally {
  if ($null -ne $presentation) { $presentation.Close(); [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($presentation) }
  if ($null -ne $application) {
    if ($previousProcessIds.Count -eq 0 -and $application.Presentations.Count -eq 0) { $application.Quit() }
    [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($application)
  }
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
}
node (Join-Path $PSScriptRoot 'check-rich-office-roundtrip.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Native rich-text round-trip check failed.' }
