# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2026 Marco Sumari Tellez and IngeTrazo contributors.
"""Issue #175 (@pacaeiro): «While drawing a line and make undo inside the
command, the last picked point is not freed.» Ctrl+Z undid the segment but
the Line stayed anchored to its end, so the next segment left from a point
that no longer existed. Now the chain steps back one vertex; with only the
first point placed, the point is let go."""
from __future__ import annotations

from PySide6.QtGui import QVector3D

from core.history import History
from core.scene import Scene
from tools.line import LineTool


class _Vp:
    def __init__(self, scene):
        self.scene = scene
        self.history = History(scene)

    def update(self):
        pass

    def flash_status(self, *a, **k):
        pass


def _draw(t, vp, *pts):
    t.start_point = QVector3D(*pts[0])
    t.chain_first_point = t.start_point
    t.chain_vertices = [t.start_point]
    for p in pts[1:]:
        t.hover_point = QVector3D(*p)
        d = QVector3D(*p) - t.start_point
        assert t.on_value(vp, (d.x(), d.y(), d.z())) is True


def test_undo_steps_the_chain_back_to_the_previous_vertex():
    scene = Scene()
    vp = _Vp(scene)
    t = LineTool()
    _draw(t, vp, (0, 0, 0), (2, 0, 0), (2, 3, 0))
    assert len(scene.mesh.edges) == 2
    assert t.on_undo(vp) is True
    assert len(scene.mesh.edges) == 1                          # segment gone
    assert (t.start_point - QVector3D(2, 0, 0)).length() < 1e-9  # not (2,3)
    assert t.on_undo(vp) is True
    assert len(scene.mesh.edges) == 0
    assert (t.start_point - QVector3D(0, 0, 0)).length() < 1e-9
    assert t.on_undo(vp) is True                               # first point…
    assert t.start_point is None                               # …let go
    assert len(vp.history.undo_stack) == 0


def test_idle_line_leaves_undo_to_the_history():
    scene = Scene()
    vp = _Vp(scene)
    t = LineTool()
    assert t.on_undo(vp) is False


def test_the_chain_goes_on_from_the_stepped_back_vertex():
    scene = Scene()
    vp = _Vp(scene)
    t = LineTool()
    _draw(t, vp, (0, 0, 0), (2, 0, 0), (2, 3, 0))
    t.on_undo(vp)
    t.hover_point = QVector3D(2, -1, 0)
    assert t.on_value(vp, (0.0, -1.0, 0.0)) is True
    ends = sorted(((e.a.x(), e.a.y()), (e.b.x(), e.b.y())) for e in scene.mesh.edges)
    assert any((2.0, -1.0) in pair for pair in ends)           # left from (2,0)
    assert not any((2.0, 3.0) in pair for pair in ends)
