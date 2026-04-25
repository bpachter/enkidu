@echo off
REM ============================================================
REM train_elevenlabs.bat — Fine-tune StyleTTS2 on ElevenLabs
REM                        Mithrandir voice dataset
REM
REM Prerequisites:
REM   1. Run generate_elevenlabs_dataset.py first
REM   2. elevenlabs_data/train_list.txt must exist
REM ============================================================

set PYTHON=C:\Python312\python.exe
set HERE=%~dp0
set REPO=%HERE%styletts2_repo

if not exist "%HERE%elevenlabs_data\train_list.txt" (
    echo ERROR: elevenlabs_data\train_list.txt not found.
    echo Run generate_elevenlabs_dataset.py first.
    pause
    exit /b 1
)

echo.
echo === Mithrandir ElevenLabs Voice Training ===
echo Dataset:     %HERE%elevenlabs_data\
echo Config:      %HERE%finetune_elevenlabs.yml
echo Checkpoints: %HERE%logs\mithrandir_elevenlabs\
echo.
echo Training for 50 epochs (~3-5 hours on RTX 4090).
echo.

cd /d "%REPO%"
%PYTHON% train_finetune_accelerate.py --config "%HERE%finetune_elevenlabs.yml"

echo.
echo Training complete. Checkpoint in %HERE%logs\mithrandir_elevenlabs\
pause
