# Windows-only optional interoperability fixture authoring. Requires PowerPoint.
# Creates original content in an isolated presentation with no visible window.
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$fixtureDirectory = Join-Path $projectRoot 'tests/fixtures'
New-Item -ItemType Directory -Force -Path $fixtureDirectory | Out-Null
$fixturePath = Join-Path $fixtureDirectory 'powerpoint-original.pptx'
$previousProcessIds = @(Get-Process POWERPNT -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id)
$application = $null
$presentation = $null
try {
  $application = New-Object -ComObject PowerPoint.Application
  $presentation = $application.Presentations.Add(0)
  $presentation.PageSetup.SlideWidth = 960
  $presentation.PageSetup.SlideHeight = 540
  $first = $presentation.Slides.Add(1, 12)
  $text = $first.Shapes.AddTextbox(1, 72, 36, 500, 100)
  $text.Name = 'Original heading'
  $text.TextFrame.TextRange.Text = "Original PowerPoint fixture`rAn editable interoperability sample"
  $text.TextFrame.TextRange.Font.Name = 'Arial'
  $text.TextFrame.TextRange.Font.Size = 28
  $text.TextFrame.TextRange.Font.Color.RGB = 4411159
  $text.TextFrame.TextRange.Font.Bold = -1
  $text.TextFrame.MarginLeft = 0
  $text.TextFrame.MarginTop = 0
  $oval = $first.Shapes.AddShape(9, 600, 80, 120, 120)
  $oval.Name = 'Original circle'
  $oval.Fill.ForeColor.RGB = 8951991
  $oval.Line.Visible = 0
  $table = $first.Shapes.AddTable(3, 2, 72, 300, 500, 120).Table
  $cells = @(@('Item','Value'), @('Alpha','12'), @('Beta','31'))
  for ($r = 1; $r -le 3; $r++) {
    for ($c = 1; $c -le 2; $c++) {
      $table.Cell($r, $c).Shape.TextFrame.TextRange.Text = $cells[$r - 1][$c - 1]
    }
  }
  $first.NotesPage.Shapes.Placeholders.Item(2).TextFrame.TextRange.Text = 'Original speaker notes authored through the PowerPoint object model.'
  $second = $presentation.Slides.Add(2, 1)
  $second.Shapes.Title.TextFrame.TextRange.Text = 'First in presentation order'
  $second.Shapes.Placeholders.Item(2).TextFrame.TextRange.Text = 'Placeholder geometry inherited from the layout.'
  $second.MoveTo(1)
  $presentation.SaveAs($fixturePath, 24)
  Write-Output "Created $fixturePath"
} finally {
  if ($null -ne $presentation) { $presentation.Close(); [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($presentation) }
  # PowerPoint may return a running COM server. Never quit a pre-existing session.
  if ($null -ne $application) {
    if ($previousProcessIds.Count -eq 0 -and $application.Presentations.Count -eq 0) { $application.Quit() }
    [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($application)
  }
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
}
node (Join-Path $PSScriptRoot 'sanitize-pptx-fixture.mjs') $fixturePath
if ($LASTEXITCODE -ne 0) { throw 'Fixture metadata sanitation failed.' }
