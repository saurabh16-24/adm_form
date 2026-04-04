$pgBin  = "C:\Program Files\PostgreSQL\18\bin"
$pgData = "C:\Program Files\PostgreSQL\18\data"
$pgHba  = "$pgData\pg_hba.conf"
$psql   = "$pgBin\psql.exe"
$pgSvc  = "postgresql-x64-18"

Write-Host "`n=== Step 1: Switch to trust auth ===" -ForegroundColor Cyan
$hba = Get-Content $pgHba -Raw
$hba = $hba -replace 'scram-sha-256', 'trust' -replace '\bmd5\b', 'trust'
Set-Content $pgHba $hba
Write-Host "pg_hba.conf set to trust mode"

Write-Host "`n=== Step 2: Restart PostgreSQL ===" -ForegroundColor Cyan
Restart-Service $pgSvc -Force
Start-Sleep -Seconds 3
Write-Host "Service restarted"

Write-Host "`n=== Step 3: Set postgres password to admin123 ===" -ForegroundColor Cyan
& $psql -U postgres -h 127.0.0.1 -p 5433 -c "ALTER USER postgres WITH PASSWORD 'admin123';"

Write-Host "`n=== Step 4: Create svce_admissions database ===" -ForegroundColor Cyan
& $psql -U postgres -h 127.0.0.1 -p 5433 -c "CREATE DATABASE svce_admissions;" 2>&1 | ForEach-Object { Write-Host $_ }

Write-Host "`n=== Step 5: Switch back to scram-sha-256 ===" -ForegroundColor Cyan
$hba = Get-Content $pgHba -Raw
$hba = $hba -replace '\btrust\b', 'scram-sha-256'
Set-Content $pgHba $hba
Write-Host "pg_hba.conf restored to scram-sha-256"

Write-Host "`n=== Step 6: Restart PostgreSQL again ===" -ForegroundColor Cyan
Restart-Service $pgSvc -Force
Start-Sleep -Seconds 3
Write-Host "Service restarted"

Write-Host "`n=== Step 7: Test final connection ===" -ForegroundColor Cyan
$env:PGPASSWORD = 'admin123'
$result = & $psql -U postgres -h 127.0.0.1 -p 5433 -d svce_admissions -c "SELECT current_database(), current_user;" 2>&1
Write-Host $result

Write-Host "`n=== ALL DONE! ===" -ForegroundColor Green
Write-Host "Database: svce_admissions | User: postgres | Password: admin123 | Port: 5433"
