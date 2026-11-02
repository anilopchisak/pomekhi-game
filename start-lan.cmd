@echo off
setlocal
cd /d "%~dp0"
if exist ".runtime\node\node.exe" (
  ".runtime\node\node.exe" "scripts\project.mjs" start:lan
) else (
  node "scripts\project.mjs" start:lan
)
if errorlevel 1 pause
