@echo off
echo Creating OpenRGB startup task...
schtasks /Create /TN "OpenRGB SDK Startup" /TR "\"C:\Program Files\OpenRGB\OpenRGB.exe\" --server --startminimized" /SC ONLOGON /RL HIGHEST /F
if %ERRORLEVEL% == 0 (
    echo Success! OpenRGB will auto-start with SDK server on every logon.
) else (
    echo Failed. Make sure you right-clicked and chose "Run as administrator".
)
pause
