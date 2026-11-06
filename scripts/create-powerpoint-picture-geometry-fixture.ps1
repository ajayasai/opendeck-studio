# Original project raster/picture controls, authored through PowerPoint COM.
# Own presentations only; no visible window or existing user document is used.
$ErrorActionPreference='Stop'
$projectRoot=Split-Path -Parent $PSScriptRoot
$evidenceDirectory=Join-Path $projectRoot 'test-results/picture-geometry-powerpoint'
New-Item -ItemType Directory -Force -Path $evidenceDirectory | Out-Null
$fixturePath=Join-Path $projectRoot 'tests/fixtures/powerpoint-picture-geometry.pptx'
$imagePath=Join-Path $projectRoot 'tests/fixtures/picture-geometry-calibration.png'
$alphaPath=Join-Path $projectRoot 'tests/fixtures/picture-geometry-alpha.png'
$previousProcessIds=@(Get-Process POWERPNT -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id)
$application=$null;$presentation=$null;$authoringNotes=@();$exifInsertion=@()
function Color-Value([string]$hex){return [Convert]::ToInt32($hex.Substring(0,2),16)+256*[Convert]::ToInt32($hex.Substring(2,2),16)+65536*[Convert]::ToInt32($hex.Substring(4,2),16)}
function Label($slide,[string]$name,[string]$text,[double]$x,[double]$y,[double]$width=880,[double]$size=16){
 $shape=$slide.Shapes.AddTextbox(1,$x,$y,$width,35);$shape.Name=$name;$shape.Fill.Visible=0;$shape.Line.Visible=0
 $shape.TextFrame2.AutoSize=0;$shape.TextFrame2.WordWrap=-1
 $shape.TextFrame2.MarginLeft=0;$shape.TextFrame2.MarginTop=0;$shape.TextFrame2.MarginRight=0;$shape.TextFrame2.MarginBottom=0
 $shape.TextFrame2.TextRange.Text=$text;$shape.TextFrame2.TextRange.Font.Name='Arial';$shape.TextFrame2.TextRange.Font.Size=$size;$shape.TextFrame2.TextRange.Font.Fill.ForeColor.RGB=(Color-Value '172E29')
 return $shape
}
function Add-Slide([string]$title,[string]$notes){
 $slide=$presentation.Slides.Add($presentation.Slides.Count+1,12);$slide.FollowMasterBackground=0;$slide.Background.Fill.Solid();$slide.Background.Fill.ForeColor.RGB=(Color-Value 'F1F3F5')
 $heading=Label $slide ('Heading '+$slide.SlideIndex) $title 35 20 900 25;$heading.TextFrame2.TextRange.Font.Bold=-1
 $slide.NotesPage.Shapes.Placeholders.Item(2).TextFrame.TextRange.Text=$notes
 return $slide
}
function Add-Picture($slide,[string]$name,[double]$x,[double]$y,[double]$width,[double]$height,[double[]]$source=@(0,0,0,0),[bool]$flipH=$false,[bool]$flipV=$false,[double]$rotation=0,[string]$path=$imagePath){
 # source values are left,top,right,bottom. The original bitmap remains embedded.
 $marker=$slide.Shapes.AddShape(1,$x,$y,$width,$height);$marker.Name='Bounds '+$name;$marker.Fill.Solid();$marker.Fill.ForeColor.RGB=(Color-Value 'D5DAE0');$marker.Line.ForeColor.RGB=(Color-Value '5E6670');$marker.Line.Weight=1
 $shape=$slide.Shapes.AddPicture($path,0,-1,$x,$y,$width,$height);$shape.Name=$name;$shape.AlternativeText='Original coordinate calibration image: '+$name;$shape.LockAspectRatio=0;$shape.Line.Visible=0;$shape.Shadow.Visible=0
 $crop=$shape.PictureFormat.Crop
 $crop.ShapeWidth=$width;$crop.ShapeHeight=$height
 $pictureWidth=$width/(1-$source[0]-$source[2]);$pictureHeight=$height/(1-$source[1]-$source[3])
 $crop.PictureWidth=$pictureWidth;$crop.PictureHeight=$pictureHeight
 $crop.PictureOffsetX=($source[2]-$source[0])*$pictureWidth/2;$crop.PictureOffsetY=($source[3]-$source[1])*$pictureHeight/2
 $crop.ShapeLeft=$x;$crop.ShapeTop=$y
 if($flipH){$shape.Flip(0)};if($flipV){$shape.Flip(1)};$shape.Rotation=$rotation;$marker.Rotation=$rotation
 return $shape
}
function Read-Picture($shape){
 $crop=$shape.PictureFormat.Crop
 return @{name=$shape.Name;left=$shape.Left;top=$shape.Top;width=$shape.Width;height=$shape.Height;rotation=$shape.Rotation;flipH=$shape.HorizontalFlip;flipV=$shape.VerticalFlip;preset=$shape.AutoShapeType;crop=@{left=$shape.PictureFormat.CropLeft;top=$shape.PictureFormat.CropTop;right=$shape.PictureFormat.CropRight;bottom=$shape.PictureFormat.CropBottom};picture=@{width=$crop.PictureWidth;height=$crop.PictureHeight;offsetX=$crop.PictureOffsetX;offsetY=$crop.PictureOffsetY;shapeLeft=$crop.ShapeLeft;shapeTop=$crop.ShapeTop;shapeWidth=$crop.ShapeWidth;shapeHeight=$crop.ShapeHeight}}
}
try{
 $application=New-Object -ComObject PowerPoint.Application;$presentation=$application.Presentations.Add(0);$presentation.PageSetup.SlideWidth=960;$presentation.PageSetup.SlideHeight=540
 $slide=Add-Slide 'Original raster: aspect ratio and deliberate stretch' 'Original 800x400 coordinate-encoded raster created by project code. Full, square and wide copies isolate stretch from cropping. Marker rectangles show the local image frames.'
 $null=Add-Picture $slide 'Full source 2to1' 40 100 480 240
 $null=Add-Picture $slide 'Square stretch' 600 100 240 240
 $null=Add-Picture $slide 'Wide stretch' 40 400 800 90
 $slide=Add-Slide 'Positive crops and signed source outsets' 'Six native Crop object cases. Source ratios were authored through picture dimensions and centered offsets, without XML edits. Negative ratios include transparent source outsets.'
 $plans=@(@{name='Asymmetric crop';rect=@(.2,.1,.05,.25)},@{name='Centered cover';rect=@(.25,0,.25,0)},@{name='Negative all edges';rect=@(-.25,-.25,-.25,-.25)},@{name='Left crop35';rect=@(.35,0,0,0)},@{name='Top crop40';rect=@(0,.4,0,0)},@{name='Right bottom crop';rect=@(0,0,.25,.2)})
 for($i=0;$i -lt $plans.Count;$i++){$x=40+($i%3)*305;$y=115+[math]::Floor($i/3)*210;$null=Label $slide ('Label '+$plans[$i].name) $plans[$i].name $x ($y-30) 280 16;$null=Add-Picture $slide $plans[$i].name $x $y 270 165 $plans[$i].rect}
 $slide=Add-Slide 'Asymmetric crop followed by local flips' 'Same asymmetric crop on four images. No-flip, horizontal, vertical and both local flip states distinguish source crop coordinates from displayed orientation.'
 $names=@('No flip','Horizontal flip','Vertical flip','Both flips')
 for($i=0;$i -lt 4;$i++){$x=55+($i%2)*465;$y=115+[math]::Floor($i/2)*210;$null=Label $slide ('Label '+$names[$i]) $names[$i] $x ($y-30) 400 16;$null=Add-Picture $slide $names[$i] $x $y 380 165 @(.2,.1,.05,.25) ($i -eq 1 -or $i -eq 3) ($i -eq 2 -or $i -eq 3)}
 $slide=Add-Slide 'Crop, flip and rotation order' 'Native rotation controls use asymmetric crops and local flips. A geometric image mapping can predict pixel locations independently from import and export.'
 $plans=@(@{name='Rotate30 no flip';rot=30;h=$false;v=$false},@{name='Rotate30 horizontal';rot=30;h=$true;v=$false},@{name='Rotate90 vertical';rot=90;h=$false;v=$true},@{name='Rotate270 both';rot=270;h=$true;v=$true})
 for($i=0;$i -lt 4;$i++){$x=85+($i%2)*460;$y=150+[math]::Floor($i/2)*230;$null=Label $slide ('Label '+$plans[$i].name) $plans[$i].name ($x-35) ($y-70) 400 16;$null=Add-Picture $slide $plans[$i].name $x $y 280 110 @(.2,.1,.05,.25) $plans[$i].h $plans[$i].v $plans[$i].rot}
 $slide=Add-Slide 'Contain and offset source windows' 'Signed crop controls retain image-frame bounds, with negative source offsets representing empty space rather than discarded pixels. Contain uses a wider source window vertically.'
 $plans=@(@{name='Contain in square';rect=@(0,-.5,0,-.5);width=170},@{name='Negative left top';rect=@(-.2,-.1,0,0);width=350},@{name='Mixed signed crop';rect=@(.3,-.2,-.1,.15);width=350},@{name='Offset source window';rect=@(-.25,-.5,.25,-.5);width=350})
 for($i=0;$i -lt 4;$i++){$x=65+($i%2)*460;$y=110+[math]::Floor($i/2)*215;$null=Label $slide ('Label '+$plans[$i].name) $plans[$i].name $x ($y-30) 400 16;$null=Add-Picture $slide $plans[$i].name $x $y $plans[$i].width 170 $plans[$i].rect}
 $slide=Add-Slide 'Picture clipping to native preset geometry' 'Native picture AutoShapeType controls attempt ellipse, rounded rectangle and triangle geometry. Unsupported authoring requests are recorded separately. No source bitmap is modified.'
 $presets=@(@{name='Picture rectangle';preset=1},@{name='Picture ellipse';preset=9},@{name='Picture roundRect';preset=5},@{name='Picture triangle';preset=7})
 for($i=0;$i -lt 4;$i++){$x=40+$i*230;$null=Label $slide ('Label '+$presets[$i].name) $presets[$i].name $x 95 220 16;$picture=Add-Picture $slide $presets[$i].name $x 140 190 300 @(.15,0,.1,0);try{$picture.AutoShapeType=$presets[$i].preset}catch{$authoringNotes+='Native AutoShapeType rejected '+$presets[$i].name+': '+$_.Exception.Message}}
 $slide=Add-Slide 'Alpha pixels, source outsets and flipped transparency' 'Second original PNG contains a fully transparent corner region and a half-alpha right strip. Marker backgrounds distinguish source transparency from cropped space; local flips move both color and alpha.'
 $null=Add-Picture $slide 'Alpha original' 40 120 390 195 @(0,0,0,0) $false $false 0 $alphaPath
 $null=Add-Picture $slide 'Alpha horizontal' 525 120 390 195 @(0,0,0,0) $true $false 0 $alphaPath
 $null=Add-Picture $slide 'Alpha signed crop' 180 365 600 130 @(-.2,-.2,-.1,0) $false $false 0 $alphaPath
 for($group=0;$group -lt 2;$group++){
  $slide=Add-Slide ('JPEG orientation metadata '+(1+$group*4)+' to '+(4+$group*4)) 'Original project JPEG pixel payload is identical across files; EXIF orientation is the sole changed tag. Native AddPicture uses natural dimensions before resizing to the control cell. Insertion properties are recorded independently.'
  for($i=0;$i -lt 4;$i++){
   $orientation=1+$group*4+$i;$x=60+($i%2)*460;$y=115+[math]::Floor($i/2)*210
   $null=Label $slide ('Label EXIF '+$orientation) ('EXIF orientation '+$orientation) $x ($y-30) 400 16
   $path=Join-Path $projectRoot ('tests/fixtures/picture-geometry-exif-'+$orientation+'.jpg')
   $picture=$slide.Shapes.AddPicture($path,0,-1,$x,$y,-1,-1);$picture.Name='EXIF orientation '+$orientation;$picture.AlternativeText='Original calibration JPEG with only EXIF orientation metadata '+$orientation
   $exifInsertion+=@{orientation=$orientation;width=$picture.Width;height=$picture.Height;rotation=$picture.Rotation;flipH=$picture.HorizontalFlip;flipV=$picture.VerticalFlip}
   $picture.LockAspectRatio=-1
   $angle=$picture.Rotation*[math]::PI/180
   if([math]::Abs([math]::Sin($angle)) -gt .5){$picture.Width=[single]170}else{$picture.Width=[single]340}
   $worldWidth=[math]::Abs($picture.Width*[math]::Cos($angle))+[math]::Abs($picture.Height*[math]::Sin($angle))
   $worldHeight=[math]::Abs($picture.Height*[math]::Cos($angle))+[math]::Abs($picture.Width*[math]::Sin($angle))
   $picture.Left=[single]($x+($worldWidth-$picture.Width)/2);$picture.Top=[single]($y+($worldHeight-$picture.Height)/2);$picture.Line.Visible=0;$picture.Shadow.Visible=0
  }
 }
 $presentation.SaveAs($fixturePath,24)
 $slides=@();foreach($slide in $presentation.Slides){$pictures=@();foreach($shape in $slide.Shapes){if($shape.Type -eq 13){$pictures+=Read-Picture $shape}};$slides+=@{slide=$slide.SlideIndex;pictures=$pictures};$slide.Export((Join-Path $evidenceDirectory ('original-slide-'+$slide.SlideIndex+'.png')),'PNG',1280,720)}
 $powerPointExe=Join-Path $application.Path 'POWERPNT.EXE'
 @{createdUtc=[DateTime]::UtcNow.ToString('o');version=$application.Version;productVersion=(Get-Item -LiteralPath $powerPointExe).VersionInfo.ProductVersion;slides=$slides;authoringNotes=$authoringNotes;exifInsertion=$exifInsertion}|ConvertTo-Json -Depth 20|Set-Content -LiteralPath (Join-Path $evidenceDirectory 'original-native-properties.json') -Encoding UTF8
 $presentation.Close();$presentation=$null
}finally{
 if($null -ne $presentation){$presentation.Close()}
 if($null -ne $application){if($previousProcessIds.Count -eq 0 -and $application.Presentations.Count -eq 0){$application.Quit()};[void][System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($application)}
}
node (Join-Path $projectRoot 'scripts/sanitize-pptx-fixture.mjs') $fixturePath
if($LASTEXITCODE -ne 0){throw 'Fixture sanitation failed.'}
Get-FileHash -LiteralPath $fixturePath -Algorithm SHA256
