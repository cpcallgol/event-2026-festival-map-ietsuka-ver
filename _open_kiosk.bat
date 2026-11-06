@echo off
setlocal
set "APP_URL=%~1"
if "%APP_URL%"=="" set "APP_URL=http://127.0.0.1:5010/"
rem Touch screens: no swipe back/forward and no browser pinch zoom.
set "KIOSK_FLAGS=--user-data-dir="%TEMP%\koukasai_map_kiosk_plan2" --kiosk --no-first-run --disable-session-crashed-bubble --overscroll-history-navigation=0 --disable-pinch"

if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" (
    start "" "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" %KIOSK_FLAGS% --edge-kiosk-type=fullscreen "%APP_URL%"
    exit /b 0
)
if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" (
    start "" "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" %KIOSK_FLAGS% --edge-kiosk-type=fullscreen "%APP_URL%"
    exit /b 0
)
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (
    start "" "%ProgramFiles%\Google\Chrome\Application\chrome.exe" %KIOSK_FLAGS% "%APP_URL%"
    exit /b 0
)
if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" (
    start "" "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" %KIOSK_FLAGS% "%APP_URL%"
    exit /b 0
)

start "" "%APP_URL%"
exit /b 0
