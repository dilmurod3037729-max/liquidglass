"""liquidglass_qt: PySide6 (Qt Widgets) ilovasining ISTALGAN vidjetlarini suyuq shisha materialga aylantiradi, ilova kodiga tegmasdan.

    from liquidglass_qt import attach, Glass
    glass = attach(window)                                        # barcha QPushButton shisha (popup/dialoglar ham avtomatik)
    glass = attach(window, rules=[
        Glass(QPushButton),                                       # tugma: to'liq shisha, yozuvi ustida
        Glass(lambda w: w.objectName() == "Card", "panel", radius=10),   # konteyner/karta: to'liq shisha (ichidagi kontent suratdan ko'rinadi)
        Glass(QTableView, "table"),                               # jadval: shisha ramka, aylantirish jonli
        Glass(QLineEdit, "input"),
    ])
    glass.add(some_widget, "panel")                               # istalgan vidjetni qo'lda qo'shish
    glass.remove(some_widget)

Materiallar ("button" | "panel" | "table" | "input") yoki o'zingiznikini bering: Glass(sel, dict(bevel=0.5, thick=0.7, frame=True, hide=False)).

Qanday ishlaydi:
  - Shisha QOpenGLWidget qatlami SHAFFOF: faqat shisha va soya chiziladi, qolgan joyda ilovaning o'zi jonli (jadval aylanadi, matn yoziladi).
  - "button" kabi hide=True vidjetlarning asl ko'rinishi yashiriladi (bosiladigan qoladi), o'rnida shisha va yozuv nusxasi turadi.
  - "panel/table/input" (frame=True): vidjet o'z holida qoladi, ustiga shisha ramka (qirra sinishi, yorug'lik, soya) qo'yiladi.
  - Sinish manbai: oyna surati (faqat o'zgarganda olinadi). Popup/dialoglar o'z qatlamini oladi.
Shader: core/shaders/liquidglass.frag (veb va C++ bilan bir xil manba).
"""
from __future__ import annotations

import ctypes
import re
import sys
import time
from pathlib import Path

from shiboken6 import VoidPtr
from PySide6.QtCore import QEvent, QObject, QPoint, QRect, QRectF, QSize, Qt, QTimer
from PySide6.QtGui import QColor, QFont, QImage, QOpenGLContext, QPainter, QSurfaceFormat, QVector2D
from PySide6.QtOpenGL import QOpenGLShader, QOpenGLShaderProgram, QOpenGLTexture, QOpenGLVertexArrayObject
from PySide6.QtOpenGLWidgets import QOpenGLWidget
from PySide6.QtWidgets import (QAbstractSpinBox, QApplication, QDialog, QGraphicsOpacityEffect, QLabel, QLineEdit, QPlainTextEdit,
                               QPushButton, QTextEdit, QWidget)

SHADER = Path(__file__).resolve().parent.parent / "core" / "shaders" / "liquidglass.frag"
GL_TRIANGLES, GL_BLEND, GL_DEPTH_TEST = 0x0004, 0x0BE2, 0x0B71

DEFAULT_PARAMS = dict(ior=1.55, thick=40.0, bevel=26.0, disp=0.04, blur=0.35, spec=1.1, absorb=0.2, merge=1.0, shadow=0.45)

# Tayyor materiallar. bevel/thick: global qiymatga ko'paytiruvchi. frame: markazi shaffof (faqat qirra shisha).
# hide: asl vidjet ko'rinmas bo'lib, o'rnida shisha + yozuv nusxasi turadi. hover: kursor ostida biroz kattalashadi.
MATERIALS = {
    "button": dict(bevel=1.0, thick=1.0, frame=False, hide=True, hover=True, tint=True, radius=None),
    "panel": dict(bevel=-0.45, thick=0.3, frame=False, hide=False, hover=False, tint=False, radius=12.0),
    "table": dict(bevel=-0.5, thick=0.4, frame=False, hide=False, hover=False, tint=False, radius=8.0),
    "input": dict(bevel=0.5, thick=0.3, frame=True, hide=False, hover=False, tint=False, radius=None),
}

VERTEX = """#version 330 core
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}"""


class Glass:
    """Qoida: qaysi vidjetlar (selector) qanday material (material) bilan shisha bo'ladi.
    selector: vidjet sinfi (yoki sinflar tuple'i), objectName (str) yoki predikat (widget -> bool)."""

    def __init__(self, selector=QPushButton, material="button", radius: float | None = None, **overrides):
        base = MATERIALS[material] if isinstance(material, str) else material
        self.selector = selector
        self.mat = {**MATERIALS["button"], **base, **overrides}
        if radius is not None:
            self.mat["radius"] = radius

    def matches(self, w: QWidget) -> bool:
        s = self.selector
        if isinstance(s, str):
            return w.objectName() == s
        if isinstance(s, (type, tuple)):
            return isinstance(w, s)
        return bool(s(w))


# ───────────────────────── shisha sahnasi (qo'zg'almas shakllar + hover/bosish) ─────────────────────────
def fixed_light(w) -> tuple[float, float]:
    """Yagona yorug'lik manbai: displayning yuqori o'rtasida qo'zg'almas lampa. Oynaning displaydagi o'rniga qarab yo'nalish (-1..1) o'zgaradi;
    sichqonchaga bog'liq emas (qayta chizish kerak emas, jismoniy jihatdan to'g'riroq)."""
    scr = w.screen()
    if scr is None:
        return (0.0, -0.4)
    g = scr.geometry()
    c = w.mapToGlobal(w.rect().center())
    hw, hh = max(g.width() / 2, 1), max(g.height() / 2, 1)
    lx = max(-1.0, min(1.0, (g.center().x() - c.x()) / hw))
    ly = max(-1.0, min(1.0, (g.top() - c.y()) / (2 * hh)))
    return (lx, ly)


class Shape:
    __slots__ = ("x", "y", "w", "h", "radius", "tint", "bevel", "thick", "hoverable", "hover", "press")

    def __init__(self, x, y, w, h, radius, tint, bevel=1.0, thick=1.0, hoverable=True):
        self.x, self.y, self.w, self.h, self.radius, self.tint = x, y, w, h, radius, tint
        self.bevel, self.thick, self.hoverable = bevel, thick, hoverable   # thick < 0 = ramka rejimi
        self.hover = 0.0
        self.press = 0.0


class Scene:
    """core/src/scene.cpp ning kerakli qismi: qo'zg'almas shakllar, hover va bosish animatsiyasi, GPU ma'lumotini paketlash."""
    HOVER_RATE, PRESS_RATE, STEP = 0.18, 0.12, 1 / 60

    def __init__(self):
        self.shapes: list[Shape] = []
        self.hovered = -1
        self.pressed = -1
        self._acc = 0.0

    def clear(self):
        self.shapes.clear()
        self.hovered = self.pressed = -1

    def add(self, x, y, w, h, radius, tint=(0.0, 0.0, 0.0, 0.0), bevel=1.0, thick=1.0, hoverable=True) -> int:
        self.shapes.append(Shape(x, y, w, h, radius, tint, bevel, thick, hoverable))
        return len(self.shapes) - 1

    def step(self, dt: float) -> bool:
        """True: hali qimirlayapti (kadr kerak)."""
        self._acc += dt
        moving = False
        n = 0
        while self._acc >= self.STEP and n < 8:
            for i, s in enumerate(self.shapes):
                wh = 1.0 if (self.hovered == i and s.hoverable) else 0.0
                wp = 1.0 if (self.pressed == i and s.hoverable) else 0.0
                s.hover += (wh - s.hover) * self.HOVER_RATE
                s.press += (wp - s.press) * self.PRESS_RATE
                moving = moving or abs(wh - s.hover) > 0.002 or abs(wp - s.press) > 0.002
            self._acc -= self.STEP
            n += 1
        if n >= 8:
            self._acc = 0.0
        return moving or self.pressed >= 0

    def pack(self, dpr: float) -> bytes:
        """RGBA32F tekstura ma'lumoti (kenglik 4, balandlik = count): [rect][tail+material][rad,k,act,cho'zilish][tint]."""
        out = []
        for s in self.shapes:
            g = 1.0 + 0.03 * s.press + 0.012 * s.hover
            hw, hh = s.w / 2 * g * dpr, s.h / 2 * g * dpr
            reach = (0.55 * min(s.w, s.h) + 40.0) * dpr
            out += [s.x * dpr, s.y * dpr, hw, hh, s.x * dpr, s.y * dpr, s.bevel, s.thick,
                    s.radius * g * dpr, reach, 1.0, 0.0, *s.tint]
        if not out:
            return b""
        arr = (ctypes.c_float * len(out))(*out)   # o'zgaruvchida saqlanadi: vaqtinchalik massiv addressof'dan keyin o'chib ketardi
        return ctypes.string_at(ctypes.addressof(arr), len(out) * 4)


# ───────────────────────── GL qatlami ─────────────────────────
def _addr(buf) -> int:
    return ctypes.addressof(buf)


class GlassOverlay(QOpenGLWidget):
    """Oyna ustidagi SHAFFOF, sichqonchaga o'tkazuvchan QOpenGLWidget: sahna suratini sindirib, faqat shisha va soyani chizadi."""

    def __init__(self, parent: QWidget, scene: Scene, params: dict):
        super().__init__(parent)
        fmt = QSurfaceFormat(self.format())
        fmt.setAlphaBufferSize(8)
        self.setFormat(fmt)
        self.scene = scene
        self.params = params
        self.light = (0.0, 0.0)
        self._image: QImage | None = None
        self._dirty_source = False
        self._ready = False
        self.setAttribute(Qt.WA_TransparentForMouseEvents)
        self.setAttribute(Qt.WA_NoSystemBackground)
        self.setAttribute(Qt.WA_TranslucentBackground)
        self.setAttribute(Qt.WA_AlwaysStackOnTop)   # Qt faqat shunda qatlamni alfa bilan boshqa vidjetlar ustiga aralashtiradi
        self.texts: list[tuple[QRectF, str, QFont, QColor, int]] = []   # shisha tugma yozuvlari: qatlamning o'zida chiziladi (u hamma narsa ustida)
        self._clock = QTimer(self)
        self._clock.setInterval(16)
        self._clock.timeout.connect(self._tick)

    def set_source(self, img: QImage):
        self._image = img.convertToFormat(QImage.Format_RGBA8888)
        self._dirty_source = True
        self.update()

    def wake(self):
        if not self._clock.isActive():
            self._clock.start()
        self.update()

    def _tick(self):
        if not self.scene.step(0.016):
            self._clock.stop()
        self.update()

    # --- GL ---
    def initializeGL(self):
        src = SHADER.read_text(encoding="utf-8")
        if "#version 300 es" not in src:
            raise RuntimeError("liquidglass.frag: '#version 300 es' topilmadi")
        # Qt o'z qo'shimchasini oldinga qo'yadi, shuning uchun #version manba boshida bo'lishi shart (izohlarsiz)
        src = src[src.index("#version"):].replace("#version 300 es", "#version 330 core", 1)
        src = src.replace("precision highp float;", "", 1)   # Qt highp'ni bo'sh makros qiladi; 3.3 da precision shart emas
        self.prog = QOpenGLShaderProgram(self)
        ok = self.prog.addShaderFromSourceCode(QOpenGLShader.Vertex, VERTEX)
        ok = ok and self.prog.addShaderFromSourceCode(QOpenGLShader.Fragment, src)
        if not (ok and self.prog.link()):
            raise RuntimeError("liquidglass shader: " + self.prog.log())
        self._locs: dict[str, int] = {}
        self.vao = QOpenGLVertexArrayObject(self)
        self.vao.create()
        self.scene_tex: QOpenGLTexture | None = None
        self.shapes_tex: QOpenGLTexture | None = None
        self.shapes_count = -1
        self._shapes_data = b""
        self.tiles_tex = self._float_tex(1, 1, QOpenGLTexture.R32F, QOpenGLTexture.Red, bytes(4))
        self._ready = True

    def _float_tex(self, w, h, fmt, pix_fmt, data: bytes) -> QOpenGLTexture:
        t = QOpenGLTexture(QOpenGLTexture.Target2D)
        t.setSize(w, h)
        t.setFormat(fmt)
        t.setMipLevels(1)
        t.allocateStorage()
        t.setMinMagFilters(QOpenGLTexture.Nearest, QOpenGLTexture.Nearest)
        t.setWrapMode(QOpenGLTexture.ClampToEdge)
        buf = ctypes.create_string_buffer(data, len(data))
        t.setData(pix_fmt, QOpenGLTexture.Float32, VoidPtr(_addr(buf)))
        return t

    def _upload_scene(self):
        if self._image is None:
            return
        img = self._image.copy()
        if self.scene_tex is not None:
            self.scene_tex.destroy()
        t = QOpenGLTexture(QOpenGLTexture.Target2D)
        t.setSize(img.width(), img.height())
        t.setFormat(QOpenGLTexture.RGBA8_UNorm)
        t.setMipLevels(t.maximumMipLevels())
        t.allocateStorage()
        mv = img.bits()
        buf = ctypes.c_char.from_buffer(mv)
        t.setData(QOpenGLTexture.RGBA, QOpenGLTexture.UInt8, VoidPtr(ctypes.addressof(buf)))
        t.generateMipMaps()
        t.setMinMagFilters(QOpenGLTexture.LinearMipMapLinear, QOpenGLTexture.Linear)
        t.setWrapMode(QOpenGLTexture.ClampToEdge)
        self.scene_tex = t
        self._dirty_source = False

    def _upload_shapes(self, dpr):
        data = self.scene.pack(dpr)
        n = len(self.scene.shapes)
        if data == self._shapes_data and self.shapes_tex is not None:
            return   # o'zgarmagan: GPU'ga qayta yuklanmaydi
        self._shapes_data = data
        if n != self.shapes_count or self.shapes_tex is None:
            if self.shapes_tex is not None:
                self.shapes_tex.destroy()
            self.shapes_tex = self._float_tex(4, max(n, 1), QOpenGLTexture.RGBA32F, QOpenGLTexture.RGBA, data or bytes(64))
            self.shapes_count = n
        else:   # shu o'lchamdagi tekstura: faqat ma'lumot almashtiriladi
            buf = ctypes.create_string_buffer(data, len(data))
            self.shapes_tex.setData(QOpenGLTexture.RGBA, QOpenGLTexture.Float32, VoidPtr(_addr(buf)))

    def _u(self, name: str, value):
        """Uniform o'rnatish. PySide6 Python float'ni int setter'iga yuboradi (qiymat 0 qoladi), shuning uchun glUniform* to'g'ridan-to'g'ri."""
        loc = self._locs.get(name)
        if loc is None:
            loc = self._locs[name] = self.prog.uniformLocation(name.encode())
        if loc < 0:
            return
        f = self._f
        if isinstance(value, QVector2D):
            f.glUniform2f(loc, value.x(), value.y())
        elif isinstance(value, bool) or isinstance(value, int):
            f.glUniform1i(loc, int(value))
        else:
            f.glUniform1f(loc, float(value))

    def paintGL(self):
        if not self._ready:
            return
        f = QOpenGLContext.currentContext().functions()
        self._f = f
        dpr = self.devicePixelRatioF()
        fw, fh = int(self.width() * dpr), int(self.height() * dpr)
        if self._dirty_source:
            self._upload_scene()
        f.glViewport(0, 0, fw, fh)
        if self.scene_tex is None or not self.scene.shapes:
            f.glClearColor(0.0, 0.0, 0.0, 0.0)
            f.glClear(0x4000)   # GL_COLOR_BUFFER_BIT: butunlay shaffof
            return
        self._upload_shapes(dpr)
        f.glDisable(GL_BLEND)
        f.glDisable(GL_DEPTH_TEST)
        p, q = self.prog, self.params
        p.bind()
        self.vao.bind()
        self.scene_tex.bind(0)
        self.shapes_tex.bind(2)
        self.tiles_tex.bind(3)
        for name, val in (("uBg", 0), ("uShapes", 2), ("uCount", self.shapes_count), ("uTiles", 3), ("uGridW", 1), ("uGridH", 1)):
            self._u(name, int(val))
        self._u("uRes", QVector2D(fw, fh))
        self._u("uLight", QVector2D(*self.light))
        for name, val in (("uTransparent", 1.0), ("uTileSize", 0.0), ("uDpr", dpr), ("uMerge", q["merge"] * dpr), ("uFlip", 0.0),
                          ("uShadowK", q["shadow"]), ("uShadowOff", 26.0), ("uSpecMul", 1.0), ("uThickMul", 1.0), ("uExtraLod", 0.7),
                          ("uIOR", q["ior"]), ("uThick", q["thick"]), ("uBevel", q["bevel"]), ("uDisp", q["disp"]),
                          ("uBlur", q["blur"]), ("uSpec", q["spec"]), ("uAbs", q["absorb"])):
            self._u(name, float(val))
        f.glDrawArrays(GL_TRIANGLES, 0, 3)
        self.vao.release()
        p.release()
        if self.texts:
            qp = QPainter(self)
            qp.setRenderHint(QPainter.TextAntialiasing)
            for rect, text, font, color, align in self.texts:
                qp.setFont(font)
                qp.setPen(color)
                qp.drawText(rect, align, text)
            qp.end()


# ───────────────────────── boshqaruvchi ─────────────────────────
# Paint hodisasi O'ZGARISH belgisi EMAS: shisha qatlami yangilanganda Qt uning ostidagi hamma vidjetni qayta chizadi (cheksiz sikl bo'lardi)
_WATCH = (QEvent.Resize, QEvent.Move, QEvent.Show, QEvent.Hide, QEvent.LayoutRequest, QEvent.EnabledChange, QEvent.StyleChange,
          QEvent.FontChange, QEvent.PaletteChange, QEvent.DynamicPropertyChange)
# Foydalanuvchi harakati: ilova bunga dasturiy ravishda (kechikib) javob beradi, shuning uchun bir necha marta qayta suratga olinadi
_INPUT = (QEvent.MouseButtonPress, QEvent.MouseButtonRelease, QEvent.MouseButtonDblClick, QEvent.KeyPress, QEvent.KeyRelease,
          QEvent.Wheel, QEvent.FocusIn, QEvent.FocusOut, QEvent.InputMethod, QEvent.Drop)


def _luma(c: QColor) -> float:
    return (0.299 * c.red() + 0.587 * c.green() + 0.114 * c.blue()) / 255.0


class GlassController(QObject):
    def __init__(self, window: QWidget, rules: list[Glass] | None = None, selector=QPushButton, params: dict | None = None,
                 radius: float | None = None, poll_ms: int = 80, min_size=(28, 22), idle_ms: int = 2500):
        super().__init__(window)
        self.window = window
        self.rules = list(rules) if rules else [Glass(selector, "button", radius)]
        self.params = {**DEFAULT_PARAMS, **(params or {})}
        self.min_size = min_size
        self.idle_ms = idle_ms   # o'zgarish hodisasi bo'lmasa ham shuncha vaqtda bir marta yangilash (0 = o'chiq)
        self._app_radius = self._find_app_radius()
        self.scene = Scene()
        self.overlay = GlassOverlay(window, self.scene, self.params)
        self.items: list[dict] = []
        self.backdrop = False   # popup: oyna shaffof, sinish manbai oyna ORQASIDAGI jonli ekran
        self.titlebar = False   # popup: sarlavha satri shisha qatlamning o'zida chiziladi
        self.header = 0
        self._back_img: QImage | None = None
        self._extra: list[tuple[QWidget, Glass]] = []   # add() bilan qo'lda qo'shilganlar
        self._tints: dict[int, tuple] = {}
        self._sig = None
        self._dirty = True
        self._own: set[int] = {id(self.overlay)}   # shisha qatlami, yozuvlar va shisha tugmalar: ularning chizilishi "o'zgarish" emas
        self._buf: QImage | None = None
        self._last_refresh = 0.0
        self._min_gap = max(poll_ms, 40) / 1000.0
        self.overlay.setGeometry(window.rect())
        self.overlay.show()
        window.installEventFilter(self)
        QApplication.instance().installEventFilter(self)
        self._timer = QTimer(self)
        self._timer.setInterval(30)
        self._timer.timeout.connect(self._poll)
        self._timer.start()
        self._back_timer = QTimer(self)
        self._back_timer.setInterval(40)
        self._back_timer.timeout.connect(self._back_poll)
        self._burst()   # yaratilgandan keyin: vidjetlar (ayniqsa popup) bir oz keyin tayyor bo'ladi

    # --- ommaviy API ---
    def add(self, widget: QWidget, material="panel", radius: float | None = None, **overrides):
        """Istalgan vidjetni shisha qilish (qoida selektoriga qaramay)."""
        self._extra.append((widget, Glass(lambda w, t=widget: w is t, material, radius, **overrides)))
        self._dirty = True

    def remove(self, widget: QWidget):
        self._extra = [(w, r) for (w, r) in self._extra if w is not widget]
        if isinstance(widget.graphicsEffect(), QGraphicsOpacityEffect):
            widget.setGraphicsEffect(None)
        self._dirty = True

    def set_params(self, **kw):
        self.params.update(kw)
        self.overlay.wake()

    @staticmethod
    def _find_app_radius() -> float:
        m = re.search(r"QPushButton\s*\{[^}]*?border-radius:\s*(\d+)px", QApplication.instance().styleSheet() or "")
        return float(m.group(1)) if m else 8.0

    # --- topish ---
    def _collect(self) -> list[tuple[QWidget, dict]]:
        out, seen = [], set()
        pairs = list(self._extra)   # qo'lda qo'shilganlar (add) avval
        everyone = self.window.findChildren(QWidget)
        for rule in self.rules:
            pairs += [(w, rule) for w in everyone]
        for w, rule in pairs:
            if id(w) in seen or w is self.overlay or not rule.matches(w):
                continue
            if not w.isVisible() or w.window() is not self.window:   # boshqa oynaning (popup) vidjeti emas
                continue
            if rule.mat["hide"] and not w.isEnabled():
                continue
            if w.width() < self.min_size[0] or w.height() < self.min_size[1]:
                continue
            seen.add(id(w))
            out.append((w, rule.mat))
        return out

    def _rect(self, b: QWidget) -> QRect:
        return QRect(b.mapTo(self.window, QPoint(0, 0)), b.size())

    def _tint_of(self, b: QWidget) -> tuple:
        """Asl tugmaning fon rangi shisha rangiga aylanadi (ko'k "Hisoblash" ko'k shisha). Neytral/och = tiniq."""
        key = id(b)
        if key in self._tints:
            return self._tints[key]
        img = b.grab().toImage()
        dpr = img.devicePixelRatio() or 1.0
        c = QColor(img.pixel(int(7 * dpr), int(img.height() / 2)))
        mx, mn = max(c.red(), c.green(), c.blue()), min(c.red(), c.green(), c.blue())
        sat = (mx - mn) / mx if mx else 0.0
        tint = (c.redF(), c.greenF(), c.blueF(), 0.6) if (sat > 0.35 or _luma(c) < 0.35) else (0.0, 0.0, 0.0, 0.0)
        self._tints[key] = tint
        return tint

    # --- yangilash ---
    def _mark(self):
        self._dirty = True

    def _burst(self):
        """Kirish hodisasidan keyin: darhol va ilova natijani yangilashi uchun yana bir necha marta."""
        self._dirty = True
        for ms in (60, 450, 1300):
            QTimer.singleShot(ms, self._mark)

    def _poll(self):
        """Bo'sh turganda hech narsa qilmaydi: faqat oyna o'zgargan bo'lsa (bayroq) va oxirgi yangilashdan keyin yetarli vaqt o'tgan bo'lsa."""
        now = time.perf_counter()
        if not self._dirty and self.idle_ms > 0:
            fw = QApplication.focusWidget()
            text_focus = isinstance(fw, (QLineEdit, QAbstractSpinBox, QTextEdit, QPlainTextEdit)) and self.window.isAncestorOf(fw)
            gap = 0.5 if text_focus else self.idle_ms / 1000.0   # matn kursori miltillaydi: tezroq
            if now - self._last_refresh >= gap:
                self._dirty = True
        if self._dirty and now - self._last_refresh >= self._min_gap:
            self.refresh()

    def _snapshot(self) -> QImage:
        """Oyna surati (tugmalar yashirin, shisha qatlami va yozuvlarsiz). Bufer qayta ishlatiladi."""
        w = self.window
        dpr = w.devicePixelRatioF()
        size = QSize(int(w.width() * dpr), int(w.height() * dpr))
        if self._buf is None or self._buf.size() != size:
            self._buf = QImage(size, QImage.Format_RGBA8888_Premultiplied)
        buf = self._buf
        buf.setDevicePixelRatio(dpr)
        if self.backdrop:
            self._paint_backdrop(buf)
        else:
            buf.fill(w.palette().window().color())
        # Butun oyna (stylesheet foni ham) chiziladi; shisha qatlami va yozuvlar shu paytda yashiriladi. Paint hodisalari
        # o'zgarish belgisi emas, shuning uchun yashirish/ko'rsatish yangi yangilanishni chaqirmaydi.
        self.overlay.hide()
        painter = QPainter(buf)
        w.render(painter, QPoint(0, 0))
        painter.end()
        self.overlay.show()
        return buf

    def _grab_behind(self) -> QImage | None:
        w = self.window
        exclude_from_capture(w)
        dpr = w.devicePixelRatioF()
        x, y = _client_origin(w)
        return grab_screen(x, y, int(w.width() * dpr), int(w.height() * dpr))

    def _back_poll(self):
        """Oyna ORQASIDAGI ekran o'zgarsa (video, boshqa oyna, siljitish) sinish manbai yangilanadi."""
        if not self.window.isVisible():
            return
        img = self._grab_behind()
        if img is not None and img != self._back_img:
            self._back_img = img
            self._dirty = True

    def _paint_backdrop(self, buf: QImage):
        w = self.window
        if self._back_img is None:
            self._back_img = self._grab_behind()
        p = QPainter(buf)
        if self._back_img is not None:
            p.drawImage(QRect(0, 0, w.width(), w.height()), self._back_img)
        p.end()

    def refresh(self):
        w = self.window
        if not w.isVisible():
            return
        found = self._collect()
        sig = tuple((id(x), self._rect(x).getRect(), x.text() if hasattr(x, "text") and mat["hide"] else "") for x, mat in found)
        rebuilt = sig != self._sig
        if rebuilt:
            self._rebuild(found)
            self._sig = sig
        self._dirty = False
        self._last_refresh = time.perf_counter()
        img = self._snapshot()
        if rebuilt:   # raise_/setGeometry sahifani qayta chizdiradi: faqat kerak bo'lganda
            self.overlay.setGeometry(w.rect())
            self.overlay.raise_()
        elif self.overlay.geometry() != w.rect():
            self.overlay.setGeometry(w.rect())
        self._recolor_texts(img)
        self.overlay.set_source(img)
        self.overlay.wake()

    def _rebuild(self, found: list[tuple[QWidget, dict]]):
        keep = {id(x) for x, _ in found}
        for it in self.items:   # endi shisha bo'lmaganlarni asl holiga qaytaramiz
            if id(it["w"]) not in keep and isinstance(it["w"].graphicsEffect(), QGraphicsOpacityEffect):
                it["w"].setGraphicsEffect(None)
        self.items.clear()
        self.scene.clear()
        self._own = {id(self.overlay)}
        for x, mat in found:
            r = self._rect(x)
            tint = self._tint_of(x) if (mat["tint"] and mat["hide"]) else (0.0, 0.0, 0.0, 0.0)   # rang asl ko'rinishda olinadi, keyin yashiramiz
            radius = mat["radius"] if mat["radius"] is not None else self._app_radius
            thick = -abs(mat["thick"]) if mat["frame"] else abs(mat["thick"])
            idx = self.scene.add(r.x() + r.width() / 2, r.y() + r.height() / 2, r.width(), r.height(),
                                 min(radius, r.height() / 2, r.width() / 2), tint, mat["bevel"], thick, mat["hover"])
            item = {"w": x, "rect": r, "tint": tint, "idx": idx, "mat": mat, "text": None}
            if mat["hide"]:
                if not isinstance(x.graphicsEffect(), QGraphicsOpacityEffect):
                    eff = QGraphicsOpacityEffect(x)
                    eff.setOpacity(0.0)
                    x.setGraphicsEffect(eff)
                self._own.add(id(x))
                if hasattr(x, "text"):
                    item["text"] = (x.text(), x.font())
            self.items.append(item)

    def _recolor_texts(self, img: QImage):
        dpr = img.devicePixelRatio() or 1.0
        texts = []
        for it in self.items:
            if it["text"] is None:
                continue
            r, t = it["rect"], it["tint"]
            if t[3] > 0.35:
                dark = (0.299 * t[0] + 0.587 * t[1] + 0.114 * t[2]) > 0.6
            else:
                sx = int(min(max(r.x() + r.width() / 2, 0), self.window.width() - 1) * dpr)
                sy = int(min(max(r.y() + 2, 0), self.window.height() - 1) * dpr)
                dark = _luma(QColor(img.pixel(sx, sy))) > 0.55
            texts.append((QRectF(r), it["text"][0], it["text"][1], QColor("#0f172a" if dark else "#ffffff"), int(Qt.AlignCenter)))
        if self.titlebar:
            w = self.window
            dark = _luma(QColor(img.pixel(int(w.width() * dpr * 0.5), int(self.header * dpr * 0.5)))) > 0.55
            col = QColor("#0f172a" if dark else "#ffffff")
            f = QFont(w.font())
            f.setBold(True)
            texts.append((QRectF(14, 0, w.width() - 60, self.header), w.windowTitle(), f, col, int(Qt.AlignVCenter | Qt.AlignLeft)))
            texts.append((QRectF(w.width() - self.header - 6, 0, self.header, self.header), "\u2715", w.font(), col, int(Qt.AlignCenter)))
        self.overlay.texts = texts

    # --- hodisalar ---
    def _index_at(self, global_pos) -> int:
        p = self.window.mapFromGlobal(global_pos)
        for it in reversed(self.items):   # ustma-ust bo'lsa yuqoridagisi
            if it["mat"]["hover"] and it["rect"].contains(p):
                return it["idx"]
        return -1

    def eventFilter(self, obj, ev):
        try:
            return self._filter(obj, ev)
        except RuntimeError:   # dastur yopilayotganda oyna o'chirilgan bo'lishi mumkin
            return False

    def _mine(self, obj) -> bool:
        """Vidjet shu oynaga tegishlimi (boshqa oyna, masalan popup, bu yerga kirmaydi)."""
        return isinstance(obj, QWidget) and obj.window() is self.window and obj is not self.window

    def _filter(self, obj, ev):
        t = ev.type()
        if self.titlebar and t == QEvent.MouseButtonPress and hasattr(ev, "globalPosition") and (obj is self.window or self._mine(obj)):
            p = self.window.mapFromGlobal(ev.globalPosition().toPoint())
            if p.y() < self.header:
                if p.x() > self.window.width() - self.header - 6:
                    self.window.close()
                elif self.window.windowHandle():
                    self.window.windowHandle().startSystemMove()
                return True
        if obj is self.window and t in (QEvent.Resize, QEvent.Show):
            self.overlay.setGeometry(self.window.rect())
            self._dirty = True
        elif t == QEvent.MouseMove and hasattr(ev, "globalPosition"):
            i = self._index_at(ev.globalPosition().toPoint())
            if i != self.scene.hovered:
                self.scene.hovered = i
                self.overlay.wake()
            p = self.window.mapFromGlobal(ev.globalPosition().toPoint())
            self.overlay.light = fixed_light(self.window)
        elif t == QEvent.MouseButtonPress and hasattr(ev, "globalPosition"):
            i = self._index_at(ev.globalPosition().toPoint())
            if i >= 0:
                self.scene.pressed = i
                self.overlay.wake()
            if self._mine(obj):
                self._burst()
        elif t in _WATCH and self._mine(obj) and id(obj) not in self._own and obj is not self.window:
            self._dirty = True   # ilova tuzilmasi o'zgardi: surat qayta olinadi
        elif t in _INPUT and self._mine(obj) and obj is not self.overlay:
            if t == QEvent.MouseButtonRelease and self.scene.pressed >= 0:
                self.scene.pressed = -1
                self.overlay.wake()
            self._burst()
        return False


# ───────────────────────── popup/dialoglar ─────────────────────────
def _client_origin(w: QWidget) -> tuple[int, int]:
    """Oyna ichki maydonining ekrandagi chap-yuqori nuqtasi (haqiqiy piksel, ko'p monitorda ham to'g'ri)."""
    pt = (ctypes.c_long * 2)(0, 0)
    ctypes.windll.user32.ClientToScreen(ctypes.c_void_p(int(w.winId())), ctypes.byref(pt))
    return pt[0], pt[1]


def exclude_from_capture(win: QWidget) -> bool:
    """Oynamiz ekran suratiga (BitBlt/Graphics Capture) tushmaydi: orqa fon olinganda o'zimiz ichiga kirib qolmaymiz (WDA_EXCLUDEFROMCAPTURE)."""
    if sys.platform != "win32":
        return False
    hwnd = ctypes.c_void_p(int(win.winId()))
    cur = ctypes.c_uint32(0)
    if ctypes.windll.user32.GetWindowDisplayAffinity(hwnd, ctypes.byref(cur)) and cur.value == 0x11:
        return True
    return bool(ctypes.windll.user32.SetWindowDisplayAffinity(hwnd, 0x11))   # Qt oynani qayta yaratsa bayroq yo'qoladi: har safar tekshiramiz


def grab_screen(x: int, y: int, w: int, h: int) -> QImage | None:
    """Ish stoli (layered oynalar va ikkinchi monitor ham) jonli surati: GDI BitBlt + CAPTUREBLT."""
    if sys.platform != "win32" or w <= 0 or h <= 0:
        return None
    u, g = ctypes.windll.user32, ctypes.windll.gdi32
    u.GetDC.restype = ctypes.c_void_p
    g.CreateCompatibleDC.restype = ctypes.c_void_p
    g.CreateDIBSection.restype = ctypes.c_void_p
    g.SelectObject.restype = ctypes.c_void_p
    hdc = u.GetDC(None)
    mem = g.CreateCompatibleDC(ctypes.c_void_p(hdc))
    bmi = (ctypes.c_uint32 * 11)(40, w, (-h) & 0xFFFFFFFF, 1 | (32 << 16), 0, 0, 0, 0, 0, 0, 0)   # BITMAPINFOHEADER, yuqoridan pastga
    bits = ctypes.c_void_p()
    hbm = g.CreateDIBSection(ctypes.c_void_p(hdc), ctypes.byref(bmi), 0, ctypes.byref(bits), None, 0)
    old = g.SelectObject(ctypes.c_void_p(mem), ctypes.c_void_p(hbm))
    g.BitBlt(ctypes.c_void_p(mem), 0, 0, w, h, ctypes.c_void_p(hdc), x, y, 0x00CC0020 | 0x40000000)   # SRCCOPY | CAPTUREBLT
    img = QImage(ctypes.string_at(bits, w * h * 4), w, h, w * 4, QImage.Format_RGB32).copy()
    g.SelectObject(ctypes.c_void_p(mem), ctypes.c_void_p(old))
    g.DeleteObject(ctypes.c_void_p(hbm))
    g.DeleteDC(ctypes.c_void_p(mem))
    u.ReleaseDC(None, ctypes.c_void_p(hdc))
    return img


def make_translucent(win: QWidget, tint: str = "rgba(255,255,255,90)"):
    """Popup oynasini shaffof qiladi (orqasi ko'rinadi); shisha qatlami shu orqa fonni sindiradi."""
    win.setAttribute(Qt.WA_TranslucentBackground)
    win.setStyleSheet(f"QDialog {{ background: {tint}; }}")


class _PopupWatcher(QObject):
    """Ilovadagi har bir QDialog/QMessageBox/popup ochilganda unga ham shisha qatlami ulaydi (o'zining oynasi, o'zining qatlami)."""

    def __init__(self, app: QApplication, rules, params, kwargs, backdrop: bool, native: bool = False):
        super().__init__(app)
        self.rules, self.params, self.kwargs, self.backdrop, self.native = rules, params, kwargs, backdrop, native
        self.controllers: dict[int, GlassController] = {}
        app.installEventFilter(self)

    def eventFilter(self, obj, ev):
        try:
            if ev.type() == QEvent.Show and isinstance(obj, QDialog) and obj.isWindow() and id(obj) not in self.controllers:
                key = id(obj)
                self.controllers[key] = None   # oldindan band qilamiz: konstruktor ichida qayta kiruvchi Show hodisasi ikkinchi qatlam yaratmasin
                if self.native:
                    from liquidglass_win import NativeController, make_popup
                    make_popup(obj, under=True)
                    self.controllers[key] = ctl = NativeController(obj, rules=self.rules, params=self.params, under=True, popup=True, **self.kwargs)
                    ctl.add(obj, dict(MATERIALS["panel"], bevel=0.21, thick=0.5, frame=False), radius=16)   # oynaning o'zi: shaffof shisha, faqat sinadigan qirra
                    obj.destroyed.connect(lambda *_a, k=key: self.controllers.pop(k, None))
                    return False
                if self.backdrop and sys.platform == "win32":
                    make_translucent(obj)
                    obj.setWindowFlag(Qt.FramelessWindowHint, True)   # Windows sarlavhasi o'rniga shisha sarlavha
                    lay = obj.layout()
                    if lay:
                        m = lay.contentsMargins()
                        lay.setContentsMargins(m.left(), m.top() + 32, m.right(), m.bottom())
                    obj.show()
                    exclude_from_capture(obj)
                self.controllers[key] = ctl = GlassController(obj, rules=self.rules, params=self.params, **self.kwargs)
                if self.backdrop and sys.platform == "win32":
                    ctl.backdrop, ctl.titlebar, ctl.header = True, True, 32
                    ctl._back_timer.start()
                    ctl.add(obj, "panel", radius=10)   # oynaning o'zi ham shisha
                obj.destroyed.connect(lambda *_a, k=key: self.controllers.pop(k, None))
        except RuntimeError:
            pass
        return False


def attach(window: QWidget, rules: list[Glass] | None = None, params: dict | None = None, popups: bool = True, popup_backdrop: bool = True, **kwargs) -> GlassController:
    """Oynadagi vidjetlarni shisha qiladi. rules: [Glass(selector, material, radius)...] (standart: barcha QPushButton).
    popups=True: keyin ochiladigan dialog/popuplar ham avtomatik shisha oladi; popup_backdrop=True: ularning oynasi shaffof va shisha bo'ladi (orqasidagi ekranni sindiradi). kwargs: poll_ms, idle_ms, min_size."""
    backend = kwargs.pop("backend", "auto")   # "auto": Windows'da native (GPU), aks holda OpenGL qatlam; "gl": OpenGL majburan
    native = False
    if backend != "gl":
        try:
            from liquidglass_win import NativeController, available
            native = available()
        except ImportError:
            native = False
    ctl = NativeController(window, rules=rules, params=params, **kwargs) if native else GlassController(window, rules=rules, params=params, **kwargs)
    app = QApplication.instance()
    if popups and not getattr(app, "_lg_popups", None):
        app._lg_popups = _PopupWatcher(app, ctl.rules, ctl.params, kwargs, popup_backdrop, native)
    return ctl
