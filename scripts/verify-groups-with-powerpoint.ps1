# Native validation opens only dedicated project fixtures and exports, never user documents.
param([switch]$OnlyNestedZero,[switch]$OnlyEditor)
$ErrorActionPreference='Stop'
$projectRoot=Split-Path -Parent $PSScriptRoot
$evidenceDirectory=Join-Path $projectRoot 'test-results/group-powerpoint'
New-Item -ItemType Directory -Force -Path $evidenceDirectory | Out-Null
$previousProcessIds=@(Get-Process POWERPNT -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id)
$application=$null;$presentation=$null;$results=@()
function Read-Tree($shape){
 $entry=@{name=$shape.Name;type=$shape.Type;left=$shape.Left;top=$shape.Top;width=$shape.Width;height=$shape.Height;rotation=$shape.Rotation;flipH=$shape.HorizontalFlip;flipV=$shape.VerticalFlip}
 if($shape.Type -eq 6){$items=@();foreach($item in $shape.GroupItems){$items+=Read-Tree $item};$entry.children=$items}
 elseif($shape.HasTextFrame -eq -1 -and $shape.TextFrame2.HasText -eq -1){$range=$shape.TextFrame2.TextRange;$entry.text=$range.Text;$entry.fontSize=$range.Font.Size;$entry.textBounds=@{left=$range.BoundLeft;top=$range.BoundTop;width=$range.BoundWidth;height=$range.BoundHeight};$entry.insets=@{left=$shape.TextFrame2.MarginLeft;right=$shape.TextFrame2.MarginRight;top=$shape.TextFrame2.MarginTop;bottom=$shape.TextFrame2.MarginBottom}}
 try{$entry.lineWidth=$shape.Line.Weight}catch{}
 return $entry
}
try{
 $application=New-Object -ComObject PowerPoint.Application
 $inputs=@(@{prefix='original';path='tests/fixtures/powerpoint-groups.pptx'},@{prefix='probe';path='tests/fixtures/powerpoint-groups-probe.pptx'},@{prefix='rotation-original';path='tests/fixtures/powerpoint-groups-rotation.pptx'})
 if($OnlyNestedZero){$inputs=@(@{prefix='nested-zero';path='test-results/group-powerpoint/nested-zero.pptx'})}
 elseif($OnlyEditor){$inputs=@(@{prefix='editor-authored';path='test-results/group-powerpoint/editor-authored.pptx'})}
 else{foreach($candidate in @(@{prefix='exported';path='examples/groups.pptx'},@{prefix='probe-exported';path='test-results/group-powerpoint/probe-exported.pptx'},@{prefix='rotation-exported';path='test-results/group-powerpoint/rotation-exported.pptx'})){if(Test-Path -LiteralPath (Join-Path $projectRoot $candidate.path)){$inputs+=$candidate}}}
 foreach($input in $inputs){
  $path=Join-Path $projectRoot $input.path;$record=@{input=$input.path;sha256=(Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash}
  try{
   $presentation=$application.Presentations.Open($path,-1,0,0);$slides=@()
   foreach($slide in $presentation.Slides){$tree=@();foreach($shape in $slide.Shapes){$tree+=Read-Tree $shape};$slides+=@{slide=$slide.SlideIndex;objectCount=$slide.Shapes.Count;tree=$tree};$slide.Export((Join-Path $evidenceDirectory ($input.prefix+'-slide-'+$slide.SlideIndex+'.png')),'PNG',1280,720)}
   $presentation.SaveCopyAs((Join-Path $evidenceDirectory ($input.prefix+'-resaved.pptx')),24);$record.slides=$slides;$record.opened=$true
  }finally{if($null -ne $presentation){$presentation.Close();$presentation=$null}}
  $results+=$record
 }
 $powerPointExe=Join-Path $application.Path 'POWERPNT.EXE'
 $filename=if($OnlyNestedZero){'nested-zero-verification.json'}elseif($OnlyEditor){'editor-verification.json'}else{'verification.json'}
 @{verifiedUtc=[DateTime]::UtcNow.ToString('o');version=$application.Version;productVersion=(Get-Item -LiteralPath $powerPointExe).VersionInfo.ProductVersion;results=$results}|ConvertTo-Json -Depth 45|Set-Content -LiteralPath (Join-Path $evidenceDirectory $filename) -Encoding UTF8
}finally{
 if($null -ne $presentation){$presentation.Close()}
 if($null -ne $application){if($previousProcessIds.Count -eq 0 -and $application.Presentations.Count -eq 0){$application.Quit()};[void][System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($application)}
}
Write-Output ('Verified '+$results.Count+' dedicated group packages.')
