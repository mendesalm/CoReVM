@echo off
REM Sobe os 3 backends e os 2 frontends do ecossistema, cada um com porta fixa.
REM Portas: e-Sigma backend=8000  Lojas backend=8001  CoReVM backend=8003
REM         e-Sigma frontend=5173  CoReVM frontend=5174
cd /d "%~dp0"

start "e-Sigma backend (8000)" cmd /k call "..\e-sigma\backend\start_backend.bat"
start "Lojas backend (8001)" cmd /k call "..\Lojas\backend\start_backend.bat"
start "CoReVM backend (8003)" cmd /k call "backend\start_backend.bat"
start "e-Sigma frontend (5173)" cmd /k call "..\e-sigma\frontend\start_frontend.bat"
start "CoReVM frontend (5174)" cmd /k call "frontend\start_frontend.bat"

echo Todos os servicos foram iniciados em janelas separadas.
echo e-Sigma  : http://localhost:8000/docs  (API)  e  http://localhost:5173  (frontend)
echo Lojas    : http://localhost:8001/docs  (API)
echo CoReVM   : http://localhost:8003/docs  (API)  e  http://localhost:5174  (frontend)
pause
