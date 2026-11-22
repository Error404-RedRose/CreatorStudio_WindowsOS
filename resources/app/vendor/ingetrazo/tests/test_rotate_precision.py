# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2026 Marco Sumari Tellez and IngeTrazo contributors.
"""Rotate lands exactly where the cursor was held (issue #163, @fafecm).

The video: a wall panel (a group) rotated about its corner, the second arm
snapped to the END of a guide line (-70.3° on the label), and the rotated
panel then missed that end in the top view. Two causes:

* the rotation always applied the angle rounded to 0.1° -- the label's
  value -- even when an inference held the cursor on a precise point:
  70.2789° applied as 70.3° is ~0.7 mm off two metres out;
* the live preview turned the geometry by the delta of every mouse move
  and turned it back by the total before committing: hundreds of
  single-precision rotations that do not cancel, so the geometry had
  drifted before the real rotation started.
"""
from __future__ import annotations

import math

from PySide6.QtCore import QPointF, Qt
from PySide6.QtGui import QVector3D

from core.group import Group
from core.history import History
from core.mesh import Mesh
from core.scene import Scene
from core.snap import SnapResult
from tools.base import ToolContext
from tools.protractor import ProtractorTool
from tools.rotate import RotateTool

V = QVector3D
TARGET_DEG = -70.2789          # what the guide line's end really is
R = 2.0


class _Vp:
    def __init__(self, scene):
        self.scene = scene
        self.history = History(scene)

    def update(self):
        pass

    def set_hover(self, *_a):
        pass

    def flash_status(self, *a, **k):
        pass

    def pick_group(self, x, y):
        return None

    def pick_edge(self, x, y):
        return None

    def pick_face(self, x, y):
        return None

    def set_groups_preview_matrix(self, m):
        pass


def _ctx(vp, p, kind=None):
    snap = SnapResult(QVector3D(p), kind) if kind else None
    return ToolContext(viewport=vp, world=QVector3D(p), screen=QPointF(0, 0),
                       modifiers=Qt.NoModifier, snap=snap)


def _target():
    t = math.radians(TARGET_DEG)
    return V(R * math.cos(t), R * math.sin(t), 0.0)


def _panel(mesh):
    """A thin panel whose far corner sits at (R, 0): the point that must
    land on the target."""
    return mesh.add_face([V(0, 0, 0), V(R, 0, 0), V(R, 0.1, 0), V(0, 0.1, 0)])


def _far_corner(scene, group=None):
    """World position of the vertex that started at (R, 0)."""
    mesh = group.mesh if group is not None else scene.mesh
    best = None
    for vx in mesh.vertices:
        p = vx.position
        if group is not None and getattr(group, "xform", None) is not None:
            p = group.xform.map(p)
        d = (p - V(0, 0.1, 0)).length()
        # the far corner is the one R from the pivot and farthest from
        # the panel's other long edge start
        if abs((p - V(0, 0, 0)).length() - R) < 1e-3:
            if best is None or abs(p.z()) <= abs(best.z()):
                best = p
    return best


def _swing(vp, tool, final_kind):
    tool.on_click(_ctx(vp, V(0, 0, 0)))              # pivot
    tool.on_click(_ctx(vp, V(R, 0, 0)))              # reference arm
    for k in range(1, 60):                           # the drag: many moves
        t = math.radians(TARGET_DEG * k / 60 + 3 * math.sin(k))
        tool.on_hover(_ctx(vp, V(R * math.cos(t), R * math.sin(t), 0)))
    tool.on_hover(_ctx(vp, _target(), final_kind))
    tool.on_click(_ctx(vp, _target(), final_kind))


def test_loose_geometry_lands_exactly_on_the_snapped_endpoint():
    scene = Scene()
    face = _panel(scene.mesh)
    scene.selection = [face]
    vp = _Vp(scene)
    _swing(vp, RotateTool(), "endpoint")
    corner = _far_corner(scene)
    assert corner is not None
    assert (corner - _target()).length() < 2e-6, (corner, _target())


def test_a_group_lands_exactly_on_the_snapped_endpoint():
    scene = Scene()
    group = Group(Mesh(), name="Panel")
    _panel(group.mesh)
    scene.groups.append(group)
    scene.selection = [group]
    vp = _Vp(scene)
    _swing(vp, RotateTool(), "endpoint")
    corner = _far_corner(scene, group)
    assert corner is not None
    assert (corner - _target()).length() < 2e-6, (corner, _target())


def test_a_free_cursor_still_rotates_by_the_rounded_angle():
    """No inference: the label's 0.1° is what is applied, as before."""
    scene = Scene()
    face = _panel(scene.mesh)
    scene.selection = [face]
    vp = _Vp(scene)
    _swing(vp, RotateTool(), None)
    corner = _far_corner(scene)
    applied = math.degrees(math.atan2(corner.y(), corner.x()))
    assert applied == __import__("pytest").approx(round(TARGET_DEG, 1), abs=1e-4)


def test_cancelling_after_a_long_drag_puts_everything_back_exactly():
    scene = Scene()
    face = _panel(scene.mesh)
    scene.selection = [face]
    before = [QVector3D(v.position) for v in scene.mesh.vertices]
    vp = _Vp(scene)
    tool = RotateTool()
    tool.on_click(_ctx(vp, V(0, 0, 0)))
    tool.on_click(_ctx(vp, V(R, 0, 0)))
    for k in range(400):
        t = math.radians(37.0 * math.sin(k * 0.37) + 0.013 * k)
        tool.on_hover(_ctx(vp, V(R * math.cos(t), R * math.sin(t), 0)))
    tool.on_cancel(vp)
    after = [v.position for v in scene.mesh.vertices]
    assert all(a == b for a, b in zip(before, after)), "the drag left drift"


def test_a_typed_angle_is_applied_exactly():
    scene = Scene()
    face = _panel(scene.mesh)
    scene.selection = [face]
    vp = _Vp(scene)
    tool = RotateTool()
    tool.on_click(_ctx(vp, V(0, 0, 0)))
    tool.on_click(_ctx(vp, V(R, 0, 0)))
    for k in range(30):
        t = math.radians(k * 1.7)
        tool.on_hover(_ctx(vp, V(R * math.cos(t), R * math.sin(t), 0)))
    tool.on_value(vp, 30.0)
    corner = _far_corner(scene)
    assert math.degrees(math.atan2(corner.y(), corner.x())) == \
        __import__("pytest").approx(30.0, abs=1e-5)


def test_the_protractor_guide_passes_through_the_snapped_point():
    tool = ProtractorTool()
    tool.start_point = V(0, 0, 0)
    tool.ref_point = V(R, 0, 0)
    tool._exact_snap = True
    tool._snap_ticks = False
    assert tool._commit_deg(_target()) == __import__("pytest").approx(TARGET_DEG, abs=1e-5)
    tool._exact_snap = False
    assert tool._commit_deg(_target()) == round(TARGET_DEG, 1)
