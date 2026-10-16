@echo off
chcp 65001 >nul
setlocal
echo この版は自分のPC専用です。このPCの案内画面を開きます。
call "%~dp0open_local_viewer.bat"
exit /b %ERRORLEVEL%
