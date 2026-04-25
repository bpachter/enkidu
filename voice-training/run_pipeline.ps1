# Mithrandir Voice Training Pipeline
# Runs download (if needed) -> extract -> prepare -> train sequentially.
# Safe to run even if download is already in progress or complete.

$ErrorActionPreference = 'Stop'
$PYTHON  = "C:\Python312\python.exe"
$HERE    = $PSScriptRoot
$LOG     = "$HERE\pipeline.log"

function Log($msg) {
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $line = "[$ts] $msg"
    Write-Host $line
    Add-Content -Path $LOG -Value $line
}

Log "=== Mithrandir Voice Training Pipeline ==="

# ── Step 1: Wait for download to finish ──────────────────────────────────────
# Poll file size; if it stops growing for 2 consecutive checks, assume done.
$zip = "$HERE\vctk_data\VCTK-Corpus-0.92.zip"
Log "Waiting for VCTK download to finish (polling file size)..."
$prevSize = -1
$stableCount = 0
while ($true) {
    $curSize = (Get-Item $zip -ErrorAction SilentlyContinue).Length
    $sizeMB  = [math]::Round($curSize / 1MB)
    if ($curSize -eq $prevSize) {
        $stableCount++
        if ($stableCount -ge 2) { break }   # stable for 2 min = done
    } else {
        $stableCount = 0
    }
    Log "  $sizeMB MB ($([math]::Round($curSize/1GB,2)) GB) — sleeping 60s..."
    $prevSize = $curSize
    Start-Sleep -Seconds 60
}
Log "Download appears complete: $([math]::Round((Get-Item $zip).Length/1GB,2)) GB"

# ── Step 2: Extract VCTK speakers ───────────────────────────────────────────
$wavRaw = "$HERE\vctk_data\wavs_raw"
if (Test-Path $wavRaw) {
    Log "wavs_raw already exists — skipping extraction."
} else {
    Log "Extracting VCTK speakers (19 British RP male speakers)..."
    & $PYTHON "$HERE\download_vctk.py" --out-dir "$HERE\vctk_data" --skip-download
    if ($LASTEXITCODE -ne 0) { Log "ERROR: extraction failed"; exit 1 }
    Log "Extraction complete."
}

# ── Step 3: Prepare training data ───────────────────────────────────────────
$trainList = "$HERE\training_data\train_list.txt"
if (Test-Path $trainList) {
    Log "training_data already prepared — skipping."
} else {
    Log "Resampling audio and building filelists (this takes ~15 min)..."
    & $PYTHON "$HERE\prepare_training_data.py" `
        --vctk-dir "$HERE\vctk_data" `
        --out-dir  "$HERE\training_data"
    if ($LASTEXITCODE -ne 0) { Log "ERROR: data prep failed"; exit 1 }
    Log "Data preparation complete."
}

# ── Step 4: Train ───────────────────────────────────────────────────────────
$logsDir = "$HERE\logs\mithrandir_voice"
New-Item -ItemType Directory -Force -Path $logsDir | Out-Null
Log "Starting StyleTTS2 fine-tuning (~6-10 hours on RTX 4090)..."
Set-Location "$HERE\styletts2_repo"
& $PYTHON train_finetune_accelerate.py --config "$HERE\finetune_config.yml"
if ($LASTEXITCODE -ne 0) { Log "ERROR: training exited with code $LASTEXITCODE"; exit 1 }

Log "=== Training complete. Checkpoint in $logsDir ==="
