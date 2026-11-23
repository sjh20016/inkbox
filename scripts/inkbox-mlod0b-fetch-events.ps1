param([long]$RunId = 45157310969)
$ErrorActionPreference = 'Stop'
$prefix = 'https://api.github.com/repos/sjh20016/inkbox/actions'
$run = Invoke-RestMethod "$prefix/runs/$RunId"
if ($run.head_sha -ne '6594ecaed27c82f5335015c623b2d6a2a0b4ac07' -or
    $run.path -ne '.github/workflows/mlod0b-events.yml') {
    throw 'Run does not match the frozen transient event matrix source.'
}
$manifest = Invoke-RestMethod "$prefix/runs/$RunId/artifacts"
$dest = Join-Path $PSScriptRoot '../reports/mlod0b/event-matrix'
[void](New-Item -ItemType Directory -Force -Path $dest)
$headers = @{ Accept = 'application/vnd.github+json' }
if ($env:GH_TOKEN) {
    $headers.Authorization = "Bearer $env:GH_TOKEN"
} else {
    $credential = "protocol=https`nhost=github.com`npath=sjh20016/inkbox.git`n`n" | git credential fill
    if ($LASTEXITCODE -ne 0) { throw 'GitHub credential or GH_TOKEN with Actions read access is required.' }
    $password = ($credential | Where-Object { $_.StartsWith('password=') }).Substring(9)
    $headers.Authorization = "Bearer $password"
}
Add-Type -AssemblyName System.IO.Compression.FileSystem
foreach ($artifact in $manifest.artifacts) {
    if ($artifact.name -notmatch '^mlod0b-events-(seed-(20260914|73101|61003)|age-(100|400)-dt(01|1|3))$') { continue }
    $id = $Matches[1]
    $zipPath = Join-Path $dest "$id.zip"
    $output = Join-Path $dest "$id.json"
    if (!(Test-Path $zipPath) -or ('sha256:' + (Get-FileHash $zipPath).Hash.ToLower()) -ne $artifact.digest) {
        Invoke-WebRequest "$prefix/artifacts/$($artifact.id)/zip" -Headers $headers -OutFile $zipPath
    }
    if (('sha256:' + (Get-FileHash $zipPath).Hash.ToLower()) -ne $artifact.digest) { throw "Archive digest mismatch: $id" }
    $archive = [IO.Compression.ZipFile]::OpenRead($zipPath)
    try {
        $entry = $archive.GetEntry("$id.json")
        if (!$entry -or $archive.Entries.Count -ne 1) { throw "Unexpected archive entries: $id" }
        [IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $output, $true)
    } finally { $archive.Dispose() }
    Write-Output "$id $($artifact.digest)"
}
