@echo off
call "C:\Program Files\Microsoft Visual Studio\2022\Professional\VC\Auxiliary\Build\vcvars64.bat" >nul
cd /d %~dp0
set CPPWINRT=C:\Program Files (x86)\Windows Kits\10\Include\10.0.26100.0\cppwinrt
cl /nologo /std:c++17 /O2 /EHsc /W3 /LD /I "%CPPWINRT%" lgwin.cpp /Fe:lgwin.dll user32.lib d3d11.lib dxgi.lib dcomp.lib dwmapi.lib d3dcompiler.lib windowsapp.lib
