@echo off
REM Script to update pricing data with exact values from the document
REM Make sure to set your database connection parameters

echo 🚀 Starting pricing data update...

REM Set database connection (update these values for your setup)
if "%DB_HOST%"=="" set DB_HOST=localhost
if "%DB_PORT%"=="" set DB_PORT=5432
if "%DB_NAME%"=="" set DB_NAME=rehome
if "%DB_USER%"=="" set DB_USER=postgres

echo 📊 Updating city base charges and day data...
psql -h %DB_HOST% -p %DB_PORT% -U %DB_USER% -d %DB_NAME% -f migrate_pricing_update.sql

if %ERRORLEVEL% NEQ 0 (
    echo ❌ Error updating city pricing
    pause
    exit /b 1
)
echo ✅ City pricing updated successfully

echo 🪑 Updating furniture items...
psql -h %DB_HOST% -p %DB_PORT% -U %DB_USER% -d %DB_NAME% -f update_furniture_items.sql

if %ERRORLEVEL% NEQ 0 (
    echo ❌ Error updating furniture items
    pause
    exit /b 1
)
echo ✅ Furniture items updated successfully

echo 🔍 Verifying data...
psql -h %DB_HOST% -p %DB_PORT% -U %DB_USER% -d %DB_NAME% -f verify_pricing_data.sql

echo 🎉 Pricing update completed!
echo.
echo 📋 Summary of changes:
echo    • Updated city base charges with exact prices from document
echo    • Added day_of_week column (1=Monday, 2=Tuesday, ..., 7=Sunday)
echo    • Updated city day data to use numeric days
echo    • Updated furniture items with exact points from document
echo.
echo 💡 You can now use the admin dashboard to make further adjustments.
pause 