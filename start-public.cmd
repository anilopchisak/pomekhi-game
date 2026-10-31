@echo off
setlocal
cd /d "%~dp0"
if exist ".runtime\node\node.exe" (
  ".runtime\node\node.exe" "scripts\project.mjs" start:public
) else (
  node "scripts\project.mjs" start:public
)
if errorlevel 1 pause
