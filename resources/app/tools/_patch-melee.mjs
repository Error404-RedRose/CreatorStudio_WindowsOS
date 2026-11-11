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

const meleeSnippet = fs.readFileSync("tools/_melee-snippet.txt", "utf8");
const gameFile = "src/renderer/game/Game.ts";
let game = fs.readFileSync(gameFile, "utf8");
const start = game.indexOf("  private meleeAttack(): void {");
const end = game.indexOf("  private switchWeaponSlot(", start);
if (start < 0 || end < 0) throw new Error("melee block missing");
game = game.slice(0, start) + meleeSnippet + game.slice(end);
fs.writeFileSync(gameFile, game);
console.log("meleeAttack replaced");

edit(gameFile, [
  [
    "  private meleeComboAt = -99;",
    "  private meleeComboAt = -99;\n  private lastMeleeDirection = \"overhead\";\n  private lastParryAt = -99;\n  private parries = 0;\n  private guardStartedAt = -99;",
  ],
  [
    "    this.weapon.update(dt);\n    if (this.input.consume(\"cycleSpell\")) {",
    "    this.weapon.update(dt);\n    const guarding = this.weapon.isMelee && this.input.aimHeld;\n    if (guarding && this.guardStartedAt < 0) this.guardStartedAt = this.now;\n    if (!guarding) this.guardStartedAt = -99;\n    if (this.input.consume(\"cycleSpell\")) {",
  ],
  [
    "    this.viewModel.onFire();\n    if (this.weapon.isMelee) {\n      this.meleeAttack();",
    "    if (!this.weapon.isMelee) this.viewModel.onFire();\n    if (this.weapon.isMelee) {\n      this.meleeAttack();",
  ],
  [
    "  private damagePlayer(amount: number, _from: THREE.Vector3, _headshot: boolean): void {\n    if (!this.combatEnabled || this.phase !== \"run\" || this.survival.stats.health <= 0 || this.uiOpen) return;\n    const fortified = this.survival.baseClaimed && this.survival.upgrades.has(\"barricade\") && this.isNearBase();\n    const hardcore = this.survival.hardcore ? 1.25 : 1;\n    const tough = Math.pow(0.92, this.survival.perkRank(\"tough\"));\n    const toxin = Math.pow(0.7, this.survival.perkRank(\"toxin_filter\"));\n    const blocking = this.weapon.isMelee && this.input.aimHeld;\n    const actual = (fortified ? amount * 0.65 : amount) * hardcore * tough * (blocking ? 0.4 : 1);\n    this.survival.damage(actual, {\n      bleeding: this.rng() < 0.24 && !blocking ? 0.35 : 0,\n      infection: this.rng() < 0.16 ? 7 * toxin : 0,\n    });\n    this.combatHud.damage(actual);\n    this.audio.hurt();\n    this.rig.punchFov(-2.2);\n    if (this.survival.stats.health <= 0) this.die();\n  }",
    "  private damagePlayer(amount: number, from: THREE.Vector3, _headshot: boolean): void {\n    if (!this.combatEnabled || this.phase !== \"run\" || this.survival.stats.health <= 0 || this.uiOpen) return;\n    const fortified = this.survival.baseClaimed && this.survival.upgrades.has(\"barricade\") && this.isNearBase();\n    const hardcore = this.survival.hardcore ? 1.25 : 1;\n    const tough = Math.pow(0.92, this.survival.perkRank(\"tough\"));\n    const toxin = Math.pow(0.7, this.survival.perkRank(\"toxin_filter\"));\n    const blocking = this.weapon.isMelee && this.input.aimHeld;\n    const parry =\n      blocking &&\n      this.now - this.guardStartedAt <= 0.5 &&\n      this.now - this.lastParryAt > 0.7 &&\n      from.distanceTo(this.player.pos) < 4.5;\n    if (parry) {\n      this.parries++;\n      this.lastParryAt = this.now;\n      this.combatHud.hit(true);\n      this.audio.hitmarker(true);\n      this.rig.punchFov(2.2);\n      this.hud.toast(\"PARRY\", 0.75);\n      return;\n    }\n    const actual = (fortified ? amount * 0.65 : amount) * hardcore * tough * (blocking ? 0.4 : 1);\n    this.survival.damage(actual, {\n      bleeding: this.rng() < 0.24 && !blocking ? 0.35 : 0,\n      infection: this.rng() < 0.16 ? 7 * toxin : 0,\n    });\n    this.combatHud.damage(actual);\n    this.audio.hurt();\n    this.rig.punchFov(-2.2);\n    if (this.survival.stats.health <= 0) this.die();\n  }",
  ],
]);

edit("src/renderer/game/combat/ViewModel.ts", [
  [
    "  private swingSide = 1;",
    "  private swingSide = 1;\n  private swingDir = \"overhead\";",
  ],
  [
    "  reload(): void {",
    "  /** Directional katana swing. Keeps the legs planted while the blade does the work. */\n  onMelee(direction: string): void {\n    this.swingDir = direction;\n    this.onFire();\n  }\n\n  reload(): void {",
  ],
  [
    "    if (this.swingT > 0) {\n      this.swingT = Math.max(0, this.swingT - dt);\n      const k = 1 - this.swingT / 0.28;\n      const arc = Math.sin(k * Math.PI);\n      this.root.rotation.y -= arc * 1.1 * this.swingSide;\n      this.root.rotation.x += arc * 1.35;\n      this.root.rotation.z -= arc * 0.55;\n      this.root.position.x -= arc * 0.12;\n      this.root.position.z -= arc * 0.12;\n    }",
    "    if (this.swingT > 0) {\n      this.swingT = Math.max(0, this.swingT - dt);\n      const k = 1 - this.swingT / 0.28;\n      const arc = Math.sin(k * Math.PI);\n      if (this.swingDir === \"thrust\") {\n        this.root.position.z -= arc * 0.3;\n        this.root.rotation.x += arc * 0.6;\n      } else if (this.swingDir === \"overhead\") {\n        this.root.rotation.x += arc * 1.55;\n        this.root.position.y -= arc * 0.08;\n      } else if (this.swingDir === \"rising\") {\n        this.root.rotation.x -= arc * 1.2;\n        this.root.position.y += arc * 0.12;\n      } else {\n        const side = this.swingDir === \"slash-left\" ? 1 : -1;\n        this.root.rotation.y -= arc * 1.3 * side;\n        this.root.rotation.z -= arc * 0.55 * side;\n        this.root.position.x -= arc * 0.12 * side;\n      }\n    }",
  ],
]);
