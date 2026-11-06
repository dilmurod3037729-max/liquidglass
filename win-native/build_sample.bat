@echo off
call "C:\Program Files\Microsoft Visual Studio\2022\Professional\VC\Auxiliary\Build\vcvars64.bat" >nul
cd /d %~dp0
cl /nologo /std:c++17 /O2 /EHsc /Iinclude samples\cpp\sample.cpp /Fe:sample_cpp.exe user32.lib gdi32.lib shcore.lib lgwin.lib
