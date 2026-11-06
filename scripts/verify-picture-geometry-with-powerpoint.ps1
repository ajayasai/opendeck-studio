# Open only dedicated original/probe/export files. Evidence stays ignored.
param([switch]$OnlyEdges,[switch]$OnlyEditor)
$ErrorActionPreference='Stop'
$projectRoot=Split-Path -Parent $PSScriptRoot
$evidenceDirectory=Join-Path $projectRoot 'test-results/picture-geometry-powerpoint'
New-Item -ItemType Directory -Force -Path $evidenceDirectory | Out-Null
$previousProcessIds=@(Get-Process POWERPNT -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id)
$application=$null;$presentation=$null;$results=@()
function Read-Picture($shape){
 $crop=$shape.PictureFormat.Crop
 return @{name=$shape.Name;left=$shape.Left;top=$shape.Top;width=$shape.Width;height=$shape.Height;rotation=$shape.Rotation;flipH=$shape.HorizontalFlip;flipV=$shape.VerticalFlip;preset=$shape.AutoShapeType;crop=@{left=$shape.PictureFormat.CropLeft;top=$shape.PictureFormat.CropTop;right=$shape.PictureFormat.CropRight;bottom=$shape.PictureFormat.CropBottom};picture=@{width=$crop.PictureWidth;height=$crop.PictureHeight;offsetX=$crop.PictureOffsetX;offsetY=$crop.PictureOffsetY;shapeLeft=$crop.ShapeLeft;shapeTop=$crop.ShapeTop;shapeWidth=$crop.ShapeWidth;shapeHeight=$crop.ShapeHeight}}
}
try{
 $application=New-Object -ComObject PowerPoint.Application
 $inputs=@(@{prefix='original';path='tests/fixtures/powerpoint-picture-geometry.pptx'},@{prefix='probe';path='tests/fixtures/powerpoint-picture-geometry-probe.pptx'})
 if($OnlyEditor){$inputs=@(@{prefix='editor-authored';path='test-results/picture-geometry-powerpoint/editor-authored.pptx'})}
 elseif($OnlyEdges){$inputs=@();foreach($kind in @('source-zero','source-inverted','fill-zero','fill-inverted','tile-default','tile-negative')){$inputs+=@{prefix=('edge-'+$kind);path=('test-results/picture-geometry-powerpoint/edge-'+$kind+'.pptx')}}}
 else{foreach($candidate in @(@{prefix='exported';path='examples/picture-geometry.pptx'},@{prefix='probe-exported';path='test-results/picture-geometry-powerpoint/probe-exported.pptx'})){if(Test-Path -LiteralPath (Join-Path $projectRoot $candidate.path)){$inputs+=$candidate}}}
 foreach($input in $inputs){
  $path=Join-Path $projectRoot $input.path;$record=@{input=$input.path;sha256=(Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash}
  try{
   $presentation=$application.Presentations.Open($path,-1,0,0);$slides=@()
   foreach($slide in $presentation.Slides){
    $pictures=@();foreach($shape in $slide.Shapes){if($shape.Type -eq 13){$pictures+=Read-Picture $shape}}
    $slides+=@{slide=$slide.SlideIndex;objectCount=$slide.Shapes.Count;pictures=$pictures}
    if(-not $OnlyEdges -or $slide.SlideIndex -eq 1){$slide.Export((Join-Path $evidenceDirectory ($input.prefix+'-slide-'+$slide.SlideIndex+'.png')),'PNG',1280,720)}
   }
   $presentation.SaveCopyAs((Join-Path $evidenceDirectory ($input.prefix+'-resaved.pptx')),24);$record.slides=$slides;$record.opened=$true
  }catch{$record.opened=$false;$record.error=$_.Exception.Message;if(-not $OnlyEdges){throw}}
  finally{if($null -ne $presentation){$presentation.Close();$presentation=$null}}
  $results+=$record
 }
 $powerPointExe=Join-Path $application.Path 'POWERPNT.EXE'
 $filename=if($OnlyEditor){'editor-verification.json'}elseif($OnlyEdges){'edge-verification.json'}else{'verification.json'}
 @{verifiedUtc=[DateTime]::UtcNow.ToString('o');version=$application.Version;productVersion=(Get-Item -LiteralPath $powerPointExe).VersionInfo.ProductVersion;results=$results}|ConvertTo-Json -Depth 20|Set-Content -LiteralPath (Join-Path $evidenceDirectory $filename) -Encoding UTF8
}finally{
 if($null -ne $presentation){$presentation.Close()}
 if($null -ne $application){if($previousProcessIds.Count -eq 0 -and $application.Presentations.Count -eq 0){$application.Quit()};[void][System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($application)}
}
Write-Output ('Verified '+$results.Count+' dedicated picture geometry packages.')
