@echo off
REM Sobe os 3 backends e os 2 frontends do ecossistema, cada um em uma aba do Windows Terminal (PowerShell).
REM Portas: e-Sigma backend=8000  Lojas backend=8001  CoReVM backend=8003
REM         e-Sigma frontend=5173  CoReVM frontend=5174
cd /d "%~dp0"

REM Remove a barra invertida final de %~dp0 (senao ela "escapa" a aspa de fechamento
REM quando usada como valor de -d, fazendo o wt engolir o resto da linha de comando).
set "ROOTDIR=%~dp0"
if "%ROOTDIR:~-1%"=="\" set "ROOTDIR=%ROOTDIR:~0,-1%"

wt -w 0 new-tab --title "e-Sigma backend (8000)" -d "%ROOTDIR%" -- powershell -NoExit -Command ..\e-sigma\backend\start_backend.bat
wt -w 0 new-tab --title "Lojas backend (8001)" -d "%ROOTDIR%" -- powershell -NoExit -Command ..\Lojas\backend\start_backend.bat
wt -w 0 new-tab --title "CoReVM backend (8003)" -d "%ROOTDIR%" -- powershell -NoExit -Command backend\start_backend.bat
wt -w 0 new-tab --title "e-Sigma frontend (5173)" -d "%ROOTDIR%" -- powershell -NoExit -Command ..\e-sigma\frontend\start_frontend.bat
wt -w 0 new-tab --title "CoReVM frontend (5174)" -d "%ROOTDIR%" -- powershell -NoExit -Command frontend\start_frontend.bat

echo Todos os servicos foram iniciados em abas do Windows Terminal (PowerShell).
echo e-Sigma  : http://localhost:8000/docs  (API)  e  http://localhost:5173  (frontend)
echo Lojas    : http://localhost:8001/docs  (API)
echo CoReVM   : http://localhost:8003/docs  (API)  e  http://localhost:5174  (frontend)
