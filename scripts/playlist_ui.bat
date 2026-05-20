@echo off
:: Batch wrapper to run the Python UI. Place this in the scripts\ folder.
:: Usage: scripts\playlist_ui.bat

setlocal
if exist "%~dp0playlist_ui.py" (
  where py >nul 2>nul
  if %ERRORLEVEL%==0 (
    py -3 "%~dp0playlist_ui.py" %*
    exit /b %ERRORLEVEL%
  ) else (
    where python >nul 2>nul
    if %ERRORLEVEL%==0 (
      python "%~dp0playlist_ui.py" %*
      exit /b %ERRORLEVEL%
    ) else (
      echo Python not found on PATH. Install Python 3 and re-run.
      exit /b 1
    )
  )
) else (
  echo playlist_ui.py not found in %~dp0
  exit /b 1
)

endlocal