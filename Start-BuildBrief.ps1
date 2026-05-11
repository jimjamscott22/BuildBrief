$ErrorActionPreference = "Stop"

$AppDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$BackendDir = Join-Path $AppDir "backend"
$FrontendDir = Join-Path $AppDir "frontend"
$FrontendUrl = "http://localhost:5173"

$backendProcess = $null
$frontendProcess = $null

function Require-Command {
    param([string]$Name)

    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        Write-Host "Missing required command: $Name"
        Write-Host "Install it, then run this launcher again."
        exit 1
    }
}

function Stop-BuildBrief {
    Write-Host ""
    Write-Host "Stopping BuildBrief..."

    foreach ($process in @($frontendProcess, $backendProcess)) {
        if ($null -ne $process -and -not $process.HasExited) {
            Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
        }
    }
}

try {
    Require-Command "uv"
    Require-Command "npm"

    if (-not (Test-Path (Join-Path $BackendDir ".env"))) {
        Write-Host "Missing backend\.env. Create it from backend\.env.example before starting."
        exit 1
    }

    Write-Host "Preparing backend dependencies..."
    Push-Location $BackendDir
    uv sync
    Pop-Location

    if (-not (Test-Path (Join-Path $FrontendDir "node_modules"))) {
        Write-Host "Installing frontend dependencies..."
        Push-Location $FrontendDir
        npm install
        Pop-Location
    }

    Write-Host "Starting BuildBrief backend on http://localhost:8001..."        
    $backendProcess = Start-Process -FilePath "uv" `
        -ArgumentList @("run", "uvicorn", "app.main:app", "--reload", "--port", "8001") `
        -WorkingDirectory $BackendDir `
        -NoNewWindow `
        -PassThru

    Write-Host "Starting BuildBrief frontend on $FrontendUrl..."
    $frontendProcess = Start-Process -FilePath "npm" `
        -ArgumentList @("run", "dev", "--", "--host", "127.0.0.1") `
        -WorkingDirectory $FrontendDir `
        -NoNewWindow `
        -PassThru

    Start-Sleep -Seconds 3
    Start-Process $FrontendUrl

    Write-Host ""
    Write-Host "BuildBrief is starting at $FrontendUrl"
    Write-Host "Keep this window open. Press Ctrl+C to stop both servers."

    while ($true) {
        Start-Sleep -Seconds 1

        if ($backendProcess.HasExited) {
            Write-Host "Backend process exited."
            break
        }

        if ($frontendProcess.HasExited) {
            Write-Host "Frontend process exited."
            break
        }
    }
}
finally {
    Stop-BuildBrief
}
