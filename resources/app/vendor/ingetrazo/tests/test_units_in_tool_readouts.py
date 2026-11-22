# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2026 Marco Sumari Tellez and IngeTrazo contributors.
"""Issue #149 (@xyont): with the document in millimetres the rectangle read
in mm, but circle and polygon showed metres while a typed «500» still meant
500 mm -- and the side count read «lados» in the English UI. Every length a
tool shows goes through core.units (fmt_len), in the document's units."""
from __future__ import annotations

import os
import re
from pathlib import Path

os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")

import pytest  # noqa: E402
from PySide6.QtCore import QPointF, Qt  # noqa: E402
from PySide6.QtGui import QVector3D  # noqa: E402
from PySide6.QtWidgets import QApplication  # noqa: E402

if QApplication.instance() is None:
    QApplication([])

from core import units  # noqa: E402
from core.history import History  # noqa: E402
from core.i18n import tr  # noqa: E402
from core.scene import Scene  # noqa: E402
from tools.base import ToolContext  # noqa: E402
from tools.circle import CircleTool, PolygonTool  # noqa: E402
from views.viewport import Viewport  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]


class _VP:
    def __init__(self, scene):
        self.scene = scene
        self.history = History(scene)

    def update(self):
        pass

    def flash_status(self, text, msec=2500):
        pass


def _ctx(vp, world):
    return ToolContext(viewport=vp, world=world, screen=QPointF(0, 0),
                       modifiers=Qt.NoModifier, snap=None)


@pytest.fixture
def mm_scene():
    scene = Scene()
    scene.units = {"length": "mm", "precision": 0}
    units.bind_scene(scene)
    yield scene
    units.bind_scene(None)


@pytest.mark.parametrize("tool_cls, sides", [(CircleTool, 24), (PolygonTool, 6)])
def test_circle_and_polygon_read_and_take_millimetres(mm_scene, tool_cls, sides):
    vp = _VP(mm_scene)
    tool = tool_cls()
    tool.on_click(_ctx(vp, QVector3D(0, 0, 0)))          # centre
    tool.on_hover(_ctx(vp, QVector3D(0.3, 0, 0)))        # 300 mm away
    text, _where = tool.value_label()
    assert text == "R 300 mm  (" + tr("{n} sides", n=sides) + ")", text
    assert "lados" not in text or tr("{n} sides", n=1).endswith("lados")
    # typing «500» + Enter: the viewport reads it in the document's unit
    value = Viewport._parse_value_buffer("500")
    assert value == pytest.approx(0.5)
    assert tool.on_value(vp, value) is True
    face = mm_scene.mesh.faces[0]
    assert len(face.vertices) == sides
    for v in face.vertices:
        assert v.length() == pytest.approx(0.5, abs=1e-6)   # a 500 mm radius


def test_what_is_typed_shows_the_unit_it_will_be_read_in(mm_scene):
    assert units.typed_value_text("500") == "500 mm"
    assert units.typed_value_text("300,200") == "300,200 mm"
    assert units.typed_value_text("2m") == "2m"            # its own unit wins
    assert units.typed_value_text("24s") == "24s"
    mm_scene.units = {"length": "m", "precision": 2}
    assert units.typed_value_text("2") == "2 m"
    mm_scene.units = {"length": "ft-in", "precision": 0}
    assert units.typed_value_text("6") == '6"'              # inches, as parsed


def test_no_tool_writes_metres_by_hand():
    """A readout or message with a literal « m» after a number is exactly
    the bug: it stays metres whatever the document's unit."""
    pattern = re.compile(r"\{[^}]*(?::\.\d+[fg])?\}\s?m\b[^²a-z]")
    offenders = []
    for path in sorted((ROOT / "tools").glob("*.py")):
        for n, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            code = line.split("#", 1)[0]
            if pattern.search(code):
                offenders.append(f"{path.name}:{n}: {line.strip()}")
    assert not offenders, "\n".join(offenders)
