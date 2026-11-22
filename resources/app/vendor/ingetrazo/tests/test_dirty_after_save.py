# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2026 Marco Sumari Tellez and IngeTrazo contributors.
"""Issue #159 (@pacaeiro): open a drawing, erase the scale figure, Ctrl+S,
close -- "there are unsaved changes", three times in a row. The document was
clean after the save; the next click (on empty space, on an object, in the
Components list) changed the SELECTION, and every selection change bumped
``scene.version``, which is also what "unsaved changes" compared. Selecting
is not editing: only a change of the document may make it dirty."""
from __future__ import annotations

from pathlib import Path

import pytest
from PySide6.QtGui import QVector3D
from PySide6.QtWidgets import QApplication

_app = QApplication.instance() or QApplication([])


@pytest.fixture
def doc(tmp_path):
    from core.group import Group
    from core.mesh import Mesh
    from views.main_window import MainWindow

    w0 = MainWindow()
    scene = w0.viewport.scene
    for i in range(6):
        m = Mesh()
        x = i * 3.0
        m.add_face([QVector3D(x, 0, 0), QVector3D(x + 2, 0, 0),
                    QVector3D(x + 2, 2, 0), QVector3D(x, 2, 0)])
        scene.groups.append(Group(m, name=f"B{i}"))
    scene.version += 1
    path = tmp_path / "plan.igz"
    w0._do_save(path)
    w0._saved_version = scene.version
    w0.close()
    return path


def _window(path):
    from views.main_window import MainWindow

    win = MainWindow()
    assert win.open_path(path)
    return win


def test_selection_after_ctrl_s_does_not_ask_to_save_again(doc):
    win = _window(doc)
    scene = win.viewport.scene
    try:
        figure = scene.groups[0]                  # the scale figure travels with it
        scene.select([figure])
        win._on_delete_selection()                # erase it: a real edit
        assert win._is_dirty()
        win._on_save()                            # Ctrl+S
        assert not win._is_dirty()
        # what a user does before closing: click empty space, click an
        # object, Ctrl+Shift+I, Esc
        scene.clear_selection()
        scene.select([scene.groups[0]])
        scene.select([], mode="replace")
        scene.invert_selection()
        scene.clear_selection()
        assert not win._is_dirty(), "a selection made the saved drawing 'modified'"
        assert "*" not in win.windowTitle()

        # the inverse: a real edit after the save does make it dirty
        scene.select([scene.groups[0]])
        win._on_delete_selection()
        assert win._is_dirty()
    finally:
        win._confirm_discard = lambda *a, **k: True   # never a modal on close
        win.close()


def test_selection_keeps_bumping_the_render_version(doc):
    """The GL colour caches key on scene.version: a selection must still
    bump it, only not count as an edit."""
    win = _window(doc)
    scene = win.viewport.scene
    try:
        before, content = scene.version, scene.content_version
        scene.select([scene.groups[0]])
        assert scene.version == before + 1
        assert scene.content_version == content
    finally:
        win._confirm_discard = lambda *a, **k: True   # never a modal on close
        win.close()


def test_marking_saved_with_scene_version_still_means_clean(doc):
    """Every caller (and 100+ tests) marks "saved" by assigning the scene
    version; after selections that must still read as clean."""
    win = _window(doc)
    scene = win.viewport.scene
    try:
        scene.select([scene.groups[0]])
        scene.clear_selection()
        win._saved_version = scene.version
        assert not win._is_dirty()
        win._saved_version = -1                   # "never saved" stays dirty
        assert win._is_dirty()
    finally:
        win._confirm_discard = lambda *a, **k: True   # never a modal on close
        win.close()
