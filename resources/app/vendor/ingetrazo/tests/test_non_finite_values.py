# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2026 Marco Sumari Tellez and IngeTrazo contributors.
"""Issue #185 (Alejandro Limón, by email): NaN coordinates stalled the
drawing tools and a document damaged that way could be saved. First
line of defence: the value box never hands a tool an infinity (a number
too long for a float came back as inf, and inf − inf is NaN), and saving
never writes a NaN — the file on disk keeps its last good version."""
from __future__ import annotations

import json
import math

import pytest
from PySide6.QtGui import QVector3D
from PySide6.QtWidgets import QApplication

if QApplication.instance() is None:
    QApplication([])

from core.scene import Scene  # noqa: E402
from formats import igz  # noqa: E402
from views.viewport import Viewport, _parse_length_field  # noqa: E402


@pytest.mark.parametrize("typed", ["9" * 400, "9" * 400 + ";1", "1;" + "9" * 400,
                                   "9" * 400 + ":12", "1:" + "9" * 400])
def test_the_value_box_refuses_a_number_too_long_for_a_float(typed):
    assert Viewport._parse_value_buffer(typed) is None


def test_ordinary_numbers_still_parse():
    from core import units
    units.bind_scene(Scene())                         # metres, whatever ran before
    try:
        assert Viewport._parse_value_buffer("2.5") == pytest.approx(2.5)
    finally:
        units.bind_scene(None)
    assert _parse_length_field("3/4\"") == pytest.approx(0.75 * 0.0254)
    assert Viewport._parse_value_buffer("1e5") is None   # never was a form


def test_a_nan_is_never_saved_and_the_old_file_survives(tmp_path):
    path = tmp_path / "reja.igz"
    scene = Scene()
    scene.mesh.add_face([QVector3D(0, 0, 0), QVector3D(1, 0, 0),
                         QVector3D(1, 1, 0)])
    igz.save_scene(scene, path)
    good = path.read_bytes()
    scene.mesh.vertices[0].position.setX(math.nan)   # a damaged point
    with pytest.raises(igz.NonFiniteDocumentError) as err:
        igz.save_scene(scene, path)
    assert "scene" in err.value.where
    assert path.read_bytes() == good                  # untouched on disk
    assert not (tmp_path / "reja.igz.part").exists()


def test_a_clean_document_is_strict_json(tmp_path):
    path = tmp_path / "ok.igz"
    scene = Scene()
    scene.mesh.add_edge(QVector3D(0, 0, 0), QVector3D(2, 0, 0))
    igz.save_scene(scene, path)
    json.loads(path.read_text(), parse_constant=lambda c: pytest.fail(c))
