# Original rich-text fixture authored through the Microsoft PowerPoint object model.
# No visible window, no existing documents, no imported third-party content.
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$fixtureDirectory = Join-Path $projectRoot 'tests/fixtures'
New-Item -ItemType Directory -Force -Path $fixtureDirectory | Out-Null
$fixturePath = Join-Path $fixtureDirectory 'powerpoint-rich-text.pptx'
$previousProcessIds = @(Get-Process POWERPNT -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id)
$application = $null
$presentation = $null
try {
  $application = New-Object -ComObject PowerPoint.Application
  $presentation = $application.Presentations.Add(0)
  $presentation.PageSetup.SlideWidth = 960
  $presentation.PageSetup.SlideHeight = 540
  $first = $presentation.Slides.Add(1, 12)
  $heading = $first.Shapes.AddTextbox(1, 54, 42, 850, 60)
  $heading.Name = 'Rich text heading'
  $heading.TextFrame.TextRange.Text = 'PowerPoint rich text'
  $heading.TextFrame.TextRange.Font.Name = 'Georgia'
  $heading.TextFrame.TextRange.Font.Size = 36
  $heading.TextFrame.TextRange.Font.Bold = -1
  $rich = $first.Shapes.AddTextbox(1, 54, 140, 850, 330)
  $rich.Name = 'Mixed runs and paragraphs'
  $range = $rich.TextFrame.TextRange
  $range.Text = "Original bold, italic, color, and link.`rSecond paragraph with larger type.`r`rSoft line`vbreak stays in one paragraph."
  $range.Font.Name = 'Arial'
  $range.Font.Size = 24
  $range.Font.Color.RGB = 2702850
  $range.Characters($range.Text.IndexOf('bold') + 1, 4).Font.Bold = -1
  $range.Characters($range.Text.IndexOf('italic') + 1, 6).Font.Italic = -1
  $range.Characters($range.Text.IndexOf('color') + 1, 5).Font.Color.RGB = 3500743
  $link = $range.Characters($range.Text.IndexOf('link') + 1, 4)
  $link.Font.Underline = -1
  $link.ActionSettings.Item(1).Hyperlink.Address = 'https://example.com/opendeck?from=fixture&mode=rich'
  $range.Paragraphs(1).ParagraphFormat.LineRuleBefore = 0
  $range.Paragraphs(1).ParagraphFormat.SpaceBefore = 6
  $range.Paragraphs(1).ParagraphFormat.LineRuleAfter = 0
  $range.Paragraphs(1).ParagraphFormat.SpaceAfter = 12
  $range.Paragraphs(1).ParagraphFormat.LineRuleWithin = -1
  $range.Paragraphs(1).ParagraphFormat.SpaceWithin = 1.25
  $range.Paragraphs(2).Font.Size = 30
  $range.Paragraphs(2).Font.Name = 'Georgia'
  $range.Paragraphs(2).ParagraphFormat.Alignment = 2
  $first.NotesPage.Shapes.Placeholders.Item(2).TextFrame.TextRange.Text = 'Rich runs, paragraph spacing, an external hyperlink, a blank paragraph, and a soft line break.'

  $second = $presentation.Slides.Add(2, 12)
  $title = $second.Shapes.AddTextbox(1, 54, 42, 850, 60)
  $title.Name = 'Lists heading'
  $title.TextFrame.TextRange.Text = 'Real bullets and numbered lists'
  $title.TextFrame.TextRange.Font.Size = 34
  $title.TextFrame.TextRange.Font.Bold = -1
  $bullets = $second.Shapes.AddTextbox(1, 70, 150, 380, 280)
  $bullets.Name = 'Bullet list'
  $bullets.TextFrame.TextRange.Text = "First bullet`rNested bullet`rThird bullet"
  $bullets.TextFrame.TextRange.Font.Name = 'Arial'
  $bullets.TextFrame.TextRange.Font.Size = 26
  $bullets.TextFrame.TextRange.ParagraphFormat.Bullet.Type = 1
  $bullets.TextFrame.TextRange.ParagraphFormat.Bullet.Character = 8226
  $bullets.TextFrame.TextRange.Paragraphs(2).IndentLevel = 2
  $numbers = $second.Shapes.AddTextbox(1, 510, 150, 380, 280)
  $numbers.Name = 'Numbered list'
  $numbers.TextFrame.TextRange.Text = "Start at three`rContinue at four`rContinue at five"
  $numbers.TextFrame.TextRange.Font.Name = 'Arial'
  $numbers.TextFrame.TextRange.Font.Size = 26
  $numbers.TextFrame.TextRange.ParagraphFormat.Bullet.Type = 2
  $numbers.TextFrame.TextRange.ParagraphFormat.Bullet.Style = 3
  $numbers.TextFrame.TextRange.Paragraphs(1).ParagraphFormat.Bullet.StartValue = 3
  $second.NotesPage.Shapes.Placeholders.Item(2).TextFrame.TextRange.Text = 'Original bulleted and numbered list fixture. Numbered sequence starts at three.'
  $presentation.SaveAs($fixturePath, 24)
  Write-Output "Created $fixturePath"
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
