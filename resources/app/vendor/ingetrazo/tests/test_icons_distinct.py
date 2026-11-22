# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2026 Marco Sumari Tellez and IngeTrazo contributors.
"""Every tool key still draws an icon, the standard views are told apart,
and the Solid Tools cursor draws every state -- after the toolbar icons
were redesigned as IngeTrazo's own (camera, walk, look around, standard
views, solid tools, text, eraser, zoom extents, dimensions, pie, freehand,
rotated rectangle)."""
from __future__ import annotations

import pytest


@pytest.fixture(scope="module")
def app():
    from PySide6.QtWidgets import QApplication
    return QApplication.instance() or QApplication([])


def _pixels(icon):
    img = icon.pixmap(48, 48).toImage()
    return bytes(img.constBits())[: img.sizeInBytes()]


def test_every_tool_key_returns_a_drawn_icon(app):
    from views import icons

    assert icons._DRAW, "no icons registered"
    for key in icons._DRAW:
        icon = icons.tool_icon(key)
        assert not icon.isNull(), key
        assert any(_pixels(icon)), f"{key} draws nothing"
    assert icons.tool_icon("no-such-tool").isNull()


def test_the_standard_views_are_all_different(app):
    from views import icons

    views = ["view_iso", "view_top", "view_bottom", "view_front",
             "view_back", "view_right", "view_left"]
    drawn = {key: _pixels(icons.tool_icon(key)) for key in views}
    assert len(set(drawn.values())) == len(views), "two views draw the same"


def test_the_solid_tools_are_all_different(app):
    from views import icons

    keys = list(icons._SOLID_ICONS)
    assert len(keys) == 6
    drawn = {key: _pixels(icons.tool_icon(key)) for key in keys}
    assert len(set(drawn.values())) == len(keys)


def test_the_solid_cursor_draws_every_state(app):
    from views import icons

    for state in ("no", "1", "2"):
        cursor = icons.solid_cursor(state)
        assert not cursor.pixmap().isNull(), state
