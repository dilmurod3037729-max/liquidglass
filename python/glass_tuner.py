"""Shisha xossalarini jonli sozlash: slayderlar popup'ga darhol ta'sir qiladi. "Nusxa olish" JSON'ni almashish buferiga qo'yadi va
out/glass_tuning.json ga yozadi: qiymatlarni shu JSON ko'rinishida yuboring, keyin ular standart (static) qiymat qilinadi."""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

src = (HERE / "popup_demo.py").read_text(encoding="utf-8").replace("sys.exit(app.exec())", "")
g = {"__name__": "__main__", "__file__": str(HERE / "popup_demo.py")}
exec(compile(src, "popup_demo.py", "exec"), g)

from PySide6.QtCore import Qt
from PySide6.QtWidgets import (QApplication, QDoubleSpinBox, QGridLayout, QGroupBox, QHBoxLayout, QLabel, QPlainTextEdit, QPushButton,
                               QScrollArea, QSlider, QVBoxLayout, QWidget)

import liquidglass_win as lw

app, dlg, ctl = g["app"], g["dlg"], g["ctl"]
OUT = HERE / "out"
OUT.mkdir(exist_ok=True)
panel = ctl._extra[0][1]          # popup oynasining o'zi (shisha shakli)
button_rule = ctl.rules[0]        # tugmalar qoidasi

DEFAULTS = {
    "params": {**lw.DEFAULT_PARAMS},
    "frost_px": lw.POPUP_FROST,
    "edge_px": 0.0,
    "popup": {"bevel": lw.POPUP_BEVEL, "thick": lw.POPUP_THICK, "radius": 16.0},
    "button": {"bevel": lw.NATIVE_BUTTON["bevel"], "thick": lw.NATIVE_BUTTON["thick"], "radius": 8.0},
}
state = json.loads(json.dumps(DEFAULTS))
state["params"].update({k: ctl.params[k] for k in ctl.params if k in state["params"]})
state["params"]["shadow"] = ctl.params.get("shadow", 0.0)
state["popup"]["bevel"] = abs(panel.mat["bevel"])
state["popup"]["thick"] = abs(panel.mat["thick"])
state["popup"]["radius"] = float(panel.mat.get("radius") or 16.0)
state["button"] = dict(DEFAULTS["button"])

view = QPlainTextEdit()
view.setReadOnly(True)
sliders = []   # (group, key, slider, spin) qaytarib o'rnatish uchun


def save():
    text = json.dumps(state, indent=2, ensure_ascii=False)
    view.setPlainText(text)
    (OUT / "glass_tuning.json").write_text(text, encoding="utf-8")


def apply(group, key, value):
    if group == "frost_px":
        state["frost_px"] = value
        lw._dll.lg_set_frost(ctl._h, float(value) * dlg.devicePixelRatioF())
        save()
        return
    if group == "edge_px":
        state["edge_px"] = value
        lw._dll.lg_set_edge(ctl._h, float(value) * dlg.devicePixelRatioF())
        save()
        return
    state[group][key] = value
    if group == "params":
        ctl.set_params(**{key: value})
    elif group == "popup":
        m = panel.mat
        if key == "radius":
            m["radius"] = value
        else:
            m[key] = -abs(value) if (key == "bevel" and m[key] < 0) else value
        ctl._sig = None
        ctl._dirty = True
    elif group == "button":
        button_rule.mat[key] = value
        ctl._sig = None
        ctl._dirty = True
    save()


def add_row(grid, r, label, group, key, lo, hi, step, decimals=2):
    lab = QLabel(label)
    sl = QSlider(Qt.Horizontal)
    n = int(round((hi - lo) / step))
    sl.setRange(0, n)
    spin = QDoubleSpinBox()
    spin.setRange(lo, hi)
    spin.setSingleStep(step)
    spin.setDecimals(decimals)
    cur = state[group] if group in ("frost_px", "edge_px") else state[group][key]

    def to_slider(v):
        sl.blockSignals(True)
        sl.setValue(int(round((v - lo) / step)))
        sl.blockSignals(False)

    def from_slider(i):
        v = lo + i * step
        spin.blockSignals(True)
        spin.setValue(v)
        spin.blockSignals(False)
        apply(group, key, round(v, decimals))

    def from_spin(v):
        to_slider(v)
        apply(group, key, round(v, decimals))

    spin.setValue(cur)
    to_slider(cur)
    sl.valueChanged.connect(from_slider)
    spin.valueChanged.connect(from_spin)
    grid.addWidget(lab, r, 0)
    grid.addWidget(sl, r, 1)
    grid.addWidget(spin, r, 2)
    sliders.append((group, key, sl, spin, lo, step, decimals))


def build_group(title, rows):
    box = QGroupBox(title)
    grid = QGridLayout(box)
    grid.setColumnStretch(1, 1)
    for i, row in enumerate(rows):
        add_row(grid, i, *row)
    return box


tuner = QWidget()
tuner.setWindowTitle("Shisha sozlagich")
root = QVBoxLayout(tuner)
inner = QWidget()
lay = QVBoxLayout(inner)
lay.addWidget(build_group("Sinish (umumiy)", [
    ("Sinish ko'rsatkichi (ior)", "params", "ior", 1.0, 2.5, 0.01),
    ("Qalinlik (thick)", "params", "thick", 0.0, 120.0, 1.0, 0),
    ("Qirra kengligi (bevel)", "params", "bevel", 0.0, 80.0, 1.0, 0),
    ("Rang ajralishi (disp)", "params", "disp", 0.0, 0.2, 0.005, 3),
    ("Qirra xiraligi (mip, eski usul)", "params", "blur", 0.0, 6.0, 0.05),
    ("Qo'shimcha xiralik (lod)", "params", "lod", 0.0, 5.0, 0.05),
    ("Yaltirash (spec)", "params", "spec", 0.0, 3.0, 0.05),
    ("Yutilish (absorb)", "params", "absorb", 0.0, 2.0, 0.05),
    ("Birlashish (merge)", "params", "merge", 0.0, 60.0, 1.0, 0),
]))
lay.addWidget(build_group("Xiralik (Gauss)", [
    ("Markaz (piksel; 0 = o'chiq)", "frost_px", "frost_px", 0.0, 40.0, 0.5, 1),
    ("Qirra (piksel; 0 = o'chiq)", "edge_px", "edge_px", 0.0, 30.0, 0.5, 1),
]))
lay.addWidget(build_group("Soya", [
    ("Kuch", "params", "shadow", 0.0, 1.0, 0.01),
    ("Masofa", "params", "shadow_off", 0.0, 80.0, 1.0, 0),
]))
lay.addWidget(build_group("Popup oynasi", [
    ("Qirra (bevel ko'paytiruvchi)", "popup", "bevel", 0.05, 2.0, 0.01),
    ("Qalinlik (thick ko'paytiruvchi)", "popup", "thick", 0.05, 2.0, 0.01),
    ("Burchak radiusi", "popup", "radius", 0.0, 60.0, 1.0, 0),
]))
lay.addWidget(build_group("Tugmalar", [
    ("Qirra (bevel ko'paytiruvchi)", "button", "bevel", 0.05, 2.5, 0.01),
    ("Qalinlik (thick ko'paytiruvchi)", "button", "thick", 0.05, 2.5, 0.01),
    ("Burchak radiusi", "button", "radius", 0.0, 40.0, 1.0, 0),
]))
scroll = QScrollArea()
scroll.setWidgetResizable(True)
scroll.setWidget(inner)
root.addWidget(scroll, 1)

bar = QHBoxLayout()
copy_btn = QPushButton("Nusxa olish (JSON)")
reset_btn = QPushButton("Standartga qaytarish")
bar.addWidget(copy_btn)
bar.addWidget(reset_btn)
root.addLayout(bar)
view.setMaximumHeight(170)
root.addWidget(view)
hint = QLabel("Qiymatlar out\\glass_tuning.json ga avtomatik yoziladi.")
root.addWidget(hint)


def do_copy():
    QApplication.clipboard().setText(view.toPlainText())
    hint.setText("Nusxa olindi: Ctrl+V bilan yuboring. Fayl: out\\glass_tuning.json")


def do_reset():
    for group, key, sl, spin, lo, step, dec in sliders:
        v = DEFAULTS[group] if group in ("frost_px", "edge_px") else DEFAULTS[group][key]
        spin.setValue(v)   # signal apply() ni chaqiradi


copy_btn.clicked.connect(do_copy)
reset_btn.clicked.connect(do_reset)
tuner.resize(430, 820)
tuner.move(1050, 60)
tuner.show()
save()
app.exec()
