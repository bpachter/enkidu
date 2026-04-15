@echo off
echo Starting Enkidu Phase 7 UI...

:: Start FastAPI backend
start "Enkidu Backend" cmd /k "cd /d %~dp0server && python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload"

:: Brief pause to let backend initialize
timeout /t 2 /nobreak >nul

:: Start Vite dev server
start "Enkidu Frontend" cmd /k "cd /d %~dp0client && npm run dev"

echo.
echo Backend:  http://localhost:8000
echo Frontend: http://localhost:5173
echo.
echo Both servers running. Close their windows to stop.
