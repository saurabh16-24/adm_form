@echo off
echo Running as: %USERNAME%

REM Step 1 - Switch pg_hba.conf to trust
echo Switching to trust auth...
powershell -Command "$h='C:\Program Files\PostgreSQL\18\data\pg_hba.conf'; $c=(Get-Content $h -Raw) -replace 'scram-sha-256','trust'; Set-Content $h $c"
echo Done.

REM Step 2 - Stop and start service
echo Stopping PostgreSQL...
net stop postgresql-x64-18 >nul 2>&1
echo Starting PostgreSQL...
net start postgresql-x64-18 >nul 2>&1
echo Waiting 5 seconds...
timeout /t 5 /nobreak >nul

REM Step 3 - Set password
echo Setting password...
"C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -h 127.0.0.1 -p 5433 -c "ALTER USER postgres WITH PASSWORD 'admin123';"
echo.
"C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -h 127.0.0.1 -p 5433 -c "SELECT datname FROM pg_database;"

REM Step 4 - Create DB if needed
"C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -h 127.0.0.1 -p 5433 -c "CREATE DATABASE svce_admissions;" 2>nul

REM Step 5 - Restore scram-sha-256
echo Restoring scram-sha-256...
powershell -Command "$h='C:\Program Files\PostgreSQL\18\data\pg_hba.conf'; $c=(Get-Content $h -Raw) -replace '\btrust\b','scram-sha-256'; Set-Content $h $c"

REM Step 6 - Restart again
net stop postgresql-x64-18 >nul 2>&1
net start postgresql-x64-18 >nul 2>&1
timeout /t 5 /nobreak >nul

REM Step 7 - Final test
echo Final test with password...
set PGPASSWORD=admin123
"C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -h 127.0.0.1 -p 5433 -d svce_admissions -c "SELECT current_database(), current_user, version();"

echo.
echo ==============================
echo SETUP COMPLETE
echo ==============================
echo DB: svce_admissions
echo User: postgres  Password: admin123  Port: 5433
echo ==============================
pause
