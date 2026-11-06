# liquidglass_qt (PySide6)

PySide6 (Qt Widgets) ilovasining **istalgan vidjetlarini** (tugma, karta/konteyner, jadval, kiritish maydoni, popup/dialog) suyuq shisha
materialga aylantiradi, ilova kodiga tegmasdan. Qo'shimcha paket kerak emas (faqat PySide6): shisha `QOpenGLWidget` ichida,
shader `../core/shaders/liquidglass.frag` (veb va C++ bilan bir xil).

```python
from PySide6.QtGui import QSurfaceFormat
fmt = QSurfaceFormat(); fmt.setVersion(3, 3); fmt.setProfile(QSurfaceFormat.CoreProfile)
QSurfaceFormat.setDefaultFormat(fmt)          # QApplication yaratilishidan OLDIN

from liquidglass_qt import attach, Glass
app = QApplication(sys.argv)
window = MainWindow(); window.show()

glass = attach(window)                        # barcha QPushButton shisha; popup/dialoglar ham avtomatik

glass = attach(window, rules=[                # qayerga qanday: istagan joyga qo'llang
    Glass(QPushButton),                                              # tugma: to'liq shisha, yozuvi ustida
    Glass(lambda w: w.objectName() == "Card", "panel", radius=10),   # karta/konteyner: shisha ramka, ichi jonli
    Glass(QTableView, "table"),                                      # jadval: shisha ramka, aylantirish jonli
    Glass(QLineEdit, "input"),
], params={"bevel": 22, "shadow": 0.35})

glass.add(any_widget, "panel", radius=14)     # istalgan vidjetni qo'lda qo'shish
glass.remove(any_widget)
glass.set_params(thick=50)                    # jonli sozlash
```

## Qoidalar va materiallar

`Glass(selector, material, radius=None, **overrides)`:

- **selector**: vidjet sinfi (yoki sinflar tuple'i), `objectName` (str) yoki predikat `widget -> bool`. Birinchi mos kelgan qoida ishlaydi.
- **material**: tayyor nom yoki o'zingizniki (`dict`):

| Material | Qanday | bevel | thick | frame | hide | hover |
|---|---|---|---|---|---|---|
| `button` | to'liq shisha, asl tugma yashiriladi, yozuv nusxasi ustida | 1.0 | 1.0 | yo'q | ha | ha |
| `panel` | karta/konteyner: vidjet o'z holida, ustiga shisha ramka | 0.4 | 0.25 | ha | yo'q | yo'q |
| `table` | jadval: shisha ramka, aylantirish/tahrir jonli | 0.35 | 0.2 | ha | yo'q | yo'q |
| `input` | kiritish maydoni | 0.5 | 0.3 | ha | yo'q | yo'q |

`bevel`/`thick` global `params` ga ko'paytiruvchi. `frame=True`: markazi shaffof, faqat qirra shisha. `hide=True`: asl vidjet ko'rinmas
(lekin bosiladi), o'rnida shisha va yozuv nusxasi. Rang: `button` materialida asl tugma fon rangi shisha rangi bo'ladi (ko'k tugma = ko'k shisha).

`params`: `ior`, `thick`, `bevel`, `disp`, `blur`, `spec`, `absorb`, `merge`, `shadow`.

## Qanday ishlaydi

1. Shisha qatlami **shaffof** `QOpenGLWidget`: faqat shisha va soya chiziladi, qolgan joyda ilovaning o'zi jonli ko'rinadi (jadval aylanadi, matn yoziladi).
2. Sinish manbai: oyna surati (faqat oyna o'zgarganda olinadi). `button` kabi `hide` vidjetlar suratda ko'rinmaydi.
3. Har bir popup/dialog (`QMessageBox` ham) ochilganda o'z shisha qatlamini oladi (`popups=True`, standart).
4. Hover va bosish tugmani biroz kattalashtiradi.

## Tezlik (o'lchangan)

PySide6 6.11, 1400x900 oyna (DPR 1.5), RTX 2080 SUPER:

| Qism | Vaqt |
|---|---|
| GL chizish (`paintGL`, protsessor tomoni) | ~0.7 ms (hover animatsiyasi paytida ham shu) |
| Sahifa surati + GPU'ga yuklash | ~20 ms, **faqat oyna o'zgarganda** |
| Bo'sh turganda | 0 (zaxira yangilash 2.5 s da bir marta; matn maydonida fokus bo'lsa 0.5 s) |

Surat olish `Paint` hodisalariga emas, haqiqiy kirish hodisalariga (bosish, klaviatura, g'ildirak, fokus) va tuzilma o'zgarishlariga
(`LayoutRequest`, `Show/Hide`, `Resize`...) bog'langan: shisha qatlami yangilanganda Qt uning ostidagi hamma vidjetni qayta chizadi,
shuning uchun `Paint` ni o'zgarish belgisi qilsak cheksiz sikl bo'ladi. `attach(window, idle_ms=0)` zaxira yangilashni o'chiradi.

## Cheklovlar

- Sinish manbai suratdan olinadi: tez o'zgaradigan kontent (animatsiya) ramka qirrasida ~80 ms kechikib sinadi (markazi jonli, kechikmaydi).
- `button` kabi `hide` vidjetlar faqat yoqilgan (enabled) va ko'rinadigan bo'lsa shisha bo'ladi.
- Panel/jadval shisha ramkasi kontentni qirraga yaqin joyda biroz buradi (ramka ingichka: `bevel`/`thick` ko'paytiruvchilari bilan sozlang).
- Qatlam/suyuq cho'zilish va bo'laklar (tile) hozircha yo'q: faqat qo'zg'almas shakllar.
- Sinalgan: PySide6 6.11, OpenGL 3.3 core, Windows.

## Native (GPU) backend: Windows

`attach(window)` Windows'da `win-native/lgwin.dll` mavjud bo'lsa avtomatik native backend'ni tanlaydi (`backend="gl"` bilan OpenGL'ni majburlash mumkin).
Shisha Windows kompozitori ichida alohida shaffof oynada chiziladi, orqa fon DXGI Desktop Duplication orqali GPU'da olinadi (~0.05 ms/kadr, ekran
o'zgarmasa 0 kadr/s). Oyna ekran suratidan yashirilmaydi. Yorug'lik manbai displayda qo'zg'almas (`fixed_light`), sichqonchaga bog'liq emas.

```python
from liquidglass_win import NativeController, make_popup
make_popup(dlg, under=True)                       # sarlavhasiz popup, o'zimizning sarlavha va yopish tugmasi
ctl = NativeController(dlg, rules=[Glass(QPushButton)], under=True, popup=True)   # frost=9 (Gauss, markaz), edge=0 (qirra)
```

Popup/dialoglar `attach(..., popups=True)` bilan avtomatik shisha oladi. `popup_demo.py` — erkin siljitiladigan namuna, `glass_tuner.py` — shisha
xossalarini slayderlar bilan jonli sozlash (qiymatlar JSON bo'lib `out/glass_tuning.json` ga yoziladi). Standart qiymatlar `liquidglass_win.py` boshida.
