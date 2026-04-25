@echo off
REM ============================================================
REM setup_styletts2.bat — One-time setup for StyleTTS2 training
REM Run from the voice-training directory.
REM ============================================================

echo.
echo === StyleTTS2 Setup ===
echo.

set HERE=%~dp0
set VENV_PYTHON=%HERE%..\.venv\Scripts\python.exe

REM 1. Clone StyleTTS2 repo
if exist "%HERE%styletts2_repo" (
    echo StyleTTS2 repo already cloned, skipping.
) else (
    echo Cloning StyleTTS2...
    git clone https://github.com/yl4579/StyleTTS2.git "%HERE%styletts2_repo"
    if errorlevel 1 (
        echo ERROR: git clone failed. Make sure git is on PATH.
        pause
        exit /b 1
    )
)

REM 2. Install dependencies into existing venv
echo.
echo Installing StyleTTS2 dependencies...
%VENV_PYTHON% -m pip install phonemizer einops munch pydub accelerate diffusers nltk torchaudio
%VENV_PYTHON% -m pip install git+https://github.com/resemble-ai/monotonic_align.git

REM phonemizer needs espeak-ng on Windows
echo.
echo Checking espeak-ng (required by phonemizer)...
where espeak-ng >nul 2>&1
if errorlevel 1 (
    echo.
    echo WARNING: espeak-ng not found on PATH.
    echo Download from: https://github.com/espeak-ng/espeak-ng/releases
    echo Install it, then re-run this script.
    echo.
    echo Alternatively, install via winget:
    echo   winget install --id espeak-ng.espeak-ng
    pause
    exit /b 1
)
echo espeak-ng found.

REM 3. Download pre-trained LibriTTS checkpoint
set PRETRAINED=%HERE%pretrained\StyleTTS2-LibriTTS
if exist "%PRETRAINED%\epochs_2nd_00020.pth" (
    echo Pre-trained checkpoint already downloaded, skipping.
) else (
    echo.
    echo Downloading pre-trained StyleTTS2 checkpoint...
    echo (This is ~736 MB - run via WSL if huggingface.co is blocked)
    mkdir "%PRETRAINED%" 2>nul
    %VENV_PYTHON% "%HERE%download_pretrained.py"
    if errorlevel 1 (
        echo ERROR: checkpoint download failed.
        echo Run manually via WSL: wsl curl -L -o pretrained/StyleTTS2-LibriTTS/epochs_2nd_00020.pth https://huggingface.co/yl4579/StyleTTS2-LibriTTS/resolve/main/Models/LibriTTS/epochs_2nd_00020.pth
        pause
        exit /b 1
    )
)

echo.
echo === Setup complete ===
echo.
echo Next steps:
echo   1. Run: python download_vctk.py          (downloads ~11 GB of training audio)
echo   2. Listen to vctk_data\wavs_raw\pXXX\    and identify your preferred speakers
echo   3. Run: python prepare_training_data.py --speakers p237,p259,p284,p292,...
echo   4. Run: train.bat
echo.
pause
