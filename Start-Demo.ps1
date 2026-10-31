$ErrorActionPreference = 'Stop'
$projectDirectory = $PSScriptRoot
$demoUrl = 'http://127.0.0.1:4173'

function Test-FireSite {
    try {
        $status = Invoke-RestMethod -Uri "$demoUrl/api/status" -TimeoutSec 2
        return ($null -ne $status.providers -and $null -ne $status.scope)
    } catch { return $false }
}

try {
    if (-not (Test-FireSite)) {
        $nodeCommand = Get-Command node -ErrorAction SilentlyContinue
        $nodeExecutable = if ($nodeCommand) { $nodeCommand.Source } else { $null }
        if (-not $nodeExecutable) {
            $bundledNode = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
            if (Test-Path -LiteralPath $bundledNode) { $nodeExecutable = $bundledNode }
        }
        if (-not $nodeExecutable) {
            throw 'Node.js 20 or later is required. Install Node.js, then run this launcher again.'
        }
        $version = & $nodeExecutable --version
        if ([int]($version.TrimStart('v').Split('.')[0]) -lt 20) { throw 'Please update Node.js to version 20 or later.' }
        $logDirectory = Join-Path $projectDirectory '.local'
        New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
        $serverScript = Join-Path $projectDirectory 'server\local.mjs'
        $serverProcess = Start-Process -FilePath $nodeExecutable -ArgumentList ('"{0}"' -f $serverScript) -WorkingDirectory $projectDirectory -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logDirectory 'server.log') -RedirectStandardError (Join-Path $logDirectory 'server-error.log') -PassThru
        for ($attempt = 0; $attempt -lt 20; $attempt++) {
            if (Test-FireSite) { break }
            if ($serverProcess.HasExited) { throw 'The server could not start. Port 4173 may be in use; see .local\server-error.log.' }
            Start-Sleep -Milliseconds 250
        }
        if (-not (Test-FireSite)) { throw 'The server did not become ready. See .local\server-error.log.' }
        Set-Content -LiteralPath (Join-Path $logDirectory 'server.pid') -Value $serverProcess.Id
    }
    Start-Process $demoUrl
    Write-Host "SiteCode AI is ready: $demoUrl" -ForegroundColor Green
    Write-Host 'The local server runs in the background. Close the browser when your demo is finished.'
} catch {
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host 'You can also open a terminal here and run: node server/local.mjs'
    Read-Host 'Press Enter to close'
    exit 1
}
