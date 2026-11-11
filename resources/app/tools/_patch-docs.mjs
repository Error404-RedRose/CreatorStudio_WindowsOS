import fs from "node:fs";

function edit(file, pairs) {
  let source = fs.readFileSync(file, "utf8");
  for (const [from, to] of pairs) {
    if (!source.includes(from)) throw new Error(`missing anchor in ${file}: ${from.slice(0, 80)}`);
    source = source.replace(from, to);
  }
  fs.writeFileSync(file, source);
  console.log(`${file}: ${pairs.length} edits`);
}

edit("README.md", [
  [
    "  while falling to glide.",
    "  while falling to glide.\n- **Spellcasting** — four spells on F, X to cycle: Emberbolt, Frost Nova, Mending Light and Storm Lance. Mana regenerates, cooldowns are visible, and the Arcane Attunement perk raises the pool and damage.",
  ],
  [
    "- **Drivable county sedan, work van and dirt kart**",
    "- **Drivable county sedan, work van, dirt kart and helicopter**",
  ],
  [
    "  and fuel. (Home-town vehicles for now; streamed wrecks remain lootable.)",
    "  and fuel. The Mosswood Whirlybird waits on the east verge: Space rises, Ctrl descends, W/S flies and A/D yaws; land before pressing E to get out. (Home-town vehicles for now; streamed wrecks remain lootable.)",
  ],
  [
    "- **Sword combos and guard**",
    "- **Directional sword combat and parry**",
  ],
  [
    "  guard instead of attacking, cutting incoming damage and preventing bleeding.",
    "  guard instead of attacking. W/A/S/D at the swing picks thrust, left/right slash, rising cut or overhead; each has its own reach, arc and damage. Guard inside the opening window to parry a hit completely.",
  ],
  [
    "- **Nature reclaiming the world**",
    "- **Claim any building** — walk into a generated house, store, barn or safehouse and press E to make it your base. Press B to build bed, stash, workbench, rain collector, garden and barricades. Relocating abandons the old upgrades.\n- **Nature reclaiming the world**",
  ],
  [
    "  Night Owl, Toxin Filter, Grapple Master, Broom Witch, Second Wind and Lucky Find.",
    "  Night Owl, Toxin Filter, Grapple Master, Broom Witch, Second Wind, Lucky Find and Arcane Attunement.",
  ],
  [
    "| G | Grapple hook |",
    "| G | Grapple hook |\n| F / X | Cast the selected spell / cycle spells |",
  ],
  [
    "| E | Search containers, talk to survivors, claim the safehouse, sleep, use stations, drive / exit a car |",
    "| E | Search containers, talk to survivors, claim a building, sleep, use stations, drive / exit a vehicle |",
  ],
  [
    "| B | Safehouse: build upgrades, sleep, stash, crafting |",
    "| B | Base: build upgrades, sleep, stash, crafting |",
  ],
  [
    "| Space (airborne, with broom) | Glide |",
    "| Space (airborne, with broom) | Glide |\n| Space / Ctrl (helicopter) | Rise / descend |",
  ],
]);

edit("DESIGN.md", [
  [
    "- Claimable safehouse with bed, stash, workbench, rain collector, garden, barricades and\n  comfort upgrades.",
    "- Claimable base in any generated house, store, barn, cabin or the home safehouse; press E\n  inside a building zone and B to build. Relocating a base leaves the old upgrades behind.\n- Bed, stash, workbench, rain collector, garden, barricades and comfort upgrades.",
  ],
  [
    "- Katana combo finisher and right-mouse guard.",
    "- Directional katana attacks (thrust, left/right slash, rising cut, overhead) with reach,\n  arc and damage tradeoffs; combo finisher and right-mouse guard.\n- Guard opening window parries a hit completely and staggers the exchange; Arcane Attunement\n  and Brawler feed the melee layer.",
  ],
  [
    "- Weapon and ammo crafting, rarity-coloured weapon loot.",
    "- Spellcasting: Emberbolt, Frost Nova, Mending Light and Storm Lance; mana pool, regen and\n  per-spell cooldowns; F cast, X cycle; HUD mana strip and Arcane Attunement perk.\n- Weapon and ammo crafting, rarity-coloured weapon loot.",
  ],
  [
    "- Drivable County Sedan, Work Van and Dirt Kart; fuel, hull health, collision damage.\n- Fuel cans and repair kits, used while seated; HUD speed/fuel/hull.",
    "- Drivable County Sedan, Work Van, Dirt Kart and Mosswood Whirlybird helicopter; fuel,\n  hull health, collision damage, helicopter lift/altitude and rotor animation.\n- Fuel cans and repair kits, used while seated; HUD speed/fuel/hull/altitude.",
  ],
  [
    "- Emberfall title, field-instrument HUD: compass, vitals, level/XP, weapon slots,\n  FPS/draw calls/triangles, vehicle readout, hardcore badge.",
    "- Emberfall title, field-instrument HUD: compass, vitals, level/XP, weapon slots, spell\n  strip and mana, FPS/draw calls/triangles, vehicle readout, hardcore badge.",
  ],
  [
    "| 2 \u2014 Combat core | **Partial**: hitscan, pellets, melee combo and guard; no weapon-trace sweeps, directional parry, poise or stamina |",
    "| 2 \u2014 Combat core | **Partial**: hitscan, pellets, directional katana attacks, combo, guard and parry; no weapon-trace sweeps, poise or stamina chip |",
  ],
  [
    "| 6 \u2014 Vehicles and repair | **Partial**: cars/van/kart, fuel/hull, repair kits, trunks; no helicopter, no per-part engine/wheel module repair |",
    "| 6 \u2014 Vehicles and repair | **Partial**: cars/van/kart, helicopter, fuel/hull/altitude, repair kits, trunks; no per-part engine/wheel module repair |",
  ],
  [
    "| 9 \u2014 Perks, magic, weapon variants/skins | **Partial**: perks done, broom/wraith fantasy layer; no spellcasting, affix-generated weapon variants or skins |",
    "| 9 \u2014 Perks, magic, weapon variants/skins | **Partial**: perks and four-spell magic done; no affix-generated weapon variants or skins |",
  ],
  [
    "1. Claiming/building a base in any generated house (safehouse only today).\n2. Worker-thread chunk meshing and ring LOD.",
    "1. Worker-thread chunk meshing and ring LOD.",
  ],
]);
