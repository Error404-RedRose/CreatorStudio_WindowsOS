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

const castSnippet = fs.readFileSync("tools/_cast-snippet.txt", "utf8");

edit("src/renderer/game/Game.ts", [
  [
    'import { ViewModel } from "./combat/ViewModel";',
    'import { ViewModel } from "./combat/ViewModel";\nimport { MagicSystem, SPELLS } from "./combat/Magic";',
  ],
  [
    "  private readonly weapon = new PlayerWeapon();",
    "  private readonly weapon = new PlayerWeapon();\n  readonly magic = new MagicSystem();",
  ],
  [
    "    this.weapon.reset();\n    this.giveStarterKit();",
    "    this.weapon.reset();\n    this.magic.reset();\n    this.giveStarterKit();",
  ],
  [
    "    this.updateCombat(dt);\n    if (this.phase !== \"run\") return;",
    "    const arcaneRank = this.survival.perkRank(\"arcane\");\n    this.magic.update(dt, 1 + arcaneRank * 0.3, 100 + arcaneRank * 25);\n    this.updateCombat(dt);\n    if (this.phase !== \"run\") return;",
  ],
  [
    "  private updateCombat(dt: number): void {\n    this.weapon.update(dt);\n    if (!this.combatEnabled) return;",
    "  private updateCombat(dt: number): void {\n    this.weapon.update(dt);\n    if (this.input.consume(\"cycleSpell\")) {\n      const spell = this.magic.cycle();\n      this.audio.ui();\n      this.hud.toast(spell.name + \" - \" + spell.cost + \" mana\", 1.6);\n    }\n    if (this.input.consume(\"cast\")) this.castSpell();\n    if (!this.combatEnabled) return;",
  ],
  ["  private switchWeaponSlot(index: number): void {", castSnippet + "  private switchWeaponSlot(index: number): void {"],
  [
    "    this.survivalHud.setArsenal(",
    "    this.survivalHud.setSpell(\n      this.magic.current.name,\n      this.magic.mana,\n      this.magic.maxMana,\n      this.magic.cooldown(this.magic.current.id),\n    );\n    this.survivalHud.setArsenal(",
  ],
  [
    "      seed: this.survival.worldSeed,",
    "      magic: this.magic.mana,\n      maxMana: this.magic.maxMana,\n      spell: this.magic.current.id,\n      spellName: this.magic.current.name,\n      seed: this.survival.worldSeed,",
  ],
]);

edit("src/renderer/game/audio/Audio.ts", [
  [
    "  hurt(): void {",
    "  /** Spell cast: a short rising synth tone coloured by the spell family. */\n  spell(kind: \"bolt\" | \"nova\" | \"heal\" | \"lance\"): void {\n    const base = kind === \"heal\" ? 520 : kind === \"nova\" ? 360 : kind === \"lance\" ? 210 : 760;\n    this.tone(base, 0.16, 0.085, \"sine\", base * 2.3);\n    window.setTimeout(() => this.tone(base * 1.45, 0.22, 0.05, \"triangle\"), 40);\n  }\n\n  hurt(): void {",
  ],
]);
