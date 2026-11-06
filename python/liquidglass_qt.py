"""liquidglass_qt: PySide6 (Qt Widgets) ilovadagi HAQIQIY tugmalarni suyuq shisha materialga almashtiradi, ilova kodiga tegmasdan.

    from liquidglass_qt import attach
    glass = attach(main_window)                       # barcha QPushButton shisha bo'ladi
    glass = attach(main_window, params={"bevel": 14}) # shisha sozlamalari (web/README.md dagi nomlar)

Qanday ishlaydi (Electron adapteri bilan bir xil g'oya):
  1. tugmalar topiladi, asl ko'rinishi yashiriladi (opacity 0, lekin bosiladigan qoladi);
  2. oyna surati olinadi (tugmalarsiz) va shisha qatlami (QOpenGLWidget, sichqonchaga shaffof) shuni sindiradi;
  3. yozuvlar ustiga QLabel nusxa sifatida qo'yiladi; rangi shisha ostidagi fon yorug'ligiga moslashadi;
  4. oyna o'zgarsa (bo'lim almashdi, matn yozildi) surat va shisha o'zi yangilanadi.
Shader: core/shaders/liquidglass.frag (veb va C++ bilan bir xil manba).
"""
from __future__ import annotations

import ctypes
import re
from pathlib import Path

from shiboken6 import VoidPtr
from PySide6.QtCore import QEvent, QObject, QPoint, QRect, Qt, QTimer
from PySide6.QtGui import QColor, QImage, QOpenGLContext, QVector2D
from PySide6.QtOpenGL import QOpenGLShader, QOpenGLShaderProgram, QOpenGLTexture, QOpenGLVertexArrayObject
from PySide6.QtOpenGLWidgets import QOpenGLWidget
from PySide6.QtWidgets import QApplication, QGraphicsOpacityEffect, QLabel, QPushButton, QWidget

SHADER = Path(__file__).resolve().parent.parent / "core" / "shaders" / "liquidglass.frag"
GL_TRIANGLES, GL_BLEND, GL_DEPTH_TEST = 0x0004, 0x0BE2, 0x0B71

DEFAULT_PARAMS = dict(ior=1.55, thick=40.0, bevel=26.0, disp=0.04, blur=0.35, spec=1.1, absorb=0.2, merge=1.0)
VERTEX = """#version 330 core
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}"""


# ───────────────────────── shisha sahnasi (qo'zg'almas shakllar + hover/bosish) ─────────────────────────
class Shape:
    __slots__ = ("x", "y", "w", "h", "radius", "tint", "hover", "press")

    def __init__(self, x, y, w, h, radius, tint):
        self.x, self.y, self.w, self.h, self.radius, self.tint = x, y, w, h, radius, tint
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

    def add(self, x, y, w, h, radius, tint=(0.0, 0.0, 0.0, 0.0)) -> int:
        self.shapes.append(Shape(x, y, w, h, radius, tint))
        return len(self.shapes) - 1

    def step(self, dt: float) -> bool:
        """True: hali qimirlayapti (kadr kerak)."""
        self._acc += dt
        moving = False
        n = 0
        while self._acc >= self.STEP and n < 8:
            for i, s in enumerate(self.shapes):
                wh = 1.0 if self.hovered == i else 0.0
                wp = 1.0 if self.pressed == i else 0.0
                s.hover += (wh - s.hover) * self.HOVER_RATE
                s.press += (wp - s.press) * self.PRESS_RATE
                moving = moving or abs(wh - s.hover) > 0.002 or abs(wp - s.press) > 0.002
            self._acc -= self.STEP
            n += 1
        if n >= 8:
            self._acc = 0.0
        return moving or self.pressed >= 0

    def pack(self, dpr: float) -> bytes:
        """RGBA32F tekstura ma'lumoti (kenglik 4, balandlik = count): [rect][tail][rad,k,act,cho'zilish][tint]."""
        out = []
        for s in self.shapes:
            g = 1.0 + 0.03 * s.press + 0.012 * s.hover
            hw, hh = s.w / 2 * g * dpr, s.h / 2 * g * dpr
            reach = (0.55 * min(s.w, s.h) + 40.0) * dpr
            out += [s.x * dpr, s.y * dpr, hw, hh, s.x * dpr, s.y * dpr, hw, hh, s.radius * g * dpr, reach, 1.0, 0.0, *s.tint]
        if not out:
            return b""
        arr = (ctypes.c_float * len(out))(*out)   # o'zgaruvchida saqlanadi: vaqtinchalik massiv addressof'dan keyin o'chib ketardi
        return ctypes.string_at(ctypes.addressof(arr), len(out) * 4)


# ───────────────────────── GL qatlami ─────────────────────────
def _addr(buf) -> int:
    return ctypes.addressof(buf)


class GlassOverlay(QOpenGLWidget):
    """Oyna ustidagi shaffof-sichqoncha QOpenGLWidget: sahna suratini sindiradi, shakllar ustida shisha chizadi."""

    def __init__(self, parent: QWidget, scene: Scene, params: dict):
        super().__init__(parent)
        self.scene = scene
        self.params = params
        self.light = (0.0, 0.0)
        self._image: QImage | None = None
        self._dirty_source = False
        self._ready = False
        self.setAttribute(Qt.WA_TransparentForMouseEvents)
        self.setAttribute(Qt.WA_NoSystemBackground)
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
        if self.shapes_tex is not None:
            self.shapes_tex.destroy()
            self.shapes_tex = None
        if n:
            self.shapes_tex = self._float_tex(4, n, QOpenGLTexture.RGBA32F, QOpenGLTexture.RGBA, data)
        else:
            self.shapes_tex = self._float_tex(4, 1, QOpenGLTexture.RGBA32F, QOpenGLTexture.RGBA, bytes(64))
        self.shapes_count = n

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
        if self.scene_tex is None:
            return
        self._upload_shapes(dpr)
        f.glViewport(0, 0, fw, fh)
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
        for name, val in (("uTileSize", 0.0), ("uDpr", dpr), ("uMerge", q["merge"] * dpr), ("uFlip", 0.0), ("uShadowK", 0.55),
                          ("uShadowOff", 26.0), ("uSpecMul", 1.0), ("uThickMul", 1.0), ("uExtraLod", 0.7),
                          ("uIOR", q["ior"]), ("uThick", q["thick"]), ("uBevel", q["bevel"]), ("uDisp", q["disp"]),
                          ("uBlur", q["blur"]), ("uSpec", q["spec"]), ("uAbs", q["absorb"])):
            self._u(name, float(val))
        f.glDrawArrays(GL_TRIANGLES, 0, 3)
        self.vao.release()
        p.release()


# ───────────────────────── boshqaruvchi ─────────────────────────
def _luma(c: QColor) -> float:
    return (0.299 * c.red() + 0.587 * c.green() + 0.114 * c.blue()) / 255.0


class GlassController(QObject):
    def __init__(self, window: QWidget, selector=QPushButton, params: dict | None = None, radius: float | None = None,
                 poll_ms: int = 250, min_size=(28, 22)):
        super().__init__(window)
        self.window = window
        self.selector = selector
        self.params = {**DEFAULT_PARAMS, **(params or {})}
        self.min_size = min_size
        self.radius = radius if radius is not None else self._app_radius()
        self.scene = Scene()
        self.overlay = GlassOverlay(window, self.scene, self.params)
        self.items: list[dict] = []
        self.labels: list[QLabel] = []
        self._tints: dict[int, tuple] = {}
        self._sig = None
        self._last: QImage | None = None
        self.overlay.setGeometry(window.rect())
        self.overlay.show()
        window.installEventFilter(self)
        QApplication.instance().installEventFilter(self)
        self._timer = QTimer(self)
        self._timer.setInterval(poll_ms)
        self._timer.timeout.connect(self.refresh)
        self._timer.start()
        QTimer.singleShot(0, self.refresh)

    @staticmethod
    def _app_radius() -> float:
        m = re.search(r"QPushButton\s*\{[^}]*?border-radius:\s*(\d+)px", QApplication.instance().styleSheet() or "")
        return float(m.group(1)) if m else 8.0

    # --- topish ---
    def _collect(self) -> list[QPushButton]:
        out = []
        for b in self.window.findChildren(self.selector):
            if not b.isVisible() or not b.isEnabled():
                continue
            if b.width() < self.min_size[0] or b.height() < self.min_size[1]:
                continue
            out.append(b)
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
    def refresh(self):
        w = self.window
        if not w.isVisible():
            return
        buttons = self._collect()
        sig = tuple((id(b), self._rect(b).getRect(), b.text()) for b in buttons)
        rebuilt = sig != self._sig
        if rebuilt:
            self._rebuild(buttons)
            self._sig = sig
        # sahifa surati: shisha qatlami va yozuvlar yashirin holda
        self.overlay.hide()
        for lab in self.labels:
            lab.hide()
        img = w.grab().toImage()
        self.overlay.show()
        for lab in self.labels:
            lab.show()
        self.overlay.setGeometry(w.rect())
        self.overlay.raise_()
        for lab in self.labels:
            lab.raise_()
        if rebuilt or self._last is None or img != self._last:
            self._last = img
            self._recolor_labels(img)
            self.overlay.set_source(img)
            self.overlay.wake()

    def _rebuild(self, buttons: list[QPushButton]):
        for it in self.items:   # eskilarni tiklaymiz
            if it["btn"] not in buttons:
                it["btn"].setGraphicsEffect(None)
        for lab in self.labels:
            lab.deleteLater()
        self.labels.clear()
        self.items.clear()
        self.scene.clear()
        for b in buttons:
            tint = self._tint_of(b)      # asl ko'rinishda rang olinadi, keyin yashiramiz
            if not isinstance(b.graphicsEffect(), QGraphicsOpacityEffect):
                eff = QGraphicsOpacityEffect(b)
                eff.setOpacity(0.0)
                b.setGraphicsEffect(eff)
            r = self._rect(b)
            idx = self.scene.add(r.x() + r.width() / 2, r.y() + r.height() / 2, r.width(), r.height(),
                                 min(self.radius, r.height() / 2), tint)
            lab = QLabel(b.text(), self.window)
            lab.setFont(b.font())
            lab.setAlignment(Qt.AlignCenter)
            lab.setGeometry(r)
            lab.setAttribute(Qt.WA_TransparentForMouseEvents)
            lab.setStyleSheet("background: transparent;")
            lab.show()
            self.labels.append(lab)
            self.items.append({"btn": b, "rect": r, "tint": tint, "idx": idx})

    def _recolor_labels(self, img: QImage):
        dpr = img.devicePixelRatio() or 1.0
        for it, lab in zip(self.items, self.labels):
            r, t = it["rect"], it["tint"]
            if t[3] > 0.35:
                dark = (0.299 * t[0] + 0.587 * t[1] + 0.114 * t[2]) > 0.6
            else:
                sx = int(min(max(r.x() + r.width() / 2, 0), self.window.width() - 1) * dpr)
                sy = int(min(max(r.y() + 2, 0), self.window.height() - 1) * dpr)
                dark = _luma(QColor(img.pixel(sx, sy))) > 0.55
            col = "#0f172a" if dark else "#ffffff"
            lab.setStyleSheet(f"background: transparent; color: {col};")

    # --- hodisalar ---
    def _index_at(self, global_pos) -> int:
        p = self.window.mapFromGlobal(global_pos)
        for it in self.items:
            if it["rect"].contains(p):
                return it["idx"]
        return -1

    def eventFilter(self, obj, ev):
        t = ev.type()
        if obj is self.window and t in (QEvent.Resize, QEvent.Show):
            self.overlay.setGeometry(self.window.rect())
        elif t == QEvent.MouseMove and hasattr(ev, "globalPosition"):
            i = self._index_at(ev.globalPosition().toPoint())
            if i != self.scene.hovered:
                self.scene.hovered = i
                self.overlay.wake()
            p = self.window.mapFromGlobal(ev.globalPosition().toPoint())
            self.overlay.light = ((p.x() / max(self.window.width(), 1) - 0.5) * 2, (p.y() / max(self.window.height(), 1) - 0.5) * 2)
        elif t == QEvent.MouseButtonPress and hasattr(ev, "globalPosition"):
            i = self._index_at(ev.globalPosition().toPoint())
            if i >= 0:
                self.scene.pressed = i
                self.overlay.wake()
        elif t == QEvent.MouseButtonRelease and self.scene.pressed >= 0:
            self.scene.pressed = -1
            self.overlay.wake()
            QTimer.singleShot(0, self.refresh)
        return False


def attach(window: QWidget, **kwargs) -> GlassController:
    """Oynadagi tugmalarni shisha qiladi. kwargs: selector (sinf), params (dict), radius (px), poll_ms."""
    return GlassController(window, **kwargs)
