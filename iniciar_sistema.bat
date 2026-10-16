@echo off
title Controle de Estoque ITEC - Node.js
cls
echo =========================================================
echo   INICIANDO CONTROLE DE ESTOQUE ITEC (NODE.JS)
echo =========================================================
echo.
cd /d "%~dp0"

IF NOT EXIST "node_modules\" (
    echo Instalando dependencias do Node...
    call npm install
    IF %ERRORLEVEL% NEQ 0 (
        echo Erro ao instalar dependencias.
        pause
        exit /b %ERRORLEVEL%
    )
)

echo Iniciando o servidor Node.js...
echo Abrindo o sistema no seu navegador em http://localhost:5000...
start "" http://localhost:5000
node server.js
IF %ERRORLEVEL% NEQ 0 (
    echo.
    echo Ocorreu um erro ao rodar o servidor Node.js.
)
pause
