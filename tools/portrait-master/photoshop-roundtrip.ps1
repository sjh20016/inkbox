param(
  [Parameter(Mandatory = $true)][string]$Master,
  [Parameter(Mandatory = $true)][string]$Roundtrip,
  [Parameter(Mandatory = $true)][string]$RenderPath
)

$ErrorActionPreference = 'Stop'
$masterPath = [System.IO.Path]::GetFullPath($Master)
$roundtripPath = [System.IO.Path]::GetFullPath($Roundtrip)
$renderPath = [System.IO.Path]::GetFullPath($RenderPath)
if (-not (Test-Path -LiteralPath $masterPath -PathType Leaf)) { throw "PSD not found: $masterPath" }
if ($roundtripPath -eq $masterPath -or $renderPath -eq $masterPath) { throw 'QA outputs must not overwrite the source PSD.' }
New-Item -ItemType Directory -Force -Path ([System.IO.Path]::GetDirectoryName($roundtripPath)) | Out-Null
New-Item -ItemType Directory -Force -Path ([System.IO.Path]::GetDirectoryName($renderPath)) | Out-Null

function To-JsString([string]$value) {
  return '"' + $value.Replace('\', '\\').Replace('"', '\"') + '"'
}

$sourceJs = To-JsString $masterPath
$targetJs = To-JsString $roundtripPath
$renderJs = To-JsString $renderPath
$script = @"
app.displayDialogs = DialogModes.NO;
function countTree(items) {
  var groups = 0, pixels = 0;
  for (var i = 0; i < items.length; i++) {
    if (items[i].typename == "LayerSet") { groups++; var nested = countTree(items[i].layers); groups += nested.groups; pixels += nested.pixels; }
    else { pixels++; }
  }
  return { groups: groups, pixels: pixels };
}
function describe(doc) {
  var counts = countTree(doc.layers);
  return [doc.width.as("px"), doc.height.as("px"), doc.mode, doc.bitsPerChannel, doc.colorProfileName, counts.groups, counts.pixels].join("|");
}
var src = new File($sourceJs);
var out = new File($targetJs);
var original = app.open(src);
var originalInfo = describe(original);
var options = new PhotoshopSaveOptions();
options.layers = true;
options.alphaChannels = true;
options.embedColorProfile = true;
options.maximizeCompatibility = true;
original.saveAs(out, options, true, Extension.LOWERCASE);
original.close(SaveOptions.DONOTSAVECHANGES);
var reopened = app.open(out);
var reopenedInfo = describe(reopened);
var pngOptions = new PNGSaveOptions();
reopened.saveAs(new File($renderJs), pngOptions, true, Extension.LOWERCASE);
reopened.close(SaveOptions.DONOTSAVECHANGES);
originalInfo + "\n" + reopenedInfo;
"@

$app = New-Object -ComObject Photoshop.Application
$app.Visible = $true
$result = [string]$app.DoJavaScript($script)
$rows = @($result -split "`n" | ForEach-Object { $_.Trim() } | Where-Object { $_ })
if ($rows.Count -ne 2) { throw "Photoshop roundtrip returned an unexpected report: $result" }
if ($rows[0] -ne $rows[1]) { throw "Photoshop roundtrip changed document metadata: $($rows[0]) -> $($rows[1])" }
if ($rows[1] -notmatch '^1024\|1024\|DocumentMode\.RGB\|BitsPerChannelType\.EIGHT\|.*sRGB.*\|[1-9][0-9]*\|[1-9][0-9]*$') {
  throw "Photoshop roundtrip did not preserve the expected size, color mode, profile, and layers: $($rows[1])"
}
Write-Output "PASS Photoshop open/save/reopen: $($rows[1])"
Write-Output "Roundtrip copy: $roundtripPath"
if (-not (Test-Path -LiteralPath $renderPath -PathType Leaf)) { throw "Photoshop did not export its reopened composite: $renderPath" }
Write-Output "Photoshop reopened composite: $renderPath"
