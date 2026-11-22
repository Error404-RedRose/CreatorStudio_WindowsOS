# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2026 Marco Sumari Tellez and IngeTrazo contributors.
"""A face reversed on purpose stays reversed when you keep drawing.

Reported 2026-09-26 with screenshots: two rectangles on the ground, both
reversed (Reverse Faces), then a third drawn over one of them came out
reversed too — and after putting some pieces back white, one arc drawn
ALONE, away from everything, turned them all blue again.

On a flat drawing every edit ran ``orient_coplanar_faces`` over the whole
plane: any face against the area-weighted majority was flipped. That pass
exists for auto-faced cycles that close with the wrong winding, but it
could not tell those from a face the user had turned — so the next loose
rectangle anywhere undid a Reverse Faces. The planar rebuild a curve
triggers went further and oriented every region like the first face.

Now the pass gets a footprint of the plane taken before the edit: a face
that was already there is never turned, and a face the edit made (a split
half, a rebuilt region) faces the way the face it was cut from did. Only
a region drawn where no face was follows the majority, as before.
"""
from __future__ import annotations

import math
import os

os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")

from PySide6.QtGui import QVector3D

from core.edits import build_add_edges
from core.history import (AddFaceCommand, EraseSelectionCommand, History,
                          FlipFacesCommand)
from core.scene import Scene


def V(x, y, z=0.0):
    return QVector3D(float(x), float(y), float(z))


def _setup():
    scene = Scene()
    return scene, History(scene)


def _rect(scene, hist, x0, y0, x1, y1):
    """The Rectangle tool's commit: its four edges plus its own face."""
    c = [V(x0, y0), V(x1, y0), V(x1, y1), V(x0, y1)]
    hist.execute(build_add_edges(
        scene, [(c[i], c[(i + 1) % 4]) for i in range(4)],
        detect_faces=False, extra=[AddFaceCommand(list(c))]))


def _face_at(scene, x, y):
    from core.topology import _point_in_face_solid
    p = V(x, y)
    hits = [f for f in scene.mesh.faces if _point_in_face_solid(f, p)]
    assert len(hits) == 1, f"{len(hits)} faces at ({x}, {y})"
    return hits[0]


def _up(scene, x, y) -> bool:
    return _face_at(scene, x, y).normal().z() > 0


def _reverse(scene, hist, x, y):
    hist.execute(FlipFacesCommand([_face_at(scene, x, y)]))


def _two_with_b_reversed():
    scene, hist = _setup()
    _rect(scene, hist, 0, 0, 4, 4)          # A, the bigger one: majority
    _rect(scene, hist, 6, 0, 9, 3)          # B
    assert _up(scene, 2, 2) and _up(scene, 7.5, 1.5)
    _reverse(scene, hist, 7.5, 1.5)
    assert not _up(scene, 7.5, 1.5)
    return scene, hist


def test_a_loose_rectangle_does_not_turn_a_reversed_face_back():
    scene, hist = _two_with_b_reversed()
    _rect(scene, hist, 12, 0, 14, 2)
    assert not _up(scene, 7.5, 1.5), "B was turned back by a far rectangle"
    assert _up(scene, 2, 2)
    assert _up(scene, 13, 1), "a region drawn anew follows the majority"


def test_a_loose_arc_does_not_turn_a_reversed_face_back():
    """A curve sends a flat drawing through the full planar rebuild."""
    scene, hist = _two_with_b_reversed()
    arc = [V(11 + math.cos(a * math.pi / 12), 5 + math.sin(a * math.pi / 12))
           for a in range(13)]
    hist.execute(build_add_edges(scene, list(zip(arc, arc[1:]))))
    assert not _up(scene, 7.5, 1.5)
    assert _up(scene, 2, 2)


def test_a_rectangle_over_a_reversed_face_takes_its_side_there():
    scene, hist = _two_with_b_reversed()
    _rect(scene, hist, 5, 2, 8, 6)          # half over B, half on bare ground
    assert not _up(scene, 7.5, 1), "what is left of B"
    assert not _up(scene, 7, 2.5), "the overlap, cut out of B"
    assert _up(scene, 6.5, 4.5), "the part on bare ground"


def test_a_line_across_a_reversed_face_keeps_both_halves_reversed():
    scene, hist = _two_with_b_reversed()
    hist.execute(build_add_edges(scene, [(V(7.5, 0), V(7.5, 3))]))
    assert not _up(scene, 7, 1.5)
    assert not _up(scene, 8, 1.5)


def test_erasing_the_split_line_keeps_the_reunited_face_reversed():
    scene, hist = _two_with_b_reversed()
    hist.execute(build_add_edges(scene, [(V(7.5, 0), V(7.5, 3))]))
    line = next(e for e in scene.mesh.edges
                if abs(e.a.x() - 7.5) < 1e-6 and abs(e.b.x() - 7.5) < 1e-6)
    hist.execute(EraseSelectionCommand([line], []))
    assert not _up(scene, 7.5, 1.5)


def test_undo_still_restores_the_face_as_it_was():
    scene, hist = _two_with_b_reversed()
    _rect(scene, hist, 12, 0, 14, 2)
    hist.undo()
    assert not _up(scene, 7.5, 1.5)
    hist.undo()                                # the Reverse Faces itself
    assert _up(scene, 7.5, 1.5)
