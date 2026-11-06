@echo off
chcp 65001 >nul
echo インターネット上の案内画面をキオスクモードで開きます。
echo 終了するときは、キーボードで Alt+F4 を押してください。
call "%~dp0_open_kiosk.bat" "https://cpcallgol.github.io/event-2026-festival-map-ietsuka-ver/"
