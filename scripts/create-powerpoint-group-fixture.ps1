# Original project native groups. New dedicated presentation only; no user file.
$ErrorActionPreference='Stop'
$projectRoot=Split-Path -Parent $PSScriptRoot
$evidenceDirectory=Join-Path $projectRoot 'test-results/group-powerpoint'
New-Item -ItemType Directory -Force -Path $evidenceDirectory | Out-Null
$fixturePath=Join-Path $projectRoot 'tests/fixtures/powerpoint-groups.pptx'
$imagePath=Join-Path $projectRoot 'tests/fixtures/picture-geometry-calibration.png'
$previousProcessIds=@(Get-Process POWERPNT -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id)
$application=$null;$presentation=$null;$authoringNotes=@()
function Color-Value([string]$hex){return [Convert]::ToInt32($hex.Substring(0,2),16)+256*[Convert]::ToInt32($hex.Substring(2,2),16)+65536*[Convert]::ToInt32($hex.Substring(4,2),16)}
function Text($slide,[string]$name,[string]$value,[double]$x,[double]$y,[double]$width=880,[double]$height=35,[double]$size=18){
 $shape=$slide.Shapes.AddTextbox(1,$x,$y,$width,$height);$shape.Name=$name;$shape.Fill.Visible=0;$shape.Line.Visible=0;$shape.Shadow.Visible=0
 $shape.TextFrame2.AutoSize=0;$shape.TextFrame2.WordWrap=0
 $shape.TextFrame2.MarginLeft=0;$shape.TextFrame2.MarginTop=0;$shape.TextFrame2.MarginRight=0;$shape.TextFrame2.MarginBottom=0
 $shape.TextFrame2.TextRange.Text=$value;$shape.TextFrame2.TextRange.Font.Name='Arial';$shape.TextFrame2.TextRange.Font.Size=$size;$shape.TextFrame2.TextRange.Font.Fill.ForeColor.RGB=(Color-Value '172E29')
 return $shape
}
function Shape($slide,[string]$name,[int]$preset,[double]$x,[double]$y,[double]$w,[double]$h,[string]$fill,[double]$line=0){
 $shape=$slide.Shapes.AddShape($preset,$x,$y,$w,$h);$shape.Name=$name;$shape.Shadow.Visible=0;$shape.Fill.Solid();$shape.Fill.ForeColor.RGB=(Color-Value $fill)
 if($line -gt 0){$shape.Line.Visible=-1;$shape.Line.ForeColor.RGB=(Color-Value '363D45');$shape.Line.Weight=$line}else{$shape.Line.Visible=0}
 return $shape
}
function Slide([string]$title,[string]$notes){
 $slide=$presentation.Slides.Add($presentation.Slides.Count+1,12);$slide.FollowMasterBackground=0;$slide.Background.Fill.Solid();$slide.Background.Fill.ForeColor.RGB=(Color-Value 'F1F3F5')
 $heading=Text $slide ('Heading '+$slide.SlideIndex) $title 35 20 900 40 25;$heading.TextFrame2.TextRange.Font.Bold=-1
 $slide.NotesPage.Shapes.Placeholders.Item(2).TextFrame.TextRange.Text=$notes
 return $slide
}
function Unit($slide,[string]$prefix,[double]$x,[double]$y){
 $names=@()
 $back=Shape $slide ($prefix+' background') 1 $x $y 240 160 'D9ECDD' 4;$names+=$back.Name
 $rect=Shape $slide ($prefix+' rotated rectangle') 1 ($x+15) ($y+20) 65 35 'D94C44';$rect.Rotation=30;$names+=$rect.Name
 $ellipse=Shape $slide ($prefix+' ellipse') 9 ($x+100) ($y+20) 50 35 '3567B2';$names+=$ellipse.Name
 $picture=$slide.Shapes.AddPicture($imagePath,0,-1,($x+135),($y+65),90,45);$picture.Name=$prefix+' image';$picture.AlternativeText='Original project coordinate graphic inside '+$prefix;$names+=$picture.Name
 $text=Text $slide ($prefix+' text') 'Native ABC' ($x+12) ($y+105) 210 40 20;$names+=$text.Name
 $line=$slide.Shapes.AddLine(($x+10),($y+150),($x+230),($y+150));$line.Name=$prefix+' line';$line.Line.ForeColor.RGB=(Color-Value '172E29');$line.Line.Weight=4;$names+=$line.Name
 $group=$slide.Shapes.Range([object[]]$names).Group();$group.Name=$prefix;$group.LockAspectRatio=0
 return $group
}
function Place($group,[double]$x,[double]$y,[double]$w,[double]$h,[double]$rotation=0,[bool]$flipH=$false,[bool]$flipV=$false){
 $group.LockAspectRatio=0;$group.Width=[single]$w;$group.Height=[single]$h
 if($flipH){$group.Flip(0)};if($flipV){$group.Flip(1)};$group.Rotation=[single]$rotation;$group.Left=[single]$x;$group.Top=[single]$y
}
function Nested($slide,[string]$name,[double]$x,[double]$y){
 $boundary=Shape $slide ($name+' outer boundary') 1 $x $y 400 300 'E7EAF0' 1
 $inner=Unit $slide ($name+' inner') ($x+25) ($y+45);$inner.Rotation=20
 $text=Text $slide ($name+' outer text') 'Outer text' ($x+35) ($y+240) 320 35 20
 $triangle=Shape $slide ($name+' triangle') 7 ($x+305) ($y+40) 60 100 'DBA22C';$triangle.Rotation=15
 $group=$slide.Shapes.Range([object[]]@($boundary.Name,$inner.Name,$text.Name,$triangle.Name)).Group();$group.Name=$name;$group.LockAspectRatio=0
 return $group
}
function Read-Tree($shape){
 $entry=@{name=$shape.Name;type=$shape.Type;left=$shape.Left;top=$shape.Top;width=$shape.Width;height=$shape.Height;rotation=$shape.Rotation;flipH=$shape.HorizontalFlip;flipV=$shape.VerticalFlip}
 if($shape.Type -eq 6){$items=@();foreach($item in $shape.GroupItems){$items+=Read-Tree $item};$entry.children=$items}
 elseif($shape.HasTextFrame -eq -1 -and $shape.TextFrame2.HasText -eq -1){$range=$shape.TextFrame2.TextRange;$entry.text=$range.Text;$entry.fontSize=$range.Font.Size;$entry.textBounds=@{left=$range.BoundLeft;top=$range.BoundTop;width=$range.BoundWidth;height=$range.BoundHeight}}
 try{$entry.lineWidth=$shape.Line.Weight}catch{}
 return $entry
}
try{
 $application=New-Object -ComObject PowerPoint.Application;$presentation=$application.Presentations.Add(0);$presentation.PageSetup.SlideWidth=960;$presentation.PageSetup.SlideHeight=540
 $slide=Slide 'Group scaling: geometry, fonts and strokes' 'Three original groups have identical local content before native resizing. Font and stroke dimensions are recorded separately from group extents.'
 $g=Unit $slide 'Baseline group' 40 170;$null=Text $slide 'Label baseline' '100 percent' 40 115 280 35 18
 $g=Unit $slide 'Half group' 380 170;Place $g 380 170 120 80;$null=Text $slide 'Label half' '50 percent' 380 115 220 35 18
 $g=Unit $slide 'Larger group' 620 170;Place $g 620 170 288 192;$null=Text $slide 'Label larger' '120 percent' 620 115 280 35 18
 $slide=Slide 'Nonuniform groups and a rotated child' 'The red child rectangle is rotated30 degrees before grouping. Wide and tall group scales distinguish an affine shear from native shape re-layout.'
 $g=Unit $slide 'Aspect baseline' 40 170
 $g=Unit $slide 'Wide group' 340 170;Place $g 340 170 360 100
 $g=Unit $slide 'Tall group' 760 130;Place $g 760 130 160 280
 $slide=Slide 'Group rotation with and without reflection' 'Two native groups rotate30 degrees. The second has a local horizontal flip; child text readability and image orientation are observed independently.'
 $g=Unit $slide 'Rotate30 group' 100 170;Place $g 100 170 240 160 30
 $g=Unit $slide 'Reflect rotate30 group' 550 170;Place $g 550 170 240 160 30 $true $false
 $slide=Slide 'Four group flip combinations' 'Group flips apply to the native member hierarchy. Child glyph orientation, pictures and shape positions are separate evidence.'
 for($i=0;$i -lt 4;$i++){$x=80+($i%2)*470;$y=130+[math]::Floor($i/2)*210;$g=Unit $slide ('Flip group '+$i) $x $y;Place $g $x $y 240 160 0 ($i -eq 1 -or $i -eq 3) ($i -eq 2 -or $i -eq 3);$null=Text $slide ('Label flip '+$i) ('H='+($i -eq 1 -or $i -eq 3)+' V='+($i -eq 2 -or $i -eq 3)) $x ($y-35) 300 30 16}
 $slide=Slide 'Nested groups in their original child coordinates' 'An inner group rotates20 degrees inside an outer group. Unchanged nonzero child origins and extents remain native package data.'
 $g=Nested $slide 'Nested baseline' 100 140
 $slide=Slide 'Nested nonuniform reflected rotation' 'The same nested group structure is resized500x250, rotated-15 degrees, and flipped horizontally. Native pixels discriminate competing transform orders.'
 $g=Nested $slide 'Nested transformed' 100 140;Place $g 220 170 500 250 -15 $true $false
 $slide=Slide 'Three native grouping levels' 'A third wrapper contains the rotated/scaled nested group and an outer marker, with independent vertical reflection and rotation.'
 $inner=Nested $slide 'Level two group' 150 150;Place $inner 150 150 320 240 20 $false $true
 $marker=Shape $slide 'Level three marker' 1 120 100 430 350 'E4E7ED' 1;$marker.ZOrder(1)
 $g=$slide.Shapes.Range([object[]]@($marker.Name,$inner.Name)).Group();$g.Name='Level three group';Place $g 260 130 430 350 -10 $false $true
 $slide=Slide 'Grouping native table controls' 'Attempts to group a native table and a rectangle are recorded. A rejected operation remains ungrouped; no XML-authored hierarchy is mislabeled as native authoring.'
 $table=$slide.Shapes.AddTable(2,2,80,140,350,180);$table.Name='Native table candidate';$table.Table.Cell(1,1).Shape.TextFrame.TextRange.Text='Group';$table.Table.Cell(1,2).Shape.TextFrame.TextRange.Text='Table';$table.Table.Cell(2,1).Shape.TextFrame.TextRange.Text='Original';$table.Table.Cell(2,2).Shape.TextFrame.TextRange.Text='Control'
 $box=Shape $slide 'Native table companion' 1 500 160 200 100 'DBA22C'
 try{$g=$slide.Shapes.Range([object[]]@($table.Name,$box.Name)).Group();$g.Name='Native grouped table'}catch{$authoringNotes+='Native table grouping rejected: '+$_.Exception.Message}
 $presentation.SaveAs($fixturePath,24)
 $slides=@();foreach($slide in $presentation.Slides){$tree=@();foreach($shape in $slide.Shapes){$tree+=Read-Tree $shape};$slides+=@{slide=$slide.SlideIndex;tree=$tree};$slide.Export((Join-Path $evidenceDirectory ('original-slide-'+$slide.SlideIndex+'.png')),'PNG',1280,720)}
 $powerPointExe=Join-Path $application.Path 'POWERPNT.EXE'
 @{createdUtc=[DateTime]::UtcNow.ToString('o');version=$application.Version;productVersion=(Get-Item -LiteralPath $powerPointExe).VersionInfo.ProductVersion;slides=$slides;authoringNotes=$authoringNotes}|ConvertTo-Json -Depth 40|Set-Content -LiteralPath (Join-Path $evidenceDirectory 'original-native-properties.json') -Encoding UTF8
 $presentation.Close();$presentation=$null
}finally{
 if($null -ne $presentation){$presentation.Close()}
 if($null -ne $application){if($previousProcessIds.Count -eq 0 -and $application.Presentations.Count -eq 0){$application.Quit()};[void][System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($application)}
}
node (Join-Path $projectRoot 'scripts/sanitize-pptx-fixture.mjs') $fixturePath
if($LASTEXITCODE -ne 0){throw 'Group fixture sanitation failed.'}
Get-FileHash -LiteralPath $fixturePath -Algorithm SHA256
