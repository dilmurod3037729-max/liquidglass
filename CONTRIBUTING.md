# Contributing

Thanks for helping. Small, focused pull requests are easiest to review.

## Layout

| Folder | What | How to check it |
|---|---|---|
| `web/` | WebGL2 library, demo, Electron host | `cd web && npm test` |
| `core/` | C++ renderer (OpenGL 3.3), Qt 6 backend | `cmake -S core -B build && cmake --build build && ctest --test-dir build` |
| `win-native/` | Windows DLL (Direct3D 11), C# binding | `win-native\build_dll.bat` (needs Visual Studio C++ tools) |
| `python/` | PySide6 integration and demos | run `python\popup_demo.py` |

The JavaScript core and the C++ core share golden tests: a change to the physics must keep both in agreement.

## Before you open a pull request

- Run the checks for the folder you touched.
- Include numbers for performance claims: GPU, OS, scene, how to reproduce.
- Comments and documentation are in English.
- Do not add screenshots or videos that show personal data (file names, user names, host names, e-mail addresses).

## Reporting bugs

Use the bug template. For rendering problems attach a screenshot, your OS and GPU, and the library version.
