# Mithrandir startup script — runs tunnel + server in background
# Place a shortcut to this in shell:startup for auto-launch on login

$ErrorActionPreference = 'Stop'

$root = $PSScriptRoot
$tunnelName = if ($env:MITHRANDIR_CLOUDFLARE_TUNNEL) { $env:MITHRANDIR_CLOUDFLARE_TUNNEL } else { 'mithrandir' }

# Ensure the previous tunnel process is not stale before launching.
Get-Process -Name "cloudflared" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Process -WindowStyle Minimized -FilePath "cloudflared" -ArgumentList "tunnel run $tunnelName"

Start-Sleep -Seconds 4

$serverPath = Join-Path $root "phase6-ui\server"
$venvPython = Join-Path $root ".venv\Scripts\python.exe"
$pythonExe = "C:\Python312\python.exe"
if (Test-Path $venvPython) {
	& $venvPython -c "import uvicorn" 2>$null
	if ($LASTEXITCODE -eq 0) {
		$pythonExe = $venvPython
	}
}

# Persist server output so startup issues are visible after login.
$stdoutLog = Join-Path $root "server.log"
$stderrLog = Join-Path $root "server.err.log"
Start-Process -WindowStyle Minimized -FilePath $pythonExe -ArgumentList "-m uvicorn main:app --host 0.0.0.0 --port 8000" -WorkingDirectory $serverPath -RedirectStandardOutput $stdoutLog -RedirectStandardError $stderrLog

Start-Sleep -Seconds 2
$listening = netstat -ano | Select-String ":8000"
if (-not $listening) {
	Write-Host "Warning: backend did not bind to :8000. Check server.err.log for details."
}

Write-Host "Mithrandir started. Tunnel '$tunnelName' + server running in background."
