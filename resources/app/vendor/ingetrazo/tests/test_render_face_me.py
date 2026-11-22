# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2026 Marco Sumari Tellez and IngeTrazo contributors.
"""Render with Blender and the figures that follow you (#181; Marco:
«para imágenes que te siguen con transparencias no renderiza bien, o
renderiza como si fuera una foto»). A face-me figure nested in a group
reached Blender as a flat card in its saved orientation, and its PNG's
transparent texels came out solid. Now the render turns every face-me —
at any depth — toward its camera, and the GLB marks cut-out images MASK
and translucent paint BLEND."""
from __future__ import annotations

import json
import math
import struct

from PySide6.QtCore import Qt
from PySide6.QtGui import QColor, QImage, QMatrix4x4, QVector3D
from PySide6.QtWidgets import QApplication

if QApplication.instance() is None:
    QApplication([])

from core.group import Group, make_billboard_group  # noqa: E402
from core.mesh import Mesh  # noqa: E402
from core.scene import Scene  # noqa: E402
from formats.gltf import save_glb  # noqa: E402
from formats.meshexport import world_faces  # noqa: E402

V = QVector3D


def _png(path, see_through: bool):
    img = QImage(8, 8, QImage.Format_ARGB32)
    img.fill(QColor(200, 150, 100, 255))
    if see_through:
        for x in range(8):
            img.setPixelColor(x, 0, QColor(0, 0, 0, 0))
    img.save(str(path))
    return path


def _figure_in_a_group(tmp_path):
    """A face-me figure placed INSIDE a component, as in the Yanque plaza."""
    scene = Scene()
    fig = make_billboard_group(str(_png(tmp_path / "fig.png", True)),
                               1.7, "figure", 0.5)
    parent = Group(Mesh(), name="plaza")
    parent.xform = QMatrix4x4()
    parent.xform.translate(10, 0, 0)
    fig.xform = QMatrix4x4()
    parent.children = [fig]
    scene.groups.append(parent)
    return scene


def _figure_faces(faces):
    return [f for f in faces if f.attrs.get("texture")]


def test_a_nested_figure_turns_toward_the_camera(tmp_path):
    scene = _figure_in_a_group(tmp_path)
    for eye in (V(10, -20, 1.7), V(30, 0, 1.7), V(-5, 15, 1.7)):
        faces = _figure_faces(world_faces(scene, lambda a, e=eye: e - a))
        assert len(faces) == 1
        f = faces[0]
        c = f.centroid()
        n, to_eye = f.normal(), eye - c
        n2 = math.hypot(n.x(), n.y())
        t2 = math.hypot(to_eye.x(), to_eye.y())
        cos = (n.x() * to_eye.x() + n.y() * to_eye.y()) / (n2 * t2)
        assert cos > 0.999                      # it looks straight at the eye
        assert abs(min(v.z() for v in f.vertices)) < 1e-6   # feet on the floor


def test_without_a_camera_exports_leave_face_me_figures_as_before(tmp_path):
    scene = Scene()
    scene.groups.append(make_billboard_group(
        str(_png(tmp_path / "fig.png", True)), 1.7, "figure", 0.5))
    assert _figure_faces(world_faces(scene)) == []
    assert len(_figure_faces(world_faces(scene, lambda a: V(0, -9, 0) - a))) == 1


def _glb_json(path):
    data = path.read_bytes()
    n = struct.unpack_from("<I", data, 12)[0]
    return json.loads(data[20:20 + n])


def test_cut_out_images_are_masked_and_opaque_ones_are_not(tmp_path):
    scene = Scene()
    m = scene.mesh
    for x, name, cut in ((0, "leaf.png", True), (3, "photo.png", False)):
        f = m.add_face([V(x, 0, 0), V(x + 1, 0, 0), V(x + 1, 0, 1), V(x, 0, 1)])
        f.attrs["texture"] = {"path": str(_png(tmp_path / name, cut)),
                              "sw": 1.0, "sh": 1.0}
    glass = m.add_face([V(6, 0, 0), V(7, 0, 0), V(7, 0, 1), V(6, 0, 1)])
    glass.attrs["color"] = (0.6, 0.8, 0.9)
    glass.attrs["opacity"] = 0.3
    out = tmp_path / "m.glb"
    save_glb(scene, out)
    mats = {m_["name"]: m_ for m_ in _glb_json(out)["materials"]}
    by_mode = {m_.get("alphaMode", "OPAQUE") for m_ in mats.values()}
    assert by_mode == {"MASK", "OPAQUE", "BLEND"}
    blend = next(m_ for m_ in mats.values() if m_.get("alphaMode") == "BLEND")
    assert blend["pbrMetallicRoughness"]["baseColorFactor"][3] == 0.3
    mask = next(m_ for m_ in mats.values() if m_.get("alphaMode") == "MASK")
    assert mask["alphaCutoff"] == 0.5


def test_a_simple_figure_keeps_its_picture_corner_to_corner(tmp_path):
    """Sumari (a plain face-me quad) came out as two thin halves: its
    planar texture stayed anchored to the world while the quad turned.
    Rebuilt like the viewport's, the image spans it exactly once, upright,
    from any side — and far from the origin too."""
    from core.texture import affine_uv
    scene = Scene()
    scene.groups.append(make_billboard_group(
        str(_png(tmp_path / "sumari.png", True)), 1.8, "Sumari", 0.45,
        position=V(137.3, -48.9, 2.0)))
    for eye in (V(137.3, -80, 3), V(170, -40, 3), V(120, -20, 3)):
        (f,) = _figure_faces(world_faces(scene, lambda a, e=eye: e - a))
        uvs = affine_uv(f.attrs["texture"]["uvw"], f.vertices)
        us = sorted(round(u, 6) for u, _v in uvs)
        vs = sorted(round(v, 6) for _u, v in uvs)
        assert us == [0.0, 0.0, 1.0, 1.0] and vs == [0.0, 0.0, 1.0, 1.0]
        low = [p for p, (_u, v) in zip(f.vertices, uvs) if abs(v) < 1e-6]
        assert all(abs(p.z() - 2.0) < 1e-6 for p in low)   # v = 0 at the feet
        # u runs left to right as seen from the eye: the picture is not
        # mirrored.
        (u0p,) = [p for p, (u, v) in zip(f.vertices, uvs)
                  if abs(u) < 1e-6 and abs(v) < 1e-6]
        (u1p,) = [p for p, (u, v) in zip(f.vertices, uvs)
                  if abs(u - 1) < 1e-6 and abs(v) < 1e-6]
        to_eye = eye - f.centroid()
        # The viewer looks along -to_eye; their right hand is up × to_eye.
        right = QVector3D.crossProduct(QVector3D(0, 0, 1), to_eye)
        assert QVector3D.dotProduct(u1p - u0p, right) > 0
