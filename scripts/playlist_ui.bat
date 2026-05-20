@echo off
:: Launch the GymBro Transcript Extractor GUI.
:: Usage: scripts\playlist_ui.bat

setlocal
if exist "%~dp0playlist_gui.py" (
  where py >nul 2>nul
  if %ERRORLEVEL%==0 (
    py -3 "%~dp0playlist_gui.py" %*
    exit /b %ERRORLEVEL%
  ) else (
    where python >nul 2>nul
    if %ERRORLEVEL%==0 (
      python "%~dp0playlist_gui.py" %*
      exit /b %ERRORLEVEL%
    ) else (
      echo Python not found on PATH. Install Python 3 and re-run.
      exit /b 1
    )
  )
) else (
  echo playlist_gui.py not found in %~dp0
  exit /b 1
)

endlocal