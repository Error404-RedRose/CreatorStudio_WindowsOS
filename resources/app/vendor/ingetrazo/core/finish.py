# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2026 Marco Sumari Tellez and IngeTrazo contributors.
"""A material's FINISH: how its surface answers light (issue #181).

The viewport paints a colour or a picture; a photorealistic render also
needs to know whether that surface is matte plaster, polished marble,
steel, glass or water. IngeTrazo stores that per named material
(``Material.finish`` in the document's registry); where nobody chose one,
it is guessed from the material's name and its picture's file name, which
already say it in most models («water_calm», «[Water Pool Light]»,
«Metal_10_1K», «Marble_07»…), and a translucent paint reads as glass.

The finish travels in the GLB twice: as plain glTF (roughness, metalness,
and ``KHR_materials_transmission``/``ior`` for glass and water), which any
program understands, and as ``extras["ingetrazo_finish"]``, which the
Render with Blender script turns into a full Blender material.
"""
from __future__ import annotations

import re
from typing import Optional

#: ``auto`` means "guess"; the rest are what a user can pick.
FINISHES = ("matte", "satin", "gloss", "metal", "glass", "water")
AUTO = "auto"

#: English labels for the menu (translated with tr() where shown).
LABELS = {
    AUTO: "Automatic (from the name)",
    "matte": "Matte",
    "satin": "Satin",
    "gloss": "Gloss",
    "metal": "Metal",
    "glass": "Glass",
    "water": "Water",
}

#: glTF PBR values per finish: (roughness, metallic, transmission, ior).
PBR = {
    "matte": (0.9, 0.0, 0.0, 1.5),
    "satin": (0.45, 0.0, 0.0, 1.5),
    "gloss": (0.12, 0.0, 0.0, 1.5),
    "metal": (0.3, 1.0, 0.0, 1.5),
    "glass": (0.02, 0.0, 1.0, 1.45),
    "water": (0.03, 0.0, 0.0, 1.33),
}

# Keywords, Spanish / English / Portuguese, matched as whole words or word
# starts in the name and the picture's file name. Order matters: water and
# glass before gloss (a «vidrio pulido» is glass), metal before gloss.
_WORDS = (
    # Short words must end there: «mar» is the sea, «Marble» is stone.
    ("water", r"agua|water|pool|piscina|pileta|espejo[_ ]de[_ ]agua|"
              r"(?:lago|lake|mar|sea)(?![a-záéíóúñç])|ocean|oc[eé]ano|[aá]gua"),
    ("glass", r"vidri|glass|cristal|crystal|vitral|window[_ ]?pane|"
              r"mampara|vidro"),
    ("metal", r"metal|acero|steel|a[cç]o(?![a-záéíóúñç])|alumin|hierro|"
              r"iron|ferro|chrom|"
              r"cromo|inox|bronce|bronze|cobre|copper|lat[oó]n|brass|"
              r"galvaniz|zinc|zinco|titani"),
    ("gloss", r"m[aá]rmol|marble|m[aá]rmore|granit|porcel|cer[aá]mic|"
              r"ceramic|azulej|tile|lacad|lacquer|laca|pulid|polish|"
              r"brillant|glossy|pl[aá]stic|acr[ií]lic|esmalt|enamel|"
              r"lacquered|gleam"),
    ("satin", r"madera|wood|madeira|parquet|parquet|laminad|laminate|"
              r"cuero|leather|couro|satin|satinad|semi"),
)
_RX = [(f, re.compile(r"(?:^|[^a-záéíóúñç])(?:" + pat + r")", re.IGNORECASE))
       for f, pat in _WORDS]


def guess(name: str | None, picture: str | None = None,
          opacity: float | None = None) -> str:
    """The finish a material most likely has, from what it is called."""
    for text in (name, picture):
        if not text:
            continue
        low = str(text).replace("-", "_")
        for finish, rx in _RX:
            if rx.search(low):
                return finish
    if opacity is not None and opacity < 0.999:
        return "glass"
    return "matte"


def resolve(chosen: Optional[str], name: str | None,
            picture: str | None = None,
            opacity: float | None = None) -> str:
    """The finish to use: the user's choice, or the guess when it is
    ``auto``/absent/unknown."""
    if chosen in FINISHES:
        return chosen
    return guess(name, picture, opacity)
