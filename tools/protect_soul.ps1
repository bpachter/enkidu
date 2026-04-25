# protect_soul.ps1 — Set OS-level read-only protection on SOUL.md
#
# Run once after any deliberate SOUL.md edit to re-lock it.
# To edit SOUL.md: right-click → Properties → uncheck Read-only,
# edit, run update_soul_integrity.py, then re-run this script.
#
# Usage:
#   .\tools\protect_soul.ps1          # lock
#   .\tools\protect_soul.ps1 -Unlock  # temporarily unlock for editing

param([switch]$Unlock)

$soul = Join-Path $PSScriptRoot "..\SOUL.md" | Resolve-Path

if ($Unlock) {
    Set-ItemProperty -Path $soul -Name IsReadOnly -Value $false
    Write-Host "SOUL.md unlocked for editing."
    Write-Host "When done: run update_soul_integrity.py, then re-run protect_soul.ps1"
} else {
    Set-ItemProperty -Path $soul -Name IsReadOnly -Value $true
    Write-Host "SOUL.md locked read-only at OS level."
    Write-Host "To edit: .\tools\protect_soul.ps1 -Unlock"
}
