# Security policy

## Reporting a vulnerability

Please report security problems privately through GitHub: **Security → Report a vulnerability** on this repository.
Do not open a public issue for them. You will get an answer within 7 days.

## What the native Windows backend does

`lgwin.dll` captures the pixels of windows with the Windows Graphics Capture API and the Desktop Duplication API and draws them
refracted inside an overlay window. The pixels stay on the GPU and in the process that loaded the DLL. The library does not open
network connections, write captured pixels to disk (except the explicit `lg_dump` debug call) or send them to another process.
Protected content (DRM video) is not captured by these APIs and is therefore not visible behind the glass.

## Supported versions

Only the latest release and `main` receive fixes.
