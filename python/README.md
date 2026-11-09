# liquidglass_qt (PySide6)

Turns **any widget** of a PySide6 (Qt Widgets) app (button, card/container, table, input field, popup/dialog) into a liquid glass
material, without touching the app's code. No extra package is needed (only PySide6): the glass lives in a `QOpenGLWidget`, and the
shader is `../core/shaders/liquidglass.frag` (the same as the web and C++ versions).

```python
from PySide6.QtGui import QSurfaceFormat
fmt = QSurfaceFormat(); fmt.setVersion(3, 3); fmt.setProfile(QSurfaceFormat.CoreProfile)
QSurfaceFormat.setDefaultFormat(fmt)          # BEFORE the QApplication is created

from liquidglass_qt import attach, Glass
app = QApplication(sys.argv)
window = MainWindow(); window.show()

glass = attach(window)                        # every QPushButton becomes glass; popups and dialogs too, automatically

glass = attach(window, rules=[                # what gets which material
    Glass(QPushButton),                                              # button: full glass, label on top
    Glass(lambda w: w.objectName() == "Card", "panel", radius=10),   # card/container: glass frame, live inside
    Glass(QTableView, "table"),                                      # table: glass frame, scrolling stays live
    Glass(QLineEdit, "input"),
], params={"bevel": 22, "shadow": 0.35})

glass.add(any_widget, "panel", radius=14)     # add any widget by hand
glass.remove(any_widget)
glass.set_params(thick=50)                    # tune live
```

## Rules and materials

`Glass(selector, material, radius=None, **overrides)`:

- **selector**: a widget class (or a tuple of classes), an `objectName` (str) or a predicate `widget -> bool`. The first matching rule wins.
- **material**: a ready-made name or your own `dict`:

| Material | What it is | bevel | thick | frame | hide | hover |
|---|---|---|---|---|---|---|
| `button` | full glass, the original button is hidden, a copy of its label is drawn on top | 1.0 | 1.0 | no | yes | yes |
| `panel` | card/container: the widget stays as it is, a glass frame is drawn over it | 0.4 | 0.25 | yes | no | no |
| `table` | table: glass frame, scrolling and editing stay live | 0.35 | 0.2 | yes | no | no |
| `input` | input field | 0.5 | 0.3 | yes | no | no |

`bevel` and `thick` multiply the global `params`. `frame=True`: the centre is transparent and only the rim is glass. `hide=True`: the
original widget is invisible (but still clickable) and glass plus a copy of the label take its place. Colour: with the `button` material
the original button's background colour becomes the glass tint (a blue button gives blue glass).

`params`: `ior`, `thick`, `bevel`, `disp`, `blur`, `spec`, `absorb`, `merge`, `shadow`.

## How it works

1. The glass layer is a **transparent** `QOpenGLWidget`: only glass and shadow are drawn, everywhere else the app itself stays live
   (a table scrolls, text is typed).
2. The refraction source is a snapshot of the window (retaken only when the window changes). `hide` widgets such as `button` are
   not in the snapshot.
3. Every popup/dialog (`QMessageBox` too) gets its own glass layer when it opens (`popups=True`, the default).
4. Hover and press make the button grow slightly.

## Speed (measured)

PySide6 6.11, 1400x900 window (DPR 1.5), RTX 2080 SUPER:

| Part | Time |
|---|---|
| GL drawing (`paintGL`, CPU side) | ~0.7 ms (the same during the hover animation) |
| Window snapshot + GPU upload | ~20 ms, **only when the window changes** |
| Idle | 0 (a fallback refresh once every 2.5 s; every 0.5 s while a text field has focus) |

Snapshots are triggered by real input events (clicks, keyboard, wheel, focus) and structure changes (`LayoutRequest`, `Show/Hide`,
`Resize`...), not by `Paint` events: when the glass layer updates, Qt repaints every widget under it, so using `Paint` as a change
signal would loop forever. `attach(window, idle_ms=0)` turns the fallback refresh off.

## Limitations

- The refraction source is a snapshot: fast-changing content (animation) refracts at the frame edge with a delay of about 80 ms
  (the centre is live and has no delay).
- `hide` widgets such as `button` become glass only while they are enabled and visible.
- The glass frame of a panel or table bends the content slightly near the edge (the frame is thin; tune it with the `bevel`/`thick` multipliers).
- Layering, liquid stretching and tiles are not available yet: static shapes only.
- Tested with PySide6 6.11, OpenGL 3.3 core, Windows.

## Native (GPU) backend: Windows

On Windows `attach(window)` picks the native backend automatically when `win-native/lgwin.dll` exists (force OpenGL with `backend="gl"`).
The glass is drawn in a separate transparent window inside the Windows compositor, and the backdrop is captured on the GPU
(about 0.05 ms per frame, 0 frames/s when the screen does not change). The window is not hidden from screen capture. The light source is
fixed on the display (`fixed_light`) and does not follow the mouse.

```python
from liquidglass_win import NativeController, make_popup
make_popup(dlg, under=True)                       # a frameless popup with our own title and close button
ctl = NativeController(dlg, rules=[Glass(QPushButton)], under=True, popup=True)   # frost=9 (Gaussian, centre), edge=0 (rim)
```

Popups and dialogs get glass automatically with `attach(..., popups=True)`. `popup_demo.py` is a freely movable sample;
`glass_tuner.py` tunes the glass properties live with sliders (values are written as JSON to `out/glass_tuning.json`).
Defaults are at the top of `liquidglass_win.py`.
