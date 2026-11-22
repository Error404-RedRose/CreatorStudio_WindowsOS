# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2026 Marco Sumari Tellez and IngeTrazo contributors.
"""Issue #140 (@pacaeiro): rotating a circle whose diameter sits a little off
X, the arm could not be brought onto the red axis.

The line was 1.7° off X — inside the 3° axis magnet, but also inside the 3°
window of 'Through point' towards the reference he had just clicked, and
that rule ranks above the magnet: the arm stuck to the line's OWN direction
(−0.0°, −180.0°), the one rotation nobody asks for. Further out, a chord of
the other circle offered its 'Extension', which on a protractor arm only
turns the angle with the distance of the cursor.

A protractor arm is a direction from the centre, not a line being drawn:
the line-drawing inferences (through point, extension, from point) do not
apply to it. Points and the axes do.
"""
from __future__ import annotations

import math

from PySide6.QtGui import QVector3D

from core.scene import Scene
from core.snap import compute_snap


def V(x: float, y: float, z: float = 0.0) -> QVector3D:
    return QVector3D(float(x), float(y), float(z))


def _w2p(p: QVector3D):                    # plan view: x → right, y → up
    return (p.x() * 100.0, -p.y() * 100.0)


def _proj(cand):
    def proj(start, direction):
        d = direction.normalized()
        return start + d * QVector3D.dotProduct(cand - start, d)
    return proj


def _circle(scene, cx, r, n=24, curve=1):
    pts = [V(cx + r * math.cos(2 * math.pi * i / n),
             r * math.sin(2 * math.pi * i / n)) for i in range(n)]
    for i in range(n):
        e = scene.mesh.add_edge(pts[i], pts[(i + 1) % n])
        e.soft = True
        e.curve = curve


TILT = math.radians(1.7)
END = V(math.cos(TILT), math.sin(TILT))          # the diameter's end: the reference


def _pacaeiro_scene():
    scene = Scene()
    _circle(scene, 0.0, 1.0, curve=1)
    scene.mesh.add_edge(-END, END)               # the diameter, 1.7° off X
    _circle(scene, 4.0, 1.0, curve=2)            # the other circle, to the right
    return scene


def _arm(scene, cand, radial_arm):
    return compute_snap(
        cand, _w2p(cand), scene, _w2p, threshold_px=9.0,
        edge_threshold_px=14.0, start_point=V(0, 0),
        project_onto_line=_proj(cand), inference_angle_deg=3.0,
        magnetic_axis_deg=3.0, acquired_point=END, radial_arm=radial_arm,
    )


def test_the_arm_reaches_the_red_axis_through_the_reference_window():
    cand = V(-3.0, -0.02)                        # left, just below X
    r = _arm(_pacaeiro_scene(), cand, radial_arm=True)
    assert r.kind == "axis" and r.axis == "x", r.kind
    assert abs(r.point.y()) < 1e-6


def test_a_line_still_passes_through_the_point():
    # The Line tool keeps 'Through point': the rule is right for drawing.
    cand = V(-3.0, -0.02)
    r = _arm(_pacaeiro_scene(), cand, radial_arm=False)
    assert r.kind == "through_point"


def test_the_arm_still_lands_on_a_point():
    r = _arm(_pacaeiro_scene(), V(-1.0, -0.0297 + 0.001), radial_arm=True)
    assert r.kind == "endpoint"


def test_no_extension_on_the_arm():
    scene = Scene()
    scene.mesh.add_edge(V(2, 0.5), V(3, 0.5))    # a plain edge, off-centre
    cand = V(1.0, 0.5)                           # on its continuation
    r = compute_snap(cand, _w2p(cand), scene, _w2p, threshold_px=9.0,
                     edge_threshold_px=14.0, start_point=V(2, 0.5),
                     project_onto_line=_proj(cand), radial_arm=True)
    assert r.kind != "extension"


def test_a_curve_segment_is_never_extended():
    # Extending one chord of a circle (or of a smoothed sphere) is noise:
    # it is what sent the dashed line across the sphere in the video.
    scene = Scene()
    e = scene.mesh.add_edge(V(0, 0), V(2, 0))
    e.soft = True
    e.curve = 7
    r = compute_snap(V(3.0, 0.05), _w2p(V(3.0, 0.05)), scene, _w2p,
                     threshold_px=9.0, edge_threshold_px=14.0,
                     start_point=V(2, 0))
    assert r.kind != "extension"


def test_a_hidden_edge_is_never_extended():
    scene = Scene()
    e = scene.mesh.add_edge(V(0, 0), V(2, 0))
    e.hidden = True
    r = compute_snap(V(3.0, 0.05), _w2p(V(3.0, 0.05)), scene, _w2p,
                     threshold_px=9.0, edge_threshold_px=14.0,
                     start_point=V(2, 0))
    assert r.kind != "extension"


def test_rotate_and_protractor_ask_for_arm_inference():
    from tools.protractor import ProtractorBase
    from tools.rotate import RotateTool
    assert ProtractorBase.radial_arm is True
    assert RotateTool.radial_arm is True
