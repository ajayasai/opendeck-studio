# Read-only opening of dedicated project inputs; saved copies remain ignored.
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$evidenceDirectory = Join-Path $projectRoot 'test-results/text-decoration-powerpoint'
New-Item -ItemType Directory -Force -Path $evidenceDirectory | Out-Null
$previousProcessIds = @(Get-Process POWERPNT -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id)
$application=$null; $presentation=$null
function Read-Shape($shape, [int]$slideIndex) {
  $frame=$shape.TextFrame2; $range=$frame.TextRange
  $adjustments=@();for($j=1;$j -le $shape.Adjustments.Count;$j++){$adjustments += $shape.Adjustments.Item($j)}
  $paragraphs=@()
  for($j=1;$j -le $range.Paragraphs().Count;$j++){
    $paragraph=$range.Paragraphs($j,1)
    $first=$paragraph.Characters(1,1)
    $paragraphs += @{index=$j;left=$paragraph.BoundLeft;top=$paragraph.BoundTop;width=$paragraph.BoundWidth;height=$paragraph.BoundHeight;firstTop=$first.BoundTop;fontSize=$first.Font.Size}
  }
  return @{slide=$slideIndex;name=$shape.Name;text=$range.Text;shapeType=$shape.Type;autoShapeType=$shape.AutoShapeType;left=$shape.Left;top=$shape.Top;width=$shape.Width;height=$shape.Height;rotation=$shape.Rotation;wordWrap=$frame.WordWrap;verticalAnchor=$frame.VerticalAnchor;insetsPt=@{left=$frame.MarginLeft;right=$frame.MarginRight;top=$frame.MarginTop;bottom=$frame.MarginBottom};adjustments=$adjustments;fill=@{visible=$shape.Fill.Visible;type=$shape.Fill.Type;color=$shape.Fill.ForeColor.RGB;transparency=$shape.Fill.Transparency};line=@{visible=$shape.Line.Visible;color=$shape.Line.ForeColor.RGB;transparency=$shape.Line.Transparency;width=$shape.Line.Weight;dash=$shape.Line.DashStyle};frame=@{left=$frame.MarginLeft;right=$frame.MarginRight;top=$frame.MarginTop;bottom=$frame.MarginBottom;autoSize=$frame.AutoSize};textBounds=@{left=$range.BoundLeft;top=$range.BoundTop;width=$range.BoundWidth;height=$range.BoundHeight};paragraphs=$paragraphs}
}
try{
  $application=New-Object -ComObject PowerPoint.Application
  $inputs=@(@{prefix='original';path='tests/fixtures/powerpoint-text-decoration.pptx'},@{prefix='probe';path='tests/fixtures/powerpoint-text-decoration-probe.pptx'})
  foreach($candidate in @(@{prefix='exported';path='examples/text-decoration.pptx'},@{prefix='probe-exported';path='test-results/text-decoration-powerpoint/probe-exported.pptx'})){
    if(Test-Path -LiteralPath (Join-Path $projectRoot $candidate.path)){$inputs += $candidate}
  }
  $results=@();$resizeComparisons=@()
  foreach($inputFile in $inputs){
    $presentation=$application.Presentations.Open((Join-Path $projectRoot $inputFile.path),-1,0,0)
    $cases=@()
    for($i=1;$i -le $presentation.Slides.Count;$i++){
      $slide=$presentation.Slides.Item($i)
      $slide.Export((Join-Path $evidenceDirectory "$($inputFile.prefix)-slide-$i.png"),'PNG',1280,720)
      foreach($shape in $slide.Shapes){
        if(-not $shape.HasTextFrame -or -not $shape.TextFrame2.HasText){continue}
        $cases += Read-Shape $shape $i
      }
    }
    $presentation.SaveCopyAs((Join-Path $evidenceDirectory "$($inputFile.prefix)-resaved.pptx"),24)
    $results += @{input=$inputFile.path;sha256=(Get-FileHash -LiteralPath (Join-Path $projectRoot $inputFile.path) -Algorithm SHA256).Hash;slides=$presentation.Slides.Count;cases=$cases}
    if($inputFile.prefix -eq 'probe'){
      # Separate experiment: explicitly recompute resize-to-fit after loading
      # XML-authored endpoint flags; never write back to the frozen input.
      $slide=$presentation.Slides.Item(9)
      foreach($shape in $slide.Shapes){
        if($shape.Name -notlike 'Edge resize *'){continue}
        $before=Read-Shape $shape 9
        $shape.TextFrame2.AutoSize=0; $shape.TextFrame2.AutoSize=1
        $after=Read-Shape $shape 9
        $resizeComparisons += @{name=$shape.Name;before=$before;after=$after}
      }
      $slide.Export((Join-Path $evidenceDirectory 'probe-recomputed-resize-slide-9.png'),'PNG',1280,720)
      $presentation.SaveCopyAs((Join-Path $evidenceDirectory 'probe-recomputed-resize.pptx'),24)
    }
    $presentation.Close();[void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($presentation);$presentation=$null
  }
  @{application='Microsoft PowerPoint';version=$application.Version;productVersion=(Get-Item -LiteralPath (Join-Path $application.Path 'POWERPNT.EXE')).VersionInfo.ProductVersion;verifiedUtc=[DateTime]::UtcNow.ToString('o');results=$results;resizeComparisons=$resizeComparisons} | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath (Join-Path $evidenceDirectory 'verification.json')
  Write-Output 'Rendered decoration and endpoint-spacing controls; recorded native paint, text-region and resize properties.'
}finally{
  if($null -ne $presentation){$presentation.Close();[void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($presentation)}
  if($null -ne $application){
    if($previousProcessIds.Count -eq 0 -and $application.Presentations.Count -eq 0){$application.Quit()}
    [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($application)
  }
  [GC]::Collect();[GC]::WaitForPendingFinalizers()
}
