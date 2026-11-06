# liquidglass_qt (PySide6)

PySide6 (Qt Widgets) ilovasidagi **haqiqiy tugmalarni** suyuq shisha materialga almashtiradi, ilova kodiga tegmasdan.
Qo'shimcha paket kerak emas (faqat PySide6): shisha `QOpenGLWidget` ichida, shader `../core/shaders/liquidglass.frag` (veb va C++ bilan bir xil).

```python
from PySide6.QtGui import QSurfaceFormat
fmt = QSurfaceFormat(); fmt.setVersion(3, 3); fmt.setProfile(QSurfaceFormat.CoreProfile)
QSurfaceFormat.setDefaultFormat(fmt)          # QApplication yaratilishidan OLDIN

from liquidglass_qt import attach
app = QApplication(sys.argv)
window = MainWindow(); window.show()
glass = attach(window)                        # barcha QPushButton shisha bo'ladi
glass = attach(window, params={"bevel": 14})  # sozlamalar: ior, thick, bevel, disp, blur, spec, absorb, merge
```

Parametrlar: `selector` (sinf, standart `QPushButton`), `params`, `radius` (px, standart ilova stylesheet'idan), `poll_ms`.

## Qanday ishlaydi

1. Tugmalar topiladi, asl ko'rinishi yashiriladi (`QGraphicsOpacityEffect`, tugma bosiladigan qoladi).
2. Oyna surati tugmalarsiz olinadi (`QWidget.grab`), sichqonchaga shaffof `QOpenGLWidget` shuni sindiradi.
3. Yozuvlar ustiga `QLabel` nusxa sifatida qo'yiladi; rangi shisha ostidagi fon yorug'ligiga moslashadi.
4. Asl tugmaning fon rangi shisha rangi bo'ladi (ko'k tugma = ko'k shisha, neytral/och = tiniq shisha).
5. Hover va bosish shishani biroz kattalashtiradi. Oyna o'zgarsa (bo'lim almashdi, matn yozildi) surat va shisha o'zi yangilanadi.

## Cheklovlar

- Shisha qatlami oynani to'liq qoplaydi va sahifa **suratini** ko'rsatadi: surat har ~250 ms da (o'zgargan bo'lsa) yangilanadi, shuning uchun tez animatsiyalar kechikadi.
- Faqat yoqilgan (enabled) va ko'rinadigan tugmalar shisha bo'ladi (o'chirilganlari o'z holida qoladi).
- Hozircha bo'laklar (tile) va qatlam/suyuq cho'zilish yo'q: faqat qo'zg'almas tugmalar (odatda ilova tugmalariga yetarli).
- Sinalgan: PySide6 6.11, OpenGL 3.3 core, Windows.
