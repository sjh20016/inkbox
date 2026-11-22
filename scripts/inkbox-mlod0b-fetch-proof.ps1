param([long]$RunId = 45027304889)
$ErrorActionPreference = 'Stop'
$repository = 'sjh20016/inkbox'
$prefix = "https://api.github.com/repos/$repository/actions"
$manifest = Invoke-RestMethod "$prefix/runs/$RunId/artifacts"
$dest = Join-Path $PSScriptRoot '../reports/mlod0b/proof'
[void](New-Item -ItemType Directory -Force -Path $dest)
$headers = @{ 'Accept'='application/vnd.github+json' }
if ($env:GH_TOKEN) {
    $headers.Authorization = "Bearer $env:GH_TOKEN"
} else {
    # Use the same account as the repository remote. Never persist this value.
    $credential = "protocol=https`nhost=github.com`npath=$repository.git`n`n" | git credential fill
    if ($LASTEXITCODE -ne 0) { throw 'Set GH_TOKEN with Actions read access, or sign in with Git.' }
    $password = ($credential | Where-Object { $_.StartsWith('password=') }).Substring(9)
    $headers.Authorization = "Bearer $password"
}
Add-Type -AssemblyName System.IO.Compression.FileSystem
foreach ($artifact in $manifest.artifacts) {
    if ($artifact.name -notmatch '^mlod0b-(seed-(20260914|73101|61003)|age-(100|400)-dt(01|1|3))$') { continue }
    $id = $Matches[1]
    $output = Join-Path $dest "$id.json"
    $zipPath = Join-Path $dest "$id.zip"
    if (!(Test-Path $zipPath) -or ('sha256:' + (Get-FileHash $zipPath).Hash.ToLower()) -ne $artifact.digest) {
        Invoke-WebRequest "$prefix/artifacts/$($artifact.id)/zip" -Headers $headers -OutFile $zipPath
    }
    if (('sha256:' + (Get-FileHash $zipPath).Hash.ToLower()) -ne $artifact.digest) { throw "Zip hash mismatch: $id" }
    $archive = [IO.Compression.ZipFile]::OpenRead($zipPath)
    try {
        $entry = $archive.GetEntry("$id.json")
        if (!$entry -or $archive.Entries.Count -ne 1) { throw "Unexpected archive contents: $id" }
        [IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $output, $true)
    } finally { $archive.Dispose() }
    Write-Output "$id $($artifact.digest)"
}
