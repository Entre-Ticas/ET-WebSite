@echo off
chcp 65001 > nul
if not exist "Bkp" mkdir "Bkp"

echo ===================================================
echo   Iniciando respaldo del ESQUEMA de la base (PROD)...
echo ===================================================
echo.

set /p DB_PASS="Ingresa la clave de la base de datos: "

echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command "$env:Path = 'C:\Program Files\PostgreSQL\17\bin;' + $env:Path; $file = Join-Path (Get-Location).Path ('Bkp\entreticas_schema_' + (Get-Date -Format 'yyyyMMdd_HHmmss') + '.sql'); $job = Start-Job -ScriptBlock { param($p, $f) $env:Path = 'C:\Program Files\PostgreSQL\17\bin;' + $env:Path; pg_dump --schema-only -T 'schema_migrations*' -f $f \"postgresql://postgres.wjzpyvrffjppwvsikrfr:${p}@aws-1-us-west-2.pooler.supabase.com:5432/postgres\" } -ArgumentList '%DB_PASS%', $file; $i = 1; while ($job.State -eq 'Running') { $dots = '.' * $i; Write-Host -NoNewline (\"\`rProcesando respaldo de esquema$dots              \"); Start-Sleep -Milliseconds 300; $i++; if ($i -gt 10) { $i = 1 } }; $null = Receive-Job -Job $job; Remove-Job -Job $job; Write-Host \"\`rProcesando respaldo de esquema.......... Listo!                   \""

echo.
echo ===================================================
echo   Respaldo de esquema completado con exito en /Bkp!
echo ===================================================
echo.

pause
