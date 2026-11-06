# Optional Windows validation against installed Microsoft PowerPoint.
# The input must be an original generated project example; outputs are ignored.
param([string]$InputName = 'field-notes.pptx')
$ErrorActionPreference = 'Stop'
if ($InputName -ne 'field-notes.pptx') { throw 'This verifier is restricted to the original field-notes example.' }
$projectRoot = Split-Path -Parent $PSScriptRoot
$inputPath = Join-Path $projectRoot "examples/$InputName"
$renderDirectory = Join-Path $projectRoot 'test-results/powerpoint-render'
New-Item -ItemType Directory -Force -Path $renderDirectory | Out-Null
$previousProcessIds = @(Get-Process POWERPNT -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id)
$application = $null
$presentation = $null
try {
  $application = New-Object -ComObject PowerPoint.Application
  $presentation = $application.Presentations.Open($inputPath, -1, 0, 0)
  $slideInfo = @()
  for ($i = 1; $i -le $presentation.Slides.Count; $i++) {
    $slide = $presentation.Slides.Item($i)
    $slide.Export((Join-Path $renderDirectory "slide-$i.png"), 'PNG', 1280, 720)
    $slideInfo += @{ index = $i; objects = $slide.Shapes.Count }
  }
  $presentation.SaveCopyAs((Join-Path $renderDirectory 'powerpoint-resaved.pptx'), 24)
  $info = @{ application = 'Microsoft PowerPoint'; version = $application.Version; slideCount = $presentation.Slides.Count; slides = $slideInfo; input = 'examples/field-notes.pptx' }
  $info | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $renderDirectory 'verification.json')
  $info | ConvertTo-Json -Depth 5
} finally {
  if ($null -ne $presentation) { $presentation.Close(); [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($presentation) }
  if ($null -ne $application) {
    if ($previousProcessIds.Count -eq 0 -and $application.Presentations.Count -eq 0) { $application.Quit() }
    [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($application)
  }
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
}
node (Join-Path $PSScriptRoot 'check-office-roundtrip.mjs')
if ($LASTEXITCODE -ne 0) { throw 'PowerPoint re-save round-trip verification failed.' }
