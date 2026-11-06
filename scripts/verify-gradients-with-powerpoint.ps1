# Open only dedicated project inputs; rendered and saved native copies stay ignored.
param([switch]$OnlyColorProbe)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$evidenceDirectory = Join-Path $projectRoot 'test-results/gradient-powerpoint'
New-Item -ItemType Directory -Force -Path $evidenceDirectory | Out-Null
$previousProcessIds = @(Get-Process POWERPNT -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id)
$application=$null; $presentation=$null
function Read-GradientFill($fill) {
  $result=@{type=$fill.Type;visible=$fill.Visible;rotation=$fill.RotateWithObject}
  if($fill.Type -eq 1){$result.color=$fill.ForeColor.RGB;$result.transparency=$fill.Transparency}
  if($fill.Type -eq 3) {
    $stops=@()
    for($i=1;$i -le $fill.GradientStops.Count;$i++){
      $stop=$fill.GradientStops.Item($i)
      $stops+=@{position=$stop.Position;color=$stop.Color.RGB;transparency=$stop.Transparency}
    }
    $result.stops=$stops
    try{$result.style=$fill.GradientStyle}catch{$result.style=$null}
    try{$result.variant=$fill.GradientVariant}catch{$result.variant=$null}
    try{$result.angle=$fill.GradientAngle}catch{$result.angle=$null}
  }
  return $result
}
try {
  $application=New-Object -ComObject PowerPoint.Application
  $inputs=@(@{prefix='original';path='tests/fixtures/powerpoint-gradients.pptx'},@{prefix='probe';path='tests/fixtures/powerpoint-gradient-probe.pptx'})
  if($OnlyColorProbe){$inputs=@(@{prefix='color-probe';path='test-results/gradient-powerpoint/color-transform-probe.pptx'})}
  foreach($candidate in $(if($OnlyColorProbe){@()}else{@(@{prefix='exported';path='examples/gradients.pptx'},@{prefix='probe-exported';path='test-results/gradient-powerpoint/probe-exported.pptx'})})) {
    if(Test-Path -LiteralPath (Join-Path $projectRoot $candidate.path)){$inputs+=$candidate}
  }
  $results=@()
  foreach($inputFile in $inputs) {
    $presentation=$application.Presentations.Open((Join-Path $projectRoot $inputFile.path),-1,0,0)
    $slides=@()
    for($i=1;$i -le $presentation.Slides.Count;$i++) {
      $slide=$presentation.Slides.Item($i)
      $slide.Export((Join-Path $evidenceDirectory "$($inputFile.prefix)-slide-$i.png"),'PNG',1280,720)
      $shapes=@()
      foreach($shape in $slide.Shapes) {
        $shapes+=@{name=$shape.Name;type=$shape.Type;preset=$shape.AutoShapeType;left=$shape.Left;top=$shape.Top;width=$shape.Width;height=$shape.Height;rotation=$shape.Rotation;fill=(Read-GradientFill $shape.Fill);line=@{visible=$shape.Line.Visible;width=$shape.Line.Weight};text=$(if($shape.HasTextFrame){$shape.TextFrame2.TextRange.Text}else{''})}
      }
      $slides+=@{slide=$i;background=(Read-GradientFill $slide.Background.Fill);followMasterBackground=$slide.FollowMasterBackground;shapes=$shapes}
    }
    $presentation.SaveCopyAs((Join-Path $evidenceDirectory "$($inputFile.prefix)-resaved.pptx"),24)
    $results+=@{input=$inputFile.path;sha256=(Get-FileHash -LiteralPath (Join-Path $projectRoot $inputFile.path) -Algorithm SHA256).Hash;slides=$slides}
    $presentation.Close();[void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($presentation);$presentation=$null
  }
  $metadataFile=$(if($OnlyColorProbe){'color-transform-verification.json'}else{'verification.json'})
  @{application='Microsoft PowerPoint';version=$application.Version;productVersion=(Get-Item -LiteralPath (Join-Path $application.Path 'POWERPNT.EXE')).VersionInfo.ProductVersion;verifiedUtc=[DateTime]::UtcNow.ToString('o');results=$results} | ConvertTo-Json -Depth 15 | Set-Content -LiteralPath (Join-Path $evidenceDirectory $metadataFile)
  Write-Output 'Rendered native gradient inputs and any available exports; recorded geometry and effective gradient stops.'
} finally {
  if($null -ne $presentation){$presentation.Close();[void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($presentation)}
  if($null -ne $application){
    if($previousProcessIds.Count -eq 0 -and $application.Presentations.Count -eq 0){$application.Quit()}
    [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($application)
  }
  [GC]::Collect();[GC]::WaitForPendingFinalizers()
}
