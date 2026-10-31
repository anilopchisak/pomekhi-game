@echo off
setlocal
cd /d "%~dp0"
if exist ".runtime\node\node.exe" (
  ".runtime\node\node.exe" "scripts\project.mjs" dev
) else (
  node "scripts\project.mjs" dev
)
if errorlevel 1 pause
