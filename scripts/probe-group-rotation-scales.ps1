# Original native diagnostic: child rotations under unequal group scales.
$ErrorActionPreference='Stop'
$projectRoot=Split-Path -Parent $PSScriptRoot
$evidenceDirectory=Join-Path $projectRoot 'test-results/group-powerpoint'
New-Item -ItemType Directory -Force -Path $evidenceDirectory | Out-Null
$previousProcessIds=@(Get-Process POWERPNT -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id)
$application=$null;$presentation=$null
try{
 $application=New-Object -ComObject PowerPoint.Application;$presentation=$application.Presentations.Add(0)
 $presentation.PageSetup.SlideWidth=960;$presentation.PageSetup.SlideHeight=540
 $slide=$presentation.Slides.Add(1,12);$angles=@(0,30,44,44.999,45,45.001,46,70,89,90,110,134.999,135,135.001,136,180,224.999,225,225.001,270,314.999,315,315.001,330,359)
 $marker=$slide.Shapes.AddShape(1,0,0,500,400);$marker.Name='Diagnostic bounds';$marker.Fill.Visible=0;$marker.Line.Visible=0
 $names=@($marker.Name)
 for($i=0;$i -lt $angles.Count;$i++){$shape=$slide.Shapes.AddShape(1,(20+($i%5)*95),(20+[math]::Floor($i/5)*75),60,20);$shape.Name='Angle '+$angles[$i];$shape.Rotation=[single]$angles[$i];$shape.Line.Visible=0;$shape.Fill.Solid();$shape.Fill.ForeColor.RGB=4476121;$names+=$shape.Name}
 $g=$slide.Shapes.Range([object[]]$names).Group();$g.Name='Native nonuniform rotation diagnostic';$g.LockAspectRatio=0;$g.Width=750;$g.Height=250;$g.Left=50;$g.Top=100
 $items=@();foreach($shape in $g.GroupItems){$items+=@{name=$shape.Name;rotation=$shape.Rotation;left=$shape.Left;top=$shape.Top;width=$shape.Width;height=$shape.Height}}
 $slide.Export((Join-Path $evidenceDirectory 'rotation-scale-original.png'),'PNG',1280,720)
 $nested=@()
 foreach($outerAngle in @(0,100)){
  $slide=$presentation.Slides.Add($presentation.Slides.Count+1,12)
  $marker=$slide.Shapes.AddShape(1,0,0,500,400);$marker.Name='Outer bounds';$marker.Fill.Visible=0;$marker.Line.Visible=0
  $innerMarker=$slide.Shapes.AddShape(1,80,80,180,160);$innerMarker.Name='Inner bounds';$innerMarker.Fill.Visible=0;$innerMarker.Line.Visible=0;$names=@($innerMarker.Name)
  for($i=0;$i -lt 3;$i++){$shape=$slide.Shapes.AddShape(1,100,(100+$i*45),60,20);$shape.Name='Nested local '+($i*30);$shape.Rotation=[single]($i*30);$shape.Line.Visible=0;$names+=$shape.Name}
  $inner=$slide.Shapes.Range([object[]]$names).Group();$inner.Name='Inner rotation60';$inner.Rotation=60
  $outer=$slide.Shapes.Range([object[]]@($marker.Name,$inner.Name)).Group();$outer.Name='Outer rotation'+$outerAngle;$outer.LockAspectRatio=0;$outer.Width=750;$outer.Height=250;$outer.Rotation=[single]$outerAngle;$outer.Left=50;$outer.Top=100
  $leaves=@();foreach($shape in $outer.GroupItems){$leaves+=@{name=$shape.Name;rotation=$shape.Rotation;left=$shape.Left;top=$shape.Top;width=$shape.Width;height=$shape.Height}}
  $nested+=@{outerRotation=$outerAngle;items=$leaves};$slide.Export((Join-Path $evidenceDirectory ('rotation-scale-nested-'+$outerAngle+'.png')),'PNG',1280,720)
 }
 $presentation.SaveAs((Join-Path $projectRoot 'tests/fixtures/powerpoint-groups-rotation.pptx'),24)
 $powerPointExe=Join-Path $application.Path 'POWERPNT.EXE'
 @{createdUtc=[DateTime]::UtcNow.ToString('o');version=$application.Version;productVersion=(Get-Item -LiteralPath $powerPointExe).VersionInfo.ProductVersion;scaleX=1.5;scaleY=.625;originalWidth=60;originalHeight=20;items=$items;nested=$nested}|ConvertTo-Json -Depth 20|Set-Content -LiteralPath (Join-Path $evidenceDirectory 'rotation-scale-native.json') -Encoding UTF8
}finally{if($null -ne $presentation){$presentation.Close()};if($null -ne $application){if($previousProcessIds.Count -eq 0 -and $application.Presentations.Count -eq 0){$application.Quit()};[void][System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($application)}}
node (Join-Path $projectRoot 'scripts/sanitize-pptx-fixture.mjs') (Join-Path $projectRoot 'tests/fixtures/powerpoint-groups-rotation.pptx')
if($LASTEXITCODE -ne 0){throw 'Rotation fixture sanitation failed.'}
