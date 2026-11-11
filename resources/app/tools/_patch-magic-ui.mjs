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

edit("src/renderer/ui/SurvivalHud.ts", [
  [
    "  private readonly levelPoints: HTMLElement;\n  private arsenalSignature = \"\";",
    "  private readonly levelPoints: HTMLElement;\n  private readonly spellEl: HTMLElement;\n  private readonly spellName: HTMLElement;\n  private readonly spellManaFill: HTMLElement;\n  private readonly spellMeta: HTMLElement;\n  private spellSignature = \"\";\n  private arsenalSignature = \"\";",
  ],
  [
    "    this.root.appendChild(this.levelEl);\n\n    this.promptEl = div(\"sv-prompt\");",
    "    this.root.appendChild(this.levelEl);\n\n    this.spellEl = div(\"sv-spell\");\n    const spellTop = div(\"sv-spell-top\");\n    this.spellName = document.createElement(\"b\");\n    this.spellName.textContent = \"EMBERBOLT\";\n    const spellKey = document.createElement(\"kbd\");\n    spellKey.textContent = \"F\";\n    spellTop.append(this.spellName, spellKey);\n    const spellTrack = document.createElement(\"span\");\n    this.spellManaFill = document.createElement(\"i\");\n    spellTrack.appendChild(this.spellManaFill);\n    this.spellMeta = div(\"sv-spell-meta\");\n    this.spellEl.append(spellTop, spellTrack, this.spellMeta);\n    this.root.appendChild(this.spellEl);\n\n    this.promptEl = div(\"sv-prompt\");",
  ],
  [
    "  setVehicle(speedKmh: number | null, fuel: number | null, hull: { health: number; max: number } | null = null): void {",
    "  setSpell(name: string, mana: number, maxMana: number, cooldown: number): void {\n    const ratio = Math.max(0, Math.min(1, mana / Math.max(1, maxMana)));\n    const cooldownText = cooldown > 0 ? cooldown.toFixed(1) + \"s\" : \"READY\";\n    const signature = name + \":\" + Math.round(ratio * 100) + \":\" + cooldownText;\n    if (signature === this.spellSignature) return;\n    this.spellSignature = signature;\n    this.spellName.textContent = name.toUpperCase();\n    this.spellManaFill.style.transform = \"scaleX(\" + ratio.toFixed(3) + \")\";\n    this.spellEl.classList.toggle(\"recharging\", cooldown > 0);\n    this.spellMeta.innerHTML =\n      \"<span>MANA \" + Math.round(mana) + \"/\" + Math.round(maxMana) + \"</span><em>\" + cooldownText + \"</em>\";\n  }\n\n  setVehicle(speedKmh: number | null, fuel: number | null, hull: { health: number; max: number } | null = null): void {",
  ],
]);

edit("src/renderer/ui/styles.css", [
  [
    "/* Hardcore badge below the level strip */",
    "/* Spell strip below the level/hardcore line */\n.sv-spell {\n  position: absolute;\n  left: 26px;\n  top: 110px;\n  width: 236px;\n  display: grid;\n  gap: 5px;\n  padding: 8px 11px;\n  border: 1px solid rgba(201, 166, 255, 0.3);\n  border-radius: 1px;\n  clip-path: polygon(0 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%);\n  background: linear-gradient(180deg, rgba(18, 12, 28, 0.78), rgba(11, 12, 16, 0.55));\n  backdrop-filter: blur(4px);\n}\n\n.sv-spell-top {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 8px;\n}\n\n.sv-spell-top b {\n  font-family: ui-monospace, Consolas, monospace;\n  font-size: 10px;\n  letter-spacing: 0.16em;\n  color: #c9a6ff;\n}\n\n.sv-spell-top kbd {\n  padding: 1px 5px;\n  border: 1px solid rgba(201, 166, 255, 0.4);\n  border-radius: 2px;\n  font-family: ui-monospace, Consolas, monospace;\n  font-size: 8px;\n  color: rgba(244, 241, 234, 0.7);\n}\n\n.sv-spell > span {\n  height: 4px;\n  border-radius: 1px;\n  overflow: hidden;\n  background: rgba(201, 166, 255, 0.14);\n}\n\n.sv-spell > span i {\n  display: block;\n  height: 100%;\n  width: 100%;\n  transform-origin: left center;\n  transition: transform 160ms linear;\n  background: linear-gradient(90deg, #5f7dff, #c9a6ff);\n}\n\n.sv-spell-meta {\n  display: flex;\n  justify-content: space-between;\n  gap: 8px;\n  font-family: ui-monospace, Consolas, monospace;\n  font-size: 8px;\n  letter-spacing: 0.12em;\n  color: rgba(244, 241, 234, 0.55);\n}\n\n.sv-spell-meta em {\n  font-style: normal;\n  color: var(--gold);\n}\n\n.sv-spell.recharging .sv-spell-top b {\n  opacity: 0.55;\n}\n\n/* Hardcore badge below the level strip */",
  ],
]);
