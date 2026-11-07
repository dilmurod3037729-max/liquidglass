"""liquidglass_qt ning native (GPU) backendi: lgwin.dll.

Shisha Windows kompozitori ichida, alohida shaffof oynada chiziladi; orqa fon DXGI Desktop Duplication orqali GPU'da olinadi.
Python faqat shakllar ro'yxatini beradi: snapshot, yozuv nusxalari va asl tugmalarni yashirish kerak emas, ilova o'z holida qoladi.
"""
from __future__ import annotations

import ctypes
import os
import sys
import time
from pathlib import Path

from PySide6.QtCore import QEvent, QObject, QPoint, QRectF, Qt, QTimer
from PySide6.QtGui import QColor, QCursor, QGuiApplication, QImage, QPainter, QPainterPath, QPalette, QRegion
from PySide6.QtWidgets import QApplication, QGraphicsDropShadowEffect, QLabel, QPushButton, QToolButton, QWidget

from liquidglass_qt import DEFAULT_PARAMS as _GL_PARAMS, _WATCH, Glass, GlassController, Scene, fixed_light


def _load():
    if sys.platform != "win32":
        return None
    here = Path(__file__).resolve().parent
    for p in (here / "lgwin.dll", here.parent / "win-native" / "lgwin.dll"):
        if p.exists():
            dll = ctypes.CDLL(str(p))
            dll.lg_create.restype = ctypes.c_void_p
            dll.lg_create.argtypes = [ctypes.c_void_p]
            dll.lg_set_hold.argtypes = [ctypes.c_void_p, ctypes.c_int]
            dll.lg_set_backend.argtypes = [ctypes.c_void_p, ctypes.c_int]
            dll.lg_set_frost.argtypes = [ctypes.c_void_p, ctypes.c_float]
            dll.lg_set_edge.argtypes = [ctypes.c_void_p, ctypes.c_float]
            dll.lg_luma.argtypes = [ctypes.c_void_p]
            dll.lg_luma.restype = ctypes.c_float
            dll.lg_create3.restype = ctypes.c_void_p
            dll.lg_create3.argtypes = [ctypes.c_void_p, ctypes.c_int, ctypes.c_int]
            dll.lg_create2.restype = ctypes.c_void_p
            dll.lg_create2.argtypes = [ctypes.c_void_p, ctypes.c_int]
            dll.lg_set_content.argtypes = [ctypes.c_void_p, ctypes.c_void_p, ctypes.c_int, ctypes.c_int, ctypes.c_int]
            dll.lg_destroy.argtypes = [ctypes.c_void_p]
            dll.lg_kill_chrome.argtypes = [ctypes.c_void_p]
            dll.lg_capture_visible.argtypes = [ctypes.c_int]
            dll.lg_set.argtypes = [ctypes.c_void_p, ctypes.POINTER(ctypes.c_float), ctypes.c_int, ctypes.POINTER(ctypes.c_float), ctypes.c_int]
            dll.lg_light.argtypes = [ctypes.c_void_p, ctypes.c_float, ctypes.c_float]
            dll.lg_dump.argtypes = [ctypes.c_void_p, ctypes.c_wchar_p]
            dll.lg_dump.restype = ctypes.c_int
            dll.lg_error.argtypes = [ctypes.c_void_p, ctypes.POINTER(ctypes.c_int), ctypes.POINTER(ctypes.c_long)]
            dll.lg_info.argtypes = [ctypes.c_void_p, ctypes.POINTER(ctypes.c_long), ctypes.POINTER(ctypes.c_long), ctypes.POINTER(ctypes.c_int)]
            return dll
    return None


_dll = _load()


# Native backend standart qiymatlari (foydalanuvchi sozlagichda tanlagan, 2026-11-06)
DEFAULT_PARAMS = dict(ior=2.5, thick=120.0, bevel=80.0, disp=0.2, blur=6.0, spec=3.0, absorb=0.0, merge=0.0, shadow=0.0, lod=5.0, shadow_off=0.0)
NATIVE_BUTTON = dict(bevel=0.93, thick=0.28)   # tugma materiali ko'paytiruvchilari
POPUP_BEVEL, POPUP_THICK, POPUP_RADIUS_DEFAULT, POPUP_FROST = 0.21, 0.5, 16.0, 9.0


def available() -> bool:
    return _dll is not None


def capture_visible(ms: int = 3000):
    """Shisha oynalarini ms davomida ekran suratiga/ulashishga ko'rinadigan qiladi (orqa fon shu vaqt muzlaydi). PrtScn va Win+Shift+S
    bosilganda bu avtomatik ishlaydi; ekran yozuvi yoki masofaviy ulanish uchun qo'lda chaqiring."""
    if _dll is not None:
        _dll.lg_capture_visible(int(ms))


class NativeController(GlassController):
    """GlassController bilan bir xil API (add/remove/set_params), lekin shisha lgwin.dll da chiziladi."""

    def __init__(self, window: QWidget, rules: list[Glass] | None = None, selector=QPushButton, params: dict | None = None,
                 radius: float | None = None, min_size=(28, 22), under: bool = False, capture: str = "visible", popup: bool = False, frost: float | None = None, edge: float = 0.0, backdrop: str | None = None, **_ignored):
        QObject.__init__(self, window)
        self.window = window
        self.rules = list(rules) if rules else [Glass(selector, "button", radius)]
        self.params = {**DEFAULT_PARAMS, **(params or {})}
        self.visible = capture == "visible"   # "visible": oyna hech qachon ekran suratidan yashirilmaydi (markazi shaffof, faqat qirra); "exclude": yashiriladi, to'liq shisha
        if (under or self.visible) and "shadow" not in (params or {}):
            self.params["shadow"] = 0.0   # shisha oynasi popup bilan bir xil o'lchamda: soya oyna to'rtburchagida kesilib, burchakda kulrang to'rtburchak bo'lib qoladi
        self.min_size = min_size
        self._app_radius = self._find_app_radius()
        self.scene = Scene()
        self.overlay = None
        self.items: list[dict] = []
        self._extra: list[tuple[QWidget, Glass]] = []
        self._tints: dict[int, tuple] = {}
        self._sig = None
        self._dirty = True
        self._push_needed = True
        self._light = (0.0, 0.0)
        self._last = time.perf_counter()
        self._last_scan = 0.0
        self.under = under   # True: shisha oynaning OSTIDA (oyna shaffof, kontenti tiniq); False: ustida
        self._h = _dll.lg_create3(int(window.winId()), 1 if under else 0, 1 if self.visible else 0)
        backdrop = backdrop or ("wgc" if popup else "dda")   # popup: standart wgc (oynalarni alohida olish)
        self.backdrop = backdrop   # "dda": ekran kadri (eski); "wgc": popup ostidagi oynalarni alohida olish (o'zimizniki kadrga tushmaydi)
        if backdrop == "wgc":
            _dll.lg_set_backend(self._h, 1)
        self.popup = popup   # popup: orqa fon nusxasi ichkarida muzlatiladi, matn rangi orqa fon yorqinligiga moslanadi, tayyor bo'lgach ko'rsatiladi
        self._ink_light = None
        self._last_ink = 0.0
        self._reveal = popup
        if popup:
            _dll.lg_set_hold(self._h, 1)
            _dll.lg_set_frost(self._h, float(POPUP_FROST if frost is None else frost) * window.devicePixelRatioF())
            _dll.lg_set_edge(self._h, float(edge) * window.devicePixelRatioF())   # qirra refraksiyasi Gauss xiraligi (0 = o'chiq)   # frost: popup ichi haqiqiy Gauss xiraligi (mip bloklari emas)
        self._content_dirty = True
        self._quiet_until = 0.0   # kontent rasmga olingach o'zi chiqargan hodisalar (parda show/hide) qayta rasmga olishni ishga tushirmasin
        self._content_img = None
        if under:   # oyna kontenti shisha bilan BIR oynada chiziladi; Qt oynasi faqat ko'rinmas kirish vositasi
            window.setWindowOpacity(0.0 if popup else 0.02)   # popup: birinchi kadrdan keyin 0.02 (deyarli ko'rinmas kirish vositasi)
            self._content_timer = QTimer(self)
            self._content_timer.setInterval(16)
            self._content_timer.timeout.connect(self._push_content)
            self._content_timer.start()
            self._content_idle = 0
        window.installEventFilter(self)
        QApplication.instance().installEventFilter(self)
        window.destroyed.connect(self.close)
        self._timer = QTimer(self)
        self._timer.setInterval(16)
        self._timer.timeout.connect(self._tick)
        self._timer.start()

    # --- ommaviy API ---
    def set_params(self, **kw):
        self.params.update(kw)
        self._push_needed = True

    def close(self, *_):
        if self._h:
            self._timer.stop()
            if self.under:
                self._content_timer.stop()
            _dll.lg_destroy(self._h)
            self._h = None

    def dump(self, path: str) -> bool:
        return bool(self._h and _dll.lg_dump(self._h, path))

    def error(self) -> tuple[int, int]:
        st, hr = ctypes.c_int(), ctypes.c_long()
        _dll.lg_error(self._h, ctypes.byref(st), ctypes.byref(hr))
        return st.value, hr.value & 0xFFFFFFFF

    def info(self) -> tuple[int, int, int]:
        f, u, us = ctypes.c_long(), ctypes.c_long(), ctypes.c_int()
        _dll.lg_info(self._h, ctypes.byref(f), ctypes.byref(u), ctypes.byref(us))
        return f.value, u.value, us.value

    # --- ichki ---
    def _sync(self):
        found = self._collect()
        sig = tuple((id(x), self._rect(x).getRect()) for x, _ in found)
        if sig == self._sig:
            return
        self._sig = sig
        hov, prs = self.scene.hovered, self.scene.pressed
        self.scene.clear()
        self.items.clear()
        for x, mat in found:
            r = self._rect(x)
            tint = self._tint_of(x) if mat["tint"] else (0.0, 0.0, 0.0, 0.0)
            radius = mat["radius"] if mat["radius"] is not None else self._app_radius
            clear = mat["hide"] and not self.under
            nb = NATIVE_BUTTON if mat["hide"] else {"bevel": 1.0, "thick": 1.0}
            bevel = -abs(mat["bevel"] * nb["bevel"]) * 0.6 if clear else mat["bevel"] * nb["bevel"]   # tugma: qirrasi linza (ingichka), markazi tiniq: yozuv o'qiladi va ikkilanmaydi
            thick = -abs(mat["thick"]) if mat["frame"] else abs(mat["thick"]) * nb["thick"] * (0.14 if clear else 1.0)
            if self.visible:
                bevel = -abs(bevel)   # ko'rinadigan rejim: markaz shaffof (jonli), faqat sinadigan qirra: to'liq xira shisha tagini ko'ra olmaydi   # kichik tugmada qalin linza yozuvni ikkilantiradi
            idx = self.scene.add(r.x() + r.width() / 2, r.y() + r.height() / 2, r.width(), r.height(),
                                 min(radius, r.height() / 2, r.width() / 2), tint, bevel, thick, mat["hover"])
            self.items.append({"w": x, "rect": r, "idx": idx, "mat": mat})
        if hov < len(self.scene.shapes):
            self.scene.hovered = hov
        if prs < len(self.scene.shapes):
            self.scene.pressed = prs
        self._push_needed = True

    def _push(self):
        dpr = self.window.devicePixelRatioF()
        q = self.params
        out = []
        for s in self.scene.shapes:
            g = 1.0 + 0.03 * s.press + 0.012 * s.hover
            out += [s.x * dpr, s.y * dpr, s.w / 2 * g * dpr, s.h / 2 * g * dpr, s.radius * g * dpr, s.bevel, s.thick, 0.0, *s.tint]
        arr = (ctypes.c_float * max(len(out), 1))(*out)
        prm = (ctypes.c_float * 12)(q["ior"], q["thick"], q["bevel"], q["disp"], q["blur"], q["spec"], q["absorb"], q["merge"] * dpr,
                                    q["shadow"], q.get("shadow_off", 26.0), q.get("lod", 0.7), dpr)
        _dll.lg_set(self._h, prm, 12, arr, len(self.scene.shapes))
        _dll.lg_light(self._h, self._light[0], self._light[1])
        self._push_needed = False

    def _push_content(self):
        """Oyna kontentini (matn, tugmalar) rasmga olib DLL'ga beramiz: shisha ustida bir oynada chiziladi. Faqat o'zgarganda (+ kamdan-kam zaxira)."""
        if not self._h:
            return
        self._content_idle += 1
        if not self._content_dirty and self._content_idle < 120:
            return
        w = self.window
        if not w.isVisible():
            return
        self._content_dirty = False
        self._content_idle = 0
        dpr = w.devicePixelRatioF()
        pw, ph = int(w.width() * dpr), int(w.height() * dpr)
        if pw <= 0 or ph <= 0:
            return
        img = QImage(pw, ph, QImage.Format_ARGB32_Premultiplied)
        img.fill(0)
        img.setDevicePixelRatio(dpr)
        veil = getattr(w, "_lg_veil", None)
        if veil is not None:
            veil.hide()   # bosish pardasi kontentga kirmaydi
        p = QPainter(img)
        w.render(p, QPoint(0, 0))
        p.end()
        if veil is not None:
            veil.show()
            veil.lower()
        self._quiet_until = time.perf_counter() + 0.08
        self._content_img = img   # DLL nusxa oladi, lekin rasm qo'ng'iroq davomida tirik bo'lsin
        addr = ctypes.addressof(ctypes.c_char.from_buffer(img.bits()))
        _dll.lg_set_content(self._h, ctypes.c_void_p(addr), pw, ph, img.bytesPerLine())

    def _tick(self):
        if not self._h:
            return
        now = time.perf_counter()
        dt, self._last = now - self._last, now
        if self._dirty or now - self._last_scan > 0.4:
            self._dirty = False
            self._last_scan = now
            self._sync()
        if self.popup:
            if self._reveal and self.info()[0] > 0:   # birinchi kadr chizildi: oyna ko'rsatiladi (oldin Desktop Duplication uni qora deb ko'rib orqa fonni buzardi)
                self.window.setWindowOpacity(0.02 if self.under else 1.0)
                self._reveal = False
            if not self.under and now - self._last_ink > 0.2:   # under rejimida matn rangini shaderning o'zi moslaydi
                self._last_ink = now
                luma = _dll.lg_luma(self._h)
                want = luma < 0.42 if self._ink_light is None else (luma < 0.42 if not self._ink_light else luma < 0.58)   # gisterezis: chegarada miltillamasin
                if want != self._ink_light:
                    self._ink_light = want
                    popup_ink(self.window, want)
        lt = fixed_light(self.window)   # yorug'lik manbai displayda qo'zg'almas: sichqonchaga emas, faqat oynaning displaydagi o'rniga bog'liq
        if abs(lt[0] - self._light[0]) + abs(lt[1] - self._light[1]) > 0.003:
            self._light = lt
            self._push_needed = True
        if self.scene.step(dt) or self._push_needed:
            self._push()

    _CONTENT_EVENTS = (QEvent.Enter, QEvent.Leave, QEvent.MouseButtonPress, QEvent.MouseButtonRelease, QEvent.KeyPress, QEvent.KeyRelease,
                       QEvent.FocusIn, QEvent.FocusOut, QEvent.StyleChange, QEvent.EnabledChange, QEvent.Resize, QEvent.Show,
                       QEvent.WindowTitleChange, QEvent.LayoutRequest, QEvent.HoverEnter, QEvent.HoverLeave)

    def _filter(self, obj, ev):
        t = ev.type()
        if self.under and t in self._CONTENT_EVENTS and (obj is self.window or self._mine(obj)):
            if t in (QEvent.MouseButtonPress, QEvent.MouseButtonRelease, QEvent.KeyPress, QEvent.KeyRelease) or time.perf_counter() >= self._quiet_until:
                self._content_dirty = True
        if t == QEvent.MouseMove and hasattr(ev, "globalPosition"):
            i = self._index_at(ev.globalPosition().toPoint())
            if i != self.scene.hovered:
                self.scene.hovered = i
                self._push_needed = True
        elif t == QEvent.MouseButtonPress and hasattr(ev, "globalPosition"):
            i = self._index_at(ev.globalPosition().toPoint())
            if i >= 0:
                self.scene.pressed = i
                self._push_needed = True
            self._dirty = True
        elif t == QEvent.MouseButtonRelease and self.scene.pressed >= 0:
            self.scene.pressed = -1
            self._push_needed = True
        elif t in _WATCH and self._mine(obj):
            self._dirty = True
        return False


# ───────────────────────── popup/dialog: sarlavhasiz shaffof oyna ─────────────────────────
HEADER = 34
POPUP_RADIUS = 16


def _rounded_region(w: int, h: int, r: int) -> QRegion:
    path = QPainterPath()
    path.addRoundedRect(QRectF(0, 0, w, h), r, r)
    return QRegion(path.toFillPolygon().toPolygon())


class _Chrome(QObject):
    """Windows sarlavhasi o'rniga o'zimizning: sarlavha matni, yopish tugmasi va siljitish."""

    def __init__(self, dlg: QWidget, veil: bool = True):
        super().__init__(dlg)
        self.dlg = dlg
        # Deyarli ko'rinmas parda: Windows alfasi 0 bo'lgan piksellarga bosishni o'tkazib yuboradi, shuning uchun oyna bosishni olishi uchun
        # butun yuzaga kichik noldan farqli alfa kerak (QDialog stylesheet fonini shaffof oynada chizmaydi, bola vidjet esa chizadi)
        self.veil = QWidget(dlg)
        self.veil.setVisible(veil)
        self.veil.setAttribute(Qt.WA_StyledBackground)
        self.veil.setStyleSheet("background: rgba(255, 255, 255, 28); border-radius: 16px;")   # radius shisha shakli bilan bir xil
        self.veil.lower()
        dlg._lg_veil = self.veil
        self.head = QWidget(dlg)
        self.title = QLabel(dlg.windowTitle(), self.head)
        self.title.setStyleSheet("background: transparent; font-weight: 600;")
        self.close_btn = QToolButton(self.head)
        self.close_btn.setText("✕")
        self.close_btn.setStyleSheet("QToolButton { background: transparent; border: none; font-size: 15px; color: #0f172a; } QToolButton:hover { color: #dc2626; }")
        self.close_btn.clicked.connect(dlg.reject if hasattr(dlg, "reject") else dlg.close)
        self.head.installEventFilter(self)
        self._off = None
        self._drag = QTimer(self)   # zaxira: sichqoncha hodisasi kelmay qolsa (tugma qo'yib yuborilganini ham shu bilinadi)
        self._drag.setTimerType(Qt.PreciseTimer)
        self._drag.setInterval(4)
        self._drag.timeout.connect(self._follow)
        dlg.installEventFilter(self)
        self.layout_head()

    def layout_head(self):
        w = self.dlg.width()
        self.veil.setGeometry(0, 0, w, self.dlg.height())
        self.dlg.setMask(_rounded_region(w, self.dlg.height(), POPUP_RADIUS))   # oyna shisha shakliga qirqiladi: to'rtburchak va burchakda bosish qolmaydi
        self.veil.lower()
        self.head.setGeometry(0, 0, w, HEADER)
        self.title.setGeometry(14, 0, max(w - 70, 10), HEADER)
        self.close_btn.setGeometry(w - HEADER - 6, 0, HEADER, HEADER)
        self.head.raise_()

    def _follow(self):
        if self._off is None:
            return
        if not (QGuiApplication.mouseButtons() & Qt.LeftButton):
            self._stop_drag()
            return
        pos = QCursor.pos() - self._off
        if pos != self.dlg.pos():
            self.dlg.move(pos)

    def _stop_drag(self):
        self._off = None
        self._drag.stop()
        QApplication.instance().removeEventFilter(self)
        self.dlg.installEventFilter(self)   # app darajasidagi filtr olib tashlanganda dialog filtri qayta ulanadi (bir xil obyekt)


    def eventFilter(self, obj, ev):
        t = ev.type()
        if self._off is not None:   # sudrash: har bir sichqoncha harakatida darhol siljitamiz (taymer aniqligiga bog'liq emas)
            if t == QEvent.MouseMove:
                self._follow()
                return False
            if t == QEvent.MouseButtonRelease:
                self._stop_drag()
                return False
        if obj is self.dlg and t in (QEvent.Resize, QEvent.Show):
            self.layout_head()
        elif (obj is self.head or obj is self.dlg) and t == QEvent.MouseButtonPress and ev.button() == Qt.LeftButton:
            # Tugma bosilgan paytda kursor ortidan siljitamiz (tizimning startSystemMove'i oyna faol bo'lmaganda ishlamaydi)
            self._off = QCursor.pos() - self.dlg.pos()
            self._drag.start()
            QApplication.instance().installEventFilter(self)
            return True
        return False


POPUP_QSS = """
QDialog { background: transparent; }
QLabel { color: #0f172a; background: transparent; }
QPushButton { background: transparent; border: none; color: #0f172a; font-weight: 600; }
"""


def popup_ink(dlg: QWidget, light: bool):
    """Popup yozuv va tugma rangi: orqa fon qorong'i bo'lsa och, yorug' bo'lsa to'q; fon ham shunga mos yengil tus (aniq o'qilishi uchun)."""
    ink = "#f1f5f9" if light else "#0f172a"
    tint = "rgba(8, 12, 24, 6)" if light else "rgba(255, 255, 255, 6)"   # deyarli ko'rinmas: faqat oyna sichqonchani ushlashi uchun (to'liq shaffof piksellar bosishni o'tkazib yuboradi)
    halo = QColor(8, 12, 24, 190) if light else QColor(255, 255, 255, 190)   # matn atrofidagi yengil soya: fon tusi o'rniga o'qilishni ta'minlaydi
    for w in dlg.findChildren(QLabel) + dlg.findChildren(QPushButton) + dlg.findChildren(QToolButton):
        eff = w.graphicsEffect()
        if not isinstance(eff, QGraphicsDropShadowEffect):
            eff = QGraphicsDropShadowEffect(w)
            eff.setOffset(0, 0)
            eff.setBlurRadius(7)
            w.setGraphicsEffect(eff)
        eff.setColor(halo)
    veil = getattr(dlg, "_lg_veil", None)   # shaffof oynada QDialog fonini chizmaydi: tusni parda (bola vidjet) chizadi; shu bilan oyna bosish va siljitishni ham ushlaydi
    if veil is not None:
        veil.setStyleSheet(f"background: {tint}; border-radius: {POPUP_RADIUS}px;")
    dlg.setStyleSheet(f"QDialog {{ background: transparent; }} QLabel {{ color: {ink}; background: transparent; }} "
                      f"QPushButton {{ color: {ink}; background: transparent; border: none; font-weight: 600; }} QToolButton {{ color: {ink}; }}")


def make_popup(dlg: QWidget, under: bool = False):
    """Dialogni sarlavhasiz qiladi (Windows ramkasi o'rniga o'zimizning sarlavha, yopish tugmasi va siljitish) va shisha uchun tayyorlaydi.
    under=False (standart): oyna shaffof (orqasi ko'rinadi), ustiga shisha qirra chiziladi; oyna ekran suratidan yashirilmaydi.
    under=True: eski usul, shisha oyna OSTIDA, Qt oynasi suratdan yashiriladi."""
    dlg.setWindowFlag(Qt.FramelessWindowHint, True)
    if not under:
        dlg.setAttribute(Qt.WA_TranslucentBackground)   # under rejimida kerak emas: Qt oynasi 2% shaffoflikda (per-pixel alfa Desktop Duplication'da qora chiqadi)
    if under:
        dlg.setWindowOpacity(0.0)   # ko'rsatilishdan oldin ko'rinmas: Desktop Duplication'ning birinchi kadri oynaning o'zini ushlab, orqa fon nusxasini buzmasin
        dlg.setStyleSheet(POPUP_QSS)
    else:
        dlg.setWindowOpacity(0.0)   # NativeController(popup=True) birinchi kadrdan keyin ko'rsatadi
    lay = dlg.layout()
    if lay:
        m = lay.contentsMargins()
        lay.setContentsMargins(m.left(), m.top() + HEADER, m.right(), m.bottom())
    _Chrome(dlg, veil=True)
    if not under:
        popup_ink(dlg, False)
    dlg.show()
    _dll.lg_kill_chrome(int(dlg.winId()))   # Qt oynasining ham Windows ramkasi/soyasi o'chiriladi
    if lay:
        dlg.adjustSize()
