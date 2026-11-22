# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2026 Marco Sumari Tellez and IngeTrazo contributors.
"""Issue #191 (fafecm, Windows): «after the push/pull function cursor is
used once, the cursor symbol disappears upon its second and subsequent
use» — the Line too. Windows brought the arrow back over the native OpenGL
viewport when an operation ended, while Qt still believed the tool's
cursor was set. After every operation the viewport now unsets and sets the
tool's cursor again, and does the same when the pointer comes back in."""
from __future__ import annotations

import os

os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")

import pytest  # noqa: E402
from PySide6.QtCore import QPointF, Qt  # noqa: E402
from PySide6.QtGui import QMouseEvent  # noqa: E402
from PySide6.QtWidgets import QApplication  # noqa: E402

if QApplication.instance() is None:
    QApplication([])


@pytest.fixture
def window(monkeypatch, tmp_path):
    from core import extensions
    monkeypatch.setattr(extensions, "plugin_dirs", lambda: [tmp_path])
    from views.main_window import MainWindow
    win = MainWindow()
    yield win
    win._saved_version = win.viewport.scene.version
    win.close()


def _spy(vp, monkeypatch):
    calls = []
    real_unset = vp.unsetCursor
    monkeypatch.setattr(vp, "unsetCursor",
                        lambda: (calls.append("unset"), real_unset()))
    return calls


def _click(vp):
    return QMouseEvent(QMouseEvent.Type.MouseButtonPress, QPointF(50, 50),
                       QPointF(50, 50), Qt.LeftButton, Qt.LeftButton,
                       Qt.NoModifier)


def test_an_operation_puts_the_tool_cursor_back(window, monkeypatch):
    vp = window.viewport
    window._activate_tool("pushpull")
    tool = vp.active_tool
    from core.history import AddEdgeCommand
    from PySide6.QtGui import QVector3D as V
    monkeypatch.setattr(tool, "on_click", lambda ctx: vp.history.execute(
        AddEdgeCommand(V(0, 0, 0), V(1, 0, 0))))
    calls = _spy(vp, monkeypatch)
    vp._dispatch_tool_click(_click(vp))
    assert calls == ["unset"]                         # re-asserted…
    assert vp.cursor().shape() == Qt.BitmapCursor     # …as the tool's icon


def test_a_click_that_makes_nothing_leaves_the_cursor_alone(window,
                                                            monkeypatch):
    vp = window.viewport
    window._activate_tool("line")
    monkeypatch.setattr(vp.active_tool, "on_click", lambda ctx: None)
    calls = _spy(vp, monkeypatch)
    vp._dispatch_tool_click(_click(vp))
    assert calls == []


def test_coming_back_into_the_viewport_restores_it(window, monkeypatch):
    vp = window.viewport
    window._activate_tool("line")
    calls = _spy(vp, monkeypatch)
    from PySide6.QtGui import QEnterEvent
    vp.enterEvent(QEnterEvent(QPointF(5, 5), QPointF(5, 5), QPointF(5, 5)))
    assert calls == ["unset"]
    assert vp.cursor().shape() == Qt.BitmapCursor


def test_nothing_is_forced_while_a_camera_mode_owns_the_pointer(window,
                                                                monkeypatch):
    vp = window.viewport
    vp.set_nav_mode("orbit")
    calls = _spy(vp, monkeypatch)
    vp._reassert_tool_cursor()
    assert calls == []
