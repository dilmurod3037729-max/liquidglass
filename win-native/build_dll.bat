@echo off
setlocal enabledelayedexpansion
set "VSDIR="
set "VSWHERE=%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\vswhere.exe"
if exist "!VSWHERE!" for /f "usebackq delims=" %%i in (`"!VSWHERE!" -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath`) do set "VSDIR=%%i"
if not defined VSDIR for /f "delims=" %%y in ('dir /b /ad /o-n "%ProgramFiles%\Microsoft Visual Studio" 2^>nul') do for %%e in (Enterprise Professional Community BuildTools) do if not defined VSDIR if exist "%ProgramFiles%\Microsoft Visual Studio\%%y\%%e\VC\Auxiliary\Build\vcvars64.bat" set "VSDIR=%ProgramFiles%\Microsoft Visual Studio\%%y\%%e"
if not defined VSDIR echo Visual Studio with the "Desktop development with C++" workload was not found & exit /b 1
call "%VSDIR%\VC\Auxiliary\Build\vcvars64.bat" >nul || exit /b 1
set "KITS=%ProgramFiles(x86)%\Windows Kits\10\Include"
set "CPPWINRT="
for /f "delims=" %%d in ('dir /b /ad /o-n "%KITS%\10.*" 2^>nul') do if not defined CPPWINRT if exist "%KITS%\%%d\cppwinrt\winrt\base.h" set "CPPWINRT=%KITS%\%%d\cppwinrt"
if not defined CPPWINRT echo Windows SDK with C++/WinRT headers not found & exit /b 1
cd /d "%~dp0"
cl /nologo /std:c++20 /O2 /EHsc /W3 /LD /I "%CPPWINRT%" lgwin.cpp /Fe:lgwin.dll user32.lib d3d11.lib dxgi.lib dcomp.lib dwmapi.lib d3dcompiler.lib windowsapp.lib
exit /b %errorlevel%
