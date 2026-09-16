@echo off
set "HOST_JSON=%~dp0com.autoref.server.json"
echo Registering AutoRef Native Messaging Host...
echo Manifest path: %HOST_JSON%

reg add "HKCU\Software\Google\Chrome\NativeMessagingHosts\com.autoref.server" /ve /t REG_SZ /d "%HOST_JSON%" /f >nul 2>&1
if %ERRORLEVEL% equ 0 (
  echo Successfully registered for Google Chrome.
) else (
  echo Warning: Could not register for Google Chrome.
)

reg add "HKCU\Software\Microsoft\Edge\NativeMessagingHosts\com.autoref.server" /ve /t REG_SZ /d "%HOST_JSON%" /f >nul 2>&1
if %ERRORLEVEL% equ 0 (
  echo Successfully registered for Microsoft Edge.
)

echo Done.
