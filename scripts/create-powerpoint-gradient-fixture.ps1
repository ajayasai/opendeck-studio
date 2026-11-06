# Original project gradient controls authored through PowerPoint COM.
# Only this new presentation is opened; no existing user document is touched.
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$evidenceDirectory = Join-Path $projectRoot 'test-results/gradient-powerpoint'
New-Item -ItemType Directory -Force -Path $evidenceDirectory | Out-Null
$fixturePath = Join-Path $projectRoot 'tests/fixtures/powerpoint-gradients.pptx'
$previousProcessIds = @(Get-Process POWERPNT -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id)
$application = $null; $presentation = $null

function Color-Value([string]$hex) {
  return [Convert]::ToInt32($hex.Substring(0,2),16) + 256*[Convert]::ToInt32($hex.Substring(2,2),16) + 65536*[Convert]::ToInt32($hex.Substring(4,2),16)
}
function Add-Label($slide, [string]$name, [string]$text, [double]$x, [double]$y, [double]$width=880, [double]$size=16) {
  $shape=$slide.Shapes.AddTextbox(1,$x,$y,$width,40)
  $shape.Name=$name; $shape.Fill.Visible=0; $shape.Line.Visible=0
  $shape.TextFrame2.AutoSize=0; $shape.TextFrame2.WordWrap=-1
  $shape.TextFrame2.MarginLeft=0; $shape.TextFrame2.MarginTop=0; $shape.TextFrame2.MarginRight=0; $shape.TextFrame2.MarginBottom=0
  $shape.TextFrame2.TextRange.Text=$text; $shape.TextFrame2.TextRange.Font.Name='Arial'; $shape.TextFrame2.TextRange.Font.Size=$size
  $shape.TextFrame2.TextRange.Font.Fill.ForeColor.RGB=(Color-Value '172E29')
  return $shape
}
function Add-Slide([string]$title,[string]$notes) {
  $slide=$presentation.Slides.Add($presentation.Slides.Count+1,12)
  $slide.FollowMasterBackground=0; $slide.Background.Fill.Solid(); $slide.Background.Fill.ForeColor.RGB=16777215
  $heading=Add-Label $slide ('Heading '+$slide.SlideIndex) $title 40 20 880 26
  $heading.TextFrame2.TextRange.Font.Bold=-1
  $slide.NotesPage.Shapes.Placeholders.Item(2).TextFrame.TextRange.Text=$notes
  return $slide
}
function Set-Stops($fill, [object[]]$stops) {
  while($fill.GradientStops.Count -gt 2){$fill.GradientStops.Delete($fill.GradientStops.Count)}
  for($i=0;$i -lt 2;$i++) {
    $stop=$fill.GradientStops.Item($i+1)
    $stop.Position=[single]$stops[$i].position
    $stop.Color.RGB=(Color-Value $stops[$i].color)
    $stop.Transparency=[single]$stops[$i].transparency
  }
  for($i=2;$i -lt $stops.Count;$i++) {
    $null=$fill.GradientStops.Insert((Color-Value $stops[$i].color),[single]$stops[$i].position,[single]$stops[$i].transparency)
  }
}
function Set-Gradient($fill, [int]$style=1, [int]$variant=1, [object[]]$stops=$null) {
  $fill.Visible=-1; $fill.ForeColor.RGB=0; $fill.BackColor.RGB=16777215
  try{$fill.TwoColorGradient($style,$variant)}catch{throw "Native TwoColorGradient rejected style $style variant $variant : $($_.Exception.Message)"}
  if($null -ne $stops){Set-Stops $fill $stops}
}
function Add-Gradient($slide,[string]$name,[double]$x,[double]$y,[double]$width,[double]$height,[int]$preset=1,[int]$style=1,[int]$variant=1,[object[]]$stops=$null) {
  $shape=$slide.Shapes.AddShape($preset,$x,$y,$width,$height)
  $shape.Name=$name; $shape.Line.Visible=0; $shape.Shadow.Visible=0
  $shape.TextFrame2.AutoSize=0
  Set-Gradient $shape.Fill $style $variant $stops
  return $shape
}
function Read-Fill($fill) {
  $result=@{type=$fill.Type;visible=$fill.Visible;rotation=$fill.RotateWithObject}
  if($fill.Type -eq 3) {
    $stops=@();for($i=1;$i -le $fill.GradientStops.Count;$i++) {
      $stop=$fill.GradientStops.Item($i)
      $stops+=@{position=$stop.Position;color=$stop.Color.RGB;transparency=$stop.Transparency}
    }
    $result.stops=$stops; $result.style=$fill.GradientStyle; $result.variant=$fill.GradientVariant
    try{$result.angle=$fill.GradientAngle}catch{$result.angle=$null}
  }
  return $result
}

try {
  $application=New-Object -ComObject PowerPoint.Application
  $presentation=$application.Presentations.Add(0)
  $presentation.PageSetup.SlideWidth=960; $presentation.PageSetup.SlideHeight=540
  $bw=@(@{position=0;color='000000';transparency=0},@{position=1;color='FFFFFF';transparency=0})
  $three=@(@{position=0;color='FF0000';transparency=0},@{position=1;color='0000FF';transparency=0},@{position=0.5;color='00FF00';transparency=0})
  $slide=Add-Slide 'Linear angle and aspect-ratio controls' 'Original COM linear gradients at six angles, non-square bounds. Three distinct stops isolate geometry from the special two-color interpolation rule.'
  $angles=@(0,30,45,90,180,270)
  for($i=0;$i -lt $angles.Count;$i++) {
    $x=40+($i%2)*470; $y=105+[math]::Floor($i/2)*140
    $null=Add-Label $slide ('Label angle '+$angles[$i]) ($angles[$i].ToString()+' degrees') $x ($y-28) 420 16
    $shape=Add-Gradient $slide ('Linear '+$angles[$i]) $x $y 410 100 1 1 1 $three
    $shape.Fill.GradientAngle=[single]$angles[$i]
  }

  $slide=Add-Slide 'Stop interpolation and independent transparency' 'Six native controls. Endpoint black-to-white tests the documented gamma rule; a 99-percent endpoint disables it. Symmetric three-stop, four-stop, alpha and red-blue controls permit independent pixel checks.'
  $plans=@(
    @{name='Two endpoint black white';stops=$bw},
    @{name='Two endpoint red blue';stops=@(@{position=0;color='FF0000';transparency=0},@{position=1;color='0000FF';transparency=0})},
    @{name='Two stops last99percent';stops=@(@{position=0;color='000000';transparency=0},@{position=0.99;color='FFFFFF';transparency=0})},
    @{name='Three symmetric stops';stops=@(@{position=0;color='000000';transparency=0},@{position=1;color='000000';transparency=0},@{position=0.5;color='FFFFFF';transparency=0})},
    @{name='Four linear stops';stops=@(@{position=0;color='000000';transparency=0},@{position=1;color='FFFFFF';transparency=0},@{position=0.25;color='FF0000';transparency=0},@{position=0.75;color='0000FF';transparency=0})},
    @{name='Two stops alpha';stops=@(@{position=0;color='FF0000';transparency=1},@{position=1;color='0000FF';transparency=0})}
  )
  for($i=0;$i -lt $plans.Count;$i++) {
    $y=100+$i*72
    $null=Add-Label $slide ('Label '+$plans[$i].name) $plans[$i].name 40 ($y-22) 880 13
    $shape=Add-Gradient $slide $plans[$i].name 40 $y 880 43 1 1 1 $plans[$i].stops
    $shape.Fill.GradientAngle=0
  }

  $slide=Add-Slide 'Native center gradients on four preset shapes' 'COM msoGradientFromCenter variant1 on rectangle, ellipse, triangle and rounded rectangle. Native XML determines the path type and focus rectangle; it is not inferred from the API label.'
  $presets=@(1,9,7,5);$names=@('Rectangle','Ellipse','Triangle','Round rectangle')
  for($i=0;$i -lt 4;$i++) {
    $x=40+$i*230
    $null=Add-Label $slide ('Label center '+$names[$i]) $names[$i] $x 95 210 15
    $null=Add-Gradient $slide ('Center '+$names[$i]) $x 140 190 300 $presets[$i] 7 1 $three
  }

  $slide=Add-Slide 'Native corner focus and wide center gradients' 'COM from-corner variants1 through4 use non-square rectangles. Two wide center variant2 controls use rectangle and ellipse. This installed PowerPoint rejected TwoColorGradient style6 from-title; it is not fabricated in this original fixture.'
  for($i=0;$i -lt 4;$i++) {
    $x=40+($i%2)*470; $y=110+[math]::Floor($i/2)*145
    $null=Add-Label $slide ('Label corner '+($i+1)) ('Corner variant '+($i+1)) $x ($y-25) 420 14
    $null=Add-Gradient $slide ('Corner variant '+($i+1)) $x $y 410 100 1 5 ($i+1) $three
  }
  $null=Add-Gradient $slide 'Wide center rectangle variant2' 40 420 410 80 1 7 2 $three
  $null=Add-Gradient $slide 'Wide center ellipse variant2' 510 420 410 80 9 7 2 $three

  $slide=Add-Slide 'Rotation with and without the object' 'Original COM RotateWithObject true and false at0,30,90degrees. Linear45degrees uses three stops; no shadow, outline or text changes the sampled fill.'
  for($i=0;$i -lt 6;$i++) {
    $column=$i%3; $row=[math]::Floor($i/3); $angle=@(0,30,90)[$column]
    $x=75+$column*305; $y=145+$row*230
    $null=Add-Label $slide ('Label rotation '+$i) ("Rotation $angle / follow "+($row -eq 0)) ($x-30) ($y-60) 270 14
    $shape=Add-Gradient $slide ("Rotated $angle follow "+($row -eq 0)) $x $y 200 105 1 1 1 $three
    $shape.Fill.GradientAngle=45; $shape.Fill.RotateWithObject=$(if($row -eq 0){-1}else{0}); $shape.Rotation=[single]$angle
  }

  $slide=Add-Slide 'Slide background and attached text gradient' 'Original slide background gradient and a filled text box. The slide background has independent gradient stops. Plain shapes remain separate editable objects.'
  $background=@(@{position=0;color='E7F2E6';transparency=0},@{position=1;color='9CB8D8';transparency=0},@{position=0.4;color='FFFFFF';transparency=0})
  Set-Gradient $slide.Background.Fill 1 1 $background; $slide.Background.Fill.GradientAngle=30
  $shape=$slide.Shapes.AddTextbox(1,120,165,720,200); $shape.Name='Attached text gradient'; $shape.Line.Visible=0
  Set-Gradient $shape.Fill 1 1 $three; $shape.Fill.GradientAngle=0
  $shape.TextFrame2.AutoSize=0; $shape.TextFrame2.MarginLeft=24; $shape.TextFrame2.MarginTop=24
  $shape.TextFrame2.TextRange.Text='Editable text over an attached gradient'; $shape.TextFrame2.TextRange.Font.Name='Arial'; $shape.TextFrame2.TextRange.Font.Size=28
  $shape.TextFrame2.TextRange.Font.Fill.ForeColor.RGB=0

  $slide=Add-Slide 'Theme-referenced gradient styles' 'The first four native ShapeStyle presets whose effective fill is a gradient refer to the document theme. Actual fill-reference indexes and theme gradients are verified from XML, not assumed from API style numbers.'
  $styleProbe=$slide.Shapes.AddShape(1,0,0,1,1);$styles=@()
  for($style=1;$style -le 42 -and $styles.Count -lt 4;$style++) {
    $styleProbe.ShapeStyle=$style
    if($styleProbe.Fill.Type -eq 3){$styles+=$style}
  }
  $styleProbe.Delete()
  if($styles.Count -ne 4){throw 'Expected four native gradient ShapeStyle presets.'}
  for($i=0;$i -lt $styles.Count;$i++) {
    $x=45+($i%2)*470;$y=135+[math]::Floor($i/2)*210
    $shape=$slide.Shapes.AddShape(1,$x,$y,400,150);$shape.Name=('Theme gradient style '+$styles[$i]);$shape.ShapeStyle=$styles[$i];$shape.Shadow.Visible=0
    $null=Add-Label $slide ('Label theme '+$styles[$i]) ('ShapeStyle '+$styles[$i]) $x ($y-30) 400 16
  }

  $layout=$presentation.SlideMaster.CustomLayouts.Item(2);$layout.Name='Original gradient layout'
  Set-Gradient $layout.Shapes.Placeholders.Item(1).Fill 1 1 $three
  $layout.Shapes.Placeholders.Item(1).Fill.GradientAngle=30
  Set-Gradient $layout.Shapes.Placeholders.Item(2).Fill 7 1 $three
  $slide=$presentation.Slides.AddSlide(8,$layout)
  $slide.FollowMasterBackground=0;$slide.Background.Fill.Solid();$slide.Background.Fill.ForeColor.RGB=16777215
  $title=$slide.Shapes.Placeholders.Item(1);$title.Name='Layout inherited gradient';$title.TextFrame2.TextRange.Text='Gradient inherited from the layout'
  $body=$slide.Shapes.Placeholders.Item(2);$body.Name='Local override gradient';$body.TextFrame2.TextRange.Text='Local gradient overrides the layout gradient.'
  Set-Gradient $body.Fill 1 1 $background;$body.Fill.GradientAngle=90
  $slide.NotesPage.Shapes.Placeholders.Item(2).TextFrame.TextRange.Text='Layout title keeps genuine inherited gradient; body has a different local gradient override. Inspect direct versus inherited source XML.'

  Set-Gradient $presentation.SlideMaster.Shapes.Placeholders.Item(2).Fill 1 1 $three
  $presentation.SlideMaster.Shapes.Placeholders.Item(2).Fill.GradientAngle=90
  Set-Gradient $presentation.SlideMaster.Background.Fill 1 1 $background
  $presentation.SlideMaster.Background.Fill.GradientAngle=0
  $layout=$presentation.SlideMaster.CustomLayouts.Item(4);$layout.Name='Original master gradient inheritance'
  $slide=$presentation.Slides.AddSlide(9,$layout);$slide.FollowMasterBackground=-1
  for($i=1;$i -le $slide.Shapes.Placeholders.Count;$i++) {
    $shape=$slide.Shapes.Placeholders.Item($i);$shape.Name=('Master gradient placeholder '+$i)
    $shape.TextFrame2.TextRange.Text=$(if($i -eq 1){'Master fill and background inheritance'}else{'Inherited gradient '+$i})
  }
  $slide.NotesPage.Shapes.Placeholders.Item(2).TextFrame.TextRange.Text='Two content placeholders inherit the master body gradient through a built-in layout; the slide inherits the master background gradient. Inheritance is confirmed from omitted local XML.'

  $presentation.SaveAs($fixturePath,24)
  $native=@()
  for($i=1;$i -le $presentation.Slides.Count;$i++) {
    $slide=$presentation.Slides.Item($i)
    $slide.Export((Join-Path $evidenceDirectory "original-slide-$i.png"),'PNG',1280,720)
    $shapes=@()
    foreach($shape in $slide.Shapes) {
      $shapes+=@{name=$shape.Name;type=$shape.Type;preset=$shape.AutoShapeType;left=$shape.Left;top=$shape.Top;width=$shape.Width;height=$shape.Height;rotation=$shape.Rotation;fill=(Read-Fill $shape.Fill);text=$(if($shape.HasTextFrame){$shape.TextFrame2.TextRange.Text}else{''})}
    }
    $native+=@{slide=$i;background=(Read-Fill $slide.Background.Fill);followMasterBackground=$slide.FollowMasterBackground;shapes=$shapes}
  }
  @{application='Microsoft PowerPoint';version=$application.Version;productVersion=(Get-Item -LiteralPath (Join-Path $application.Path 'POWERPNT.EXE')).VersionInfo.ProductVersion;generatedUtc=[DateTime]::UtcNow.ToString('o');slides=$native} | ConvertTo-Json -Depth 14 | Set-Content -LiteralPath (Join-Path $evidenceDirectory 'original-native-properties.json')
} finally {
  if($null -ne $presentation){$presentation.Close();[void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($presentation)}
  if($null -ne $application){
    if($previousProcessIds.Count -eq 0 -and $application.Presentations.Count -eq 0){$application.Quit()}
    [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($application)
  }
  [GC]::Collect();[GC]::WaitForPendingFinalizers()
}
node (Join-Path $PSScriptRoot 'sanitize-pptx-fixture.mjs') $fixturePath
if($LASTEXITCODE -ne 0){throw 'Gradient fixture sanitation failed.'}
Write-Output "Created original gradient fixture: $fixturePath"
