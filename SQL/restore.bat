@echo off
chcp 65001 > nul
setlocal enabledelayedexpansion

set "PSQL=C:\Program Files\PostgreSQL\17\bin\psql.exe"
set "PGHOST=aws-0-us-west-2.pooler.supabase.com"
set "PGUSER=postgres.telbvcjyrdrhrfkgsfaf"
set "PGPORT=5432"
set "PGDATABASE=postgres"

echo ===================================================
echo   Restauracion en el proyecto NUEVO (ETPS)
echo ===================================================
echo.

if not exist "Bkp" (
    echo No se encontro la carpeta Bkp en esta ubicacion.
    pause
    exit /b 1
)

set "SCHEMA_FILE="
for /f "delims=" %%F in ('dir /b /o-n "Bkp\entreticas_schema_*.sql" 2^>nul') do (
    if not defined SCHEMA_FILE set "SCHEMA_FILE=%%F"
)

set "DATA_FILE="
for /f "delims=" %%F in ('dir /b /o-n "Bkp\entreticas_data_*.sql" 2^>nul') do (
    if not defined DATA_FILE set "DATA_FILE=%%F"
)

if not defined SCHEMA_FILE (
    echo No se encontro ningun archivo Bkp\entreticas_schema_*.sql
    pause
    exit /b 1
)

if not defined DATA_FILE (
    echo No se encontro ningun archivo Bkp\entreticas_data_*.sql
    pause
    exit /b 1
)

echo Esquema a restaurar: %SCHEMA_FILE%
echo Datos a restaurar:   %DATA_FILE%
echo.

set /p DB_PASS="Ingresa la clave de la base de datos NUEVA (ETPS): "
echo.

set "CONNSTR=postgresql://%PGUSER%:%DB_PASS%@%PGHOST%:%PGPORT%/%PGDATABASE%"

echo ===================================================
echo   Paso 1 de 2: restaurando ESTRUCTURA...
echo ===================================================
"%PSQL%" "%CONNSTR%" -f "Bkp\%SCHEMA_FILE%"

if errorlevel 1 (
    echo.
    echo ===================================================
    echo   ERROR restaurando la estructura. Revisa el mensaje de arriba.
    echo   No se continuara con la carga de datos.
    echo ===================================================
    pause
    exit /b 1
)

echo.
echo ===================================================
echo   Paso 2 de 2: restaurando DATOS...
echo ===================================================
"%PSQL%" "%CONNSTR%" -f "Bkp\%DATA_FILE%"

if errorlevel 1 (
    echo.
    echo ===================================================
    echo   ERROR restaurando los datos. Revisa el mensaje de arriba.
    echo ===================================================
    pause
    exit /b 1
)

echo.
echo ===================================================
echo   Restauracion completada con exito en ETPS!
echo ===================================================
echo.

pause
