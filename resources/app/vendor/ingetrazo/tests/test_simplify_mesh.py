# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2026 Marco Sumari Tellez and IngeTrazo contributors.
"""Interactive mesh simplification across orientations and gentle curves."""
import math

import pytest
from PySide6.QtGui import QVector3D

from core.history import History, SimplifyMeshCommand
from core.mesh import Mesh
from formats.fuse import simplify_mesh


def _grid(plane, width=12, height=8):
    mesh = Mesh()

    def point(x, y):
        if plane == "XY":
            return QVector3D(x, y, 0)
        if plane == "XZ":
            return QVector3D(x, 0, y)
        if plane == "YZ":
            return QVector3D(0, x, y)
        return QVector3D(x, y, x + y)

    for x in range(width):
        for y in range(height):
            a, b = point(x, y), point(x + 1, y)
            c, d = point(x + 1, y + 1), point(x, y + 1)
            mesh.add_face((a, b, c))
            mesh.add_face((a, c, d))
    return mesh


@pytest.mark.parametrize("plane", ["XY", "XZ", "YZ", "tilted"])
def test_simplify_mesh_merges_planar_regions_in_any_orientation(plane):
    mesh = _grid(plane)

    removed = simplify_mesh(mesh)

    assert removed == 12 * 8 * 2 - 1
    assert len(mesh.faces) == 1
    assert len(mesh.vertices) == 4


def test_angle_tolerance_simplifies_gently_rounded_facets():
    mesh = Mesh()
    segments = 90
    radius = 10.0
    for index in range(segments):
        a0 = math.pi * index / (2 * segments)
        a1 = math.pi * (index + 1) / (2 * segments)
        a = QVector3D(radius * math.cos(a0), radius * math.sin(a0), 0)
        b = QVector3D(radius * math.cos(a1), radius * math.sin(a1), 0)
        c = QVector3D(radius * math.cos(a1), radius * math.sin(a1), 2)
        d = QVector3D(radius * math.cos(a0), radius * math.sin(a0), 2)
        mesh.add_face((a, b, c))
        mesh.add_face((a, c, d))
    before_positions = {v.position.toTuple() for v in mesh.vertices}

    removed = simplify_mesh(mesh, max_angle_degrees=1.0)

    assert removed > segments
    assert len(mesh.faces) < segments
    assert max(v.position.x() for v in mesh.vertices) == \
        pytest.approx(radius)
    assert max(v.position.y() for v in mesh.vertices) == \
        pytest.approx(radius)
    assert max(v.position.z() for v in mesh.vertices) == pytest.approx(2.0)
    assert all(v.position.toTuple() in before_positions for v in mesh.vertices)


def test_simplify_preserves_face_attributes_and_holes():
    mesh = Mesh()
    a, b, c, d = (QVector3D(0, 0, 0), QVector3D(1, 0, 0),
                  QVector3D(1, 1, 0), QVector3D(0, 1, 0))
    first = mesh.add_face((a, b, c))
    second = mesh.add_face((a, c, d))
    first.attrs["layer"] = "one"
    second.attrs["layer"] = "two"

    simplify_mesh(mesh)

    assert len(mesh.faces) == 2
    assert {face.attrs["layer"] for face in mesh.faces} == {"one", "two"}

    holed = Mesh()
    face = holed.add_face(
        (a, b, c, d),
        [[QVector3D(0.25, 0.25, 0), QVector3D(0.75, 0.25, 0),
          QVector3D(0.75, 0.75, 0), QVector3D(0.25, 0.75, 0)]])
    face.interior = True

    simplify_mesh(holed)

    assert len(holed.faces) == 1
    assert len(holed.faces[0].holes) == 1
    assert holed.faces[0].interior


def test_simplify_mesh_command_can_be_undone_and_redone():
    from core.scene import Scene

    scene = Scene(mesh=_grid("XZ"))
    history = History(scene)
    original = scene.mesh.capture_state()
    command = SimplifyMeshCommand()

    history.execute(command)
    assert history.last_error is None
    assert command.faces_removed > 0
    assert len(scene.mesh.faces) == 1

    assert history.undo()
    assert scene.mesh.faces == original["faces"]

    assert history.redo()
    assert len(scene.mesh.faces) == 1
