"""Orbit turns around what you are looking at, not the world origin (#164).

«Instead of orbiting around the center of the current view it seems like
it's orbiting around origin, which for a larger model is far away.» Each
orbit gesture now picks its pivot once, at the press: the model point
under the cursor, else the middle of what is on screen, else the target —
and the whole camera turns rigidly about it, so that point stays put."""
from __future__ import annotations

import math

from PySide6.QtCore import QPointF, Qt
from PySide6.QtGui import QMouseEvent, QVector3D as V
from PySide6.QtWidgets import QApplication

_app = QApplication.instance() or QApplication([])

W, H = 800, 600


def _box(scene, x0, y0, z0, x1, y1, z1):
    p = [V(x0, y0, z0), V(x1, y0, z0), V(x1, y1, z0), V(x0, y1, z0),
         V(x0, y0, z1), V(x1, y0, z1), V(x1, y1, z1), V(x0, y1, z1)]
    for idx in ((0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5),
                (2, 3, 7, 6), (3, 0, 4, 7)):
        scene.mesh.add_face([p[i] for i in idx])
    scene.version += 1


def _ev(kind, x, y, button, buttons):
    return QMouseEvent(kind, QPointF(x, y), QPointF(x, y), button, buttons,
                       Qt.NoModifier)


def _drag(vp, x0, y0, x1, y1, button=Qt.MiddleButton):
    vp.mousePressEvent(_ev(QMouseEvent.MouseButtonPress, x0, y0, button, button))
    steps = 6
    for i in range(1, steps + 1):
        x = x0 + (x1 - x0) * i / steps
        y = y0 + (y1 - y0) * i / steps
        vp.mouseMoveEvent(_ev(QMouseEvent.MouseMove, x, y, Qt.NoButton, button))
    vp.mouseReleaseEvent(_ev(QMouseEvent.MouseButtonRelease, x1, y1, button,
                             Qt.NoButton))


def _screen(vp, p: V):
    cam = vp.camera
    ndc = (cam.projection_matrix() * cam.view_matrix()).map(p)
    return ((ndc.x() + 1.0) * 0.5 * vp.width(), (1.0 - ndc.y()) * 0.5 * vp.height())


def _window_far_box():
    """A 10 m box at (500, 500), the camera aimed a little beside it: the
    target is NOT on the box, as after a pan or a zoom elsewhere."""
    from views.main_window import MainWindow
    win = MainWindow()
    vp = win.viewport
    vp.resize(W, H)
    vp.scene.mesh = type(vp.scene.mesh)()
    vp.scene.groups = []
    _box(vp.scene, 495, 495, 0, 505, 505, 10)
    cam = vp.camera
    cam.aspect = W / H
    cam.perspective = True
    cam.target = V(485, 490, 0)          # beside the box
    cam.distance = 60.0
    cam.yaw, cam.pitch = math.radians(-60), math.radians(25)
    return win, vp


def _close(win):
    win._saved_version = win.viewport.scene.version
    win.close()


def test_the_point_under_the_cursor_stays_put_while_orbiting():
    win, vp = _window_far_box()
    try:
        box_top = V(500, 500, 10)
        sx, sy = _screen(vp, box_top)
        assert 0 < sx < W and 0 < sy < H, "the box must be on screen"
        # the pivot is the face point under the cursor, on the box
        pivot = vp._orbit_pivot_at(sx, sy)
        assert (pivot - box_top).length() < 1.0, pivot
        before = (vp.camera.yaw, vp.camera.pitch)
        _drag(vp, sx, sy, sx + 120, sy + 60)
        assert (vp.camera.yaw, vp.camera.pitch) != before, "it did not orbit"
        ax, ay = _screen(vp, pivot)
        assert abs(ax - sx) < 1.5 and abs(ay - sy) < 1.5, (sx, sy, ax, ay)
        assert vp._orbit_pivot is None, "the pivot outlived its gesture"
    finally:
        _close(win)


def test_the_orbit_tool_drag_turns_about_the_same_pivot():
    win, vp = _window_far_box()
    try:
        vp.set_nav_mode("orbit")
        box_corner = V(505, 495, 10)
        sx, sy = _screen(vp, box_corner)
        pivot = vp._orbit_pivot_at(sx, sy)
        _drag(vp, sx, sy, sx - 90, sy + 40, Qt.LeftButton)
        ax, ay = _screen(vp, pivot)
        assert abs(ax - sx) < 1.5 and abs(ay - sy) < 1.5
    finally:
        _close(win)


def test_over_empty_sky_it_turns_about_the_middle_of_the_model_not_the_origin():
    win, vp = _window_far_box()
    try:
        vp.camera.target = V(500, 500, 5)        # the box in the middle
        pivot = vp._orbit_pivot_at(5, 5)          # a corner: sky
        assert (pivot - V(500, 500, 5)).length() < 12.0, pivot
        assert pivot.length() > 600, "it pivoted on the world origin"
    finally:
        _close(win)


def test_an_empty_scene_turns_about_the_target():
    from views.main_window import MainWindow
    win = MainWindow()
    vp = win.viewport
    try:
        vp.resize(W, H)
        vp.scene.mesh = type(vp.scene.mesh)()
        vp.scene.groups = []
        vp.scene.version += 1
        vp.camera.target = V(3, 4, 5)
        assert vp._orbit_pivot_at(W / 2, H / 2) == V(3, 4, 5)
    finally:
        _close(win)


def test_orbit_about_keeps_distance_level_horizon_and_the_pivot():
    from core.camera import OrbitCamera
    cam = OrbitCamera()
    cam.target = V(10, 0, 0)
    cam.distance = 30.0
    pivot = V(12, 3, 1)
    rel_before = (pivot - cam.eye()).length()
    cam.orbit_about(pivot, 50, -30, 600)
    assert abs(cam.distance - 30.0) < 1e-9
    # rigid about the pivot: the eye keeps its distance to it
    assert abs((pivot - cam.eye()).length() - rel_before) < 1e-4   # QVector3D is float32
    # the pitch clamp still holds at the poles
    for _ in range(40):
        cam.orbit_about(pivot, 0, 400, 600)
    assert cam.pitch <= math.radians(89.0) + 1e-9
