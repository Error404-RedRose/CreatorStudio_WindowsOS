# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2026 Marco Sumari Tellez and IngeTrazo contributors.
"""STL import: ASCII and binary parsing, scale conversion and undo."""
from __future__ import annotations

import struct
import math

import pytest
from PySide6.QtGui import QVector3D

from core.history import History, SnapshotImport
from core.orient import is_closed, signed_volume
from core.scene import Scene
from formats import stl as stl_format
import tests.test_fuzz_engine as F


def _cube(scene, hist):
    v = QVector3D
    F._draw_rect(scene, hist,
                 [v(0, 0, 0), v(4, 0, 0), v(4, 4, 0), v(0, 4, 0)], [])
    face = scene.mesh.faces[0]
    F._push(scene, hist, face, 3 if face.normal().z() > 0 else -3)


def _binary(path, triangles, header=b"test STL"):
    with path.open("wb") as target:
        target.write(header[:80].ljust(80, b"\0"))
        target.write(struct.pack("<I", len(triangles)))
        for triangle in triangles:
            target.write(struct.pack(
                "<12fH", 0, 0, 0,
                *triangle[0], *triangle[1], *triangle[2], 0))


def _bounds(scene):
    points = [point for face in scene.mesh.faces for point in face.vertices]
    components = (
        [point.x() for point in points],
        [point.y() for point in points],
        [point.z() for point in points],
    )
    return tuple(value
                 for values in components
                 for value in (min(values), max(values)))


def test_binary_stl_round_trip_rebuilds_closed_solid(tmp_path):
    original = Scene()
    _cube(original, History(original))
    path = tmp_path / "cube.stl"
    stl_format.save_stl(original, path)

    imported = Scene()
    stl_format.load_stl(imported, path)

    assert len(imported.mesh.faces) == 6
    assert len(imported.mesh.vertices) == 8
    assert is_closed(imported.mesh)
    assert signed_volume(imported.mesh) == pytest.approx(48.0)


def test_import_orients_solid_without_touching_open_scene_geometry(tmp_path):
    source = Scene()
    _cube(source, History(source))
    path = tmp_path / "cube.stl"
    stl_format.save_stl(source, path)
    scene = Scene()
    existing = scene.mesh.add_face([
        QVector3D(10, 0, 0),
        QVector3D(11, 0, 0),
        QVector3D(10, 1, 0),
    ])

    stl_format.load_stl(scene, path)

    assert existing in scene.mesh.faces
    assert len(scene.mesh.faces) == 7
    assert signed_volume(scene.mesh) == pytest.approx(48.0)


def test_binary_stl_solid_prefixed_header_is_detected_and_scaled(tmp_path):
    path = tmp_path / "solid_header.stl"
    _binary(path, [((0, 0, 0), (4000, 0, 0), (0, 4000, 0))],
            header=b"solid binary file")
    scene = Scene()

    stl_format.load_stl(scene, path, scale=0.001)

    assert _bounds(scene) == pytest.approx((0, 4, 0, 4, 0, 0))


def test_binary_stl_with_trailing_bytes_is_detected(tmp_path):
    path = tmp_path / "trailing_bytes.stl"
    _binary(path, [((0, 0, 0), (1, 0, 0), (0, 1, 0))],
            header=b"binary STL file")
    with path.open("ab") as target:
        target.write(b"exporter metadata")
    scene = Scene()

    stl_format.load_stl(scene, path)

    assert len(scene.mesh.faces) == 1
    assert _bounds(scene) == pytest.approx((0, 1, 0, 1, 0, 0))


def test_ascii_stl_is_whitespace_tolerant_and_scaled(tmp_path):
    path = tmp_path / "one_facet.stl"
    path.write_text(
        "SOLID part\n"
        " FACET NORMAL 0 0 1\n"
        "  OUTER   LOOP\n"
        "   VERTEX 0 0 0\n"
        "   vertex 4000 0 0\n"
        "   vertex 0 2000 0\n"
        "  ENDLOOP\n"
        " ENDFACET\n"
        "ENDSOLID part\n",
        encoding="ascii")
    scene = Scene()

    stl_format.load_stl(scene, path, scale=0.001)

    assert len(scene.mesh.faces) == 1
    assert _bounds(scene) == pytest.approx((0, 4, 0, 2, 0, 0))


def test_degenerate_facets_are_skipped(tmp_path):
    path = tmp_path / "degenerate.stl"
    _binary(path, [
        ((0, 0, 0), (1, 0, 0), (2, 0, 0)),
        ((0, 0, 0), (1, 0, 0), (0, 1, 0)),
    ])
    scene = Scene()

    stl_format.load_stl(scene, path)

    assert len(scene.mesh.faces) == 1


@pytest.mark.parametrize("scale", [0, -1, float("inf"), float("nan")])
def test_invalid_unit_scale_is_rejected(tmp_path, scale):
    path = tmp_path / "triangle.stl"
    _binary(path, [((0, 0, 0), (1, 0, 0), (0, 1, 0))])

    with pytest.raises(ValueError, match="positive finite"):
        stl_format.load_stl(Scene(), path, scale=scale)


def test_malformed_binary_stl_is_rejected(tmp_path):
    path = tmp_path / "truncated.stl"
    path.write_bytes(b"\0" * 80 + struct.pack("<I", 1))

    with pytest.raises(ValueError, match="no usable triangles"):
        stl_format.load_stl(Scene(), path)


def test_large_stl_import_is_grouped_and_undoable(tmp_path):
    from formats.dae import _MAX_FUSE_LOOPS

    path = tmp_path / "large.stl"
    triangles = [
        ((i * 2.0, 0, 0), (i * 2.0 + 1, 0, 0), (i * 2.0, 1, 0))
        for i in range(_MAX_FUSE_LOOPS + 1)
    ]
    _binary(path, triangles)
    scene = Scene()
    history = History(scene)

    history.execute(SnapshotImport(lambda s: stl_format.load_stl(s, path)))

    assert history.last_error is None
    assert not scene.mesh.faces
    assert len(scene.groups) == 1
    assert len(scene.groups[0].mesh.faces) == len(triangles)
    assert history.undo()
    assert not scene.groups
    assert history.redo()
    assert len(scene.groups) == 1


@pytest.mark.parametrize("plane", ["XY", "XZ", "YZ"])
def test_simplify_merges_large_coplanar_surface_on_principal_planes(
        tmp_path, plane):
    path = tmp_path / f"flat_grid_{plane}.stl"

    def point(x, y):
        return {
            "XY": (x, y, 0),
            "XZ": (x, 0, y),
            "YZ": (0, x, y),
        }[plane]

    triangles = []
    for x in range(21):
        for y in range(10):
            a = point(x, y)
            b = point(x + 1, y)
            c = point(x + 1, y + 1)
            d = point(x, y + 1)
            triangles.extend(((a, b, c), (a, c, d)))
    _binary(path, triangles)
    scene = Scene()

    stl_format.load_stl(scene, path, simplify_mode="principal")

    assert len(triangles) > 400
    assert len(scene.mesh.faces) == 1
    assert len(scene.mesh.vertices) == 4
    expected_bounds = {
        "XY": (0, 21, 0, 10, 0, 0),
        "XZ": (0, 21, 0, 0, 0, 10),
        "YZ": (0, 0, 0, 21, 0, 10),
    }
    expected_normals = {
        "XY": QVector3D(0, 0, 1),
        "XZ": QVector3D(0, -1, 0),
        "YZ": QVector3D(1, 0, 0),
    }
    assert _bounds(scene) == pytest.approx(expected_bounds[plane])
    normal = scene.mesh.faces[0].normal()
    assert QVector3D.dotProduct(normal, expected_normals[plane]) == \
        pytest.approx(1.0)


def test_advanced_simplification_merges_any_coplanar_surface(tmp_path):
    path = tmp_path / "tilted_grid.stl"

    def point(x, y):
        return (x, y, x + y)

    a, b, c, d = point(0, 0), point(1, 0), point(1, 1), point(0, 1)
    _binary(path, [(a, b, c), (a, c, d)])

    principal_scene = Scene()
    stl_format.load_stl(principal_scene, path, simplify_mode="principal")
    assert len(principal_scene.mesh.faces) == 2

    advanced_scene = Scene()
    stl_format.load_stl(advanced_scene, path, simplify_mode="all")
    assert len(advanced_scene.mesh.faces) == 1
    assert len(advanced_scene.mesh.vertices) == 4


def test_simplify_keeps_curved_facets_separate(tmp_path):
    path = tmp_path / "curved_strip.stl"
    triangles = []
    segments = 405
    for index in range(segments):
        a0 = math.pi * index / segments
        a1 = math.pi * (index + 1) / segments
        a = (10 * math.cos(a0), 10 * math.sin(a0), 0)
        b = (10 * math.cos(a1), 10 * math.sin(a1), 0)
        c = (10 * math.cos(a1), 10 * math.sin(a1), 1)
        d = (10 * math.cos(a0), 10 * math.sin(a0), 1)
        triangles.extend(((a, b, c), (a, c, d)))
    _binary(path, triangles)
    scene = Scene()

    stl_format.load_stl(scene, path, simplify_mode="all")

    assert len(scene.groups) == 1
    assert segments < len(scene.groups[0].mesh.faces) < segments * 2


def test_exploded_stl_group_can_be_simplified_as_an_undoable_edit(tmp_path):
    from core.history import ExplodeGroupCommand, SimplifyMeshCommand

    path = tmp_path / "large_flat_grid.stl"
    triangles = []
    for x in range(21):
        for y in range(10):
            a, b = (x, y, 0), (x + 1, y, 0)
            c, d = (x + 1, y + 1, 0), (x, y + 1, 0)
            triangles.extend(((a, b, c), (a, c, d)))
    _binary(path, triangles)
    scene = Scene()
    history = History(scene)

    stl_format.load_stl(scene, path)
    assert len(scene.groups) == 1
    history.execute(ExplodeGroupCommand(scene.groups[0]))
    assert not scene.groups
    assert len(scene.mesh.faces) == len(triangles)

    history.execute(SimplifyMeshCommand())

    assert history.last_error is None
    assert len(scene.mesh.faces) == 1
    assert history.undo()
    assert len(scene.mesh.faces) == len(triangles)
    assert history.redo()
    assert len(scene.mesh.faces) == 1
