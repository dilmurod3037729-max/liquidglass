"""Ish stolida erkin siljitiladigan shisha popup: orqasidagi hamma narsani (ish stoli, boshqa oynalar) jonli sindiradi.
Sarlavhani ushlab suring; ustiga tugma bosing; Esc yoki ✕ yopadi."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from PySide6.QtCore import Qt
from PySide6.QtWidgets import QApplication, QDialog, QHBoxLayout, QLabel, QPushButton, QVBoxLayout

from liquidglass_qt import MATERIALS, Glass
from liquidglass_win import NativeController, available, make_popup

if not available():
    sys.exit("lgwin.dll topilmadi (win-native\\build_dll.bat)")

app = QApplication(sys.argv)
dlg = QDialog()
dlg.setWindowTitle("Shisha popup")
dlg.setAttribute(Qt.WA_DeleteOnClose)
lay = QVBoxLayout(dlg)
lay.setContentsMargins(22, 14, 22, 18)
title = QLabel("Suyuq shisha oynasi")
title.setStyleSheet("font-size: 18px; font-weight: 700;")
body = QLabel("Sarlavhani ushlab ish stolida suring:\norqadagi narsa shisha qirrasida sinadi.")
row = QHBoxLayout()
row.addStretch(1)
for text in ("Bekor", "Tushunarli"):
    b = QPushButton(text)
    b.setMinimumSize(110, 40)
    b.clicked.connect(dlg.close if text == "Bekor" else (lambda: title.setText("Bosildi!")))
    row.addWidget(b)
lay.addWidget(title)
lay.addWidget(body)
lay.addSpacing(10)
lay.addLayout(row)
dlg.resize(460, 220)
make_popup(dlg, under=True)
dlg.move(500, 300)
ctl = NativeController(dlg, rules=[Glass(QPushButton)], under=True, popup=True)
ctl.add(dlg, dict(MATERIALS["panel"], bevel=0.21, thick=0.5, frame=False), radius=16)
sys.exit(app.exec())
