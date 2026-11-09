# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- CI: web tests, core on Linux, Windows and macOS, Windows DLL build. `build_dll.bat` finds any installed Visual Studio.
- Release workflow that attaches a prebuilt `lgwin.dll` to a tagged release.
- Native Windows: `lg_set_content_rect` uploads only the changed rectangle of the content layer (a blinking cursor no longer re-uploads the window).
- Native Windows: `lg_beat` render-thread heartbeat for host watchdogs.

### Changed
- Native Windows: redraws caused by a changing backdrop are rate-limited per window, so several glass windows over a 60 Hz backdrop no longer saturate the GPU (92 % busy in the worst measured case before).
- Native Windows: the glass follows a topmost target window.

### Fixed
- Native Windows: transient errors (RDP session, locked screen) are retried instead of leaving the overlay permanently broken.

## [0.4.1] - web

- Per-shape material, transparent overlay mode, shader fixes.

## [0.4.0]

- Native Windows backend (`lgwin.dll`), Qt 6 backend, per-shape materials, popups, tuner.
