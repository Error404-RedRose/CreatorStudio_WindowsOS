/**
 * Magic - the survivor's four spells, their mana pool and cooldowns.
 *
 * The spell data is pure (no THREE dependency) so the HUD and the acceptance tests can
 * read it without touching the renderer. Game owns the hit tests and the visual effects.
 */

export type SpellKind = "bolt" | "nova" | "heal" | "lance";

export interface SpellDef {
  id: string;
  name: string;
  kind: SpellKind;
  cost: number;
  cooldown: number;
  damage: number;
  range: number;
  radius: number;
  heal: number;
  color: number;
  hint: string;
}

export const SPELLS: SpellDef[] = [
  {
    id: "emberbolt",
    name: "Emberbolt",
    kind: "bolt",
    cost: 15,
    cooldown: 0.9,
    damage: 38,
    range: 70,
    radius: 0,
    heal: 0,
    color: 0xff7a2a,
    hint: "A searing bolt of cinders. Cheap, fast, sets the dead alight.",
  },
  {
    id: "frostnova",
    name: "Frost Nova",
    kind: "nova",
    cost: 30,
    cooldown: 7,
    damage: 24,
    range: 8,
    radius: 8,
    heal: 0,
    color: 0x8fdcff,
    hint: "A ring of killing cold. Hits every infected around you.",
  },
  {
    id: "mending",
    name: "Mending Light",
    kind: "heal",
    cost: 35,
    cooldown: 12,
    damage: 0,
    range: 0,
    radius: 0,
    heal: 32,
    color: 0x8effb0,
    hint: "Knit flesh and close wounds. Also purges bleeding and infection.",
  },
  {
    id: "stormlance",
    name: "Storm Lance",
    kind: "lance",
    cost: 45,
    cooldown: 14,
    damage: 95,
    range: 90,
    radius: 0,
    heal: 0,
    color: 0xc08bff,
    hint: "A spear of bottled lightning. Expensive, and it deletes most things.",
  },
];

export const SPELL_MAP = new Map(SPELLS.map((spell) => [spell.id, spell]));

export class MagicSystem {
  maxMana = 100;
  mana = 100;
  index = 0;
  private readonly cooldowns = new Map<string, number>();

  get current(): SpellDef {
    return SPELLS[this.index] ?? SPELLS[0];
  }

  select(id: string): SpellDef {
    const found = SPELLS.findIndex((spell) => spell.id === id);
    if (found >= 0) this.index = found;
    return this.current;
  }

  cycle(): SpellDef {
    this.index = (this.index + 1) % SPELLS.length;
    return this.current;
  }

  update(dt: number, regen = 1, maxMana = this.maxMana): void {
    this.maxMana = maxMana;
    this.mana = Math.min(this.maxMana, this.mana + 6 * regen * dt);
    for (const [id, remaining] of this.cooldowns) {
      const next = remaining - dt;
      if (next <= 0) this.cooldowns.delete(id);
      else this.cooldowns.set(id, next);
    }
  }

  cooldown(id: string): number {
    return this.cooldowns.get(id) ?? 0;
  }

  /** True when mana and cooldown both allow the cast. */
  canCast(spell = this.current): boolean {
    return this.mana >= spell.cost && this.cooldown(spell.id) <= 0;
  }

  /** Spend the cost and start the cooldown. Returns false when the cast is not legal. */
  cast(spell = this.current): boolean {
    if (!this.canCast(spell)) return false;
    this.mana = Math.max(0, this.mana - spell.cost);
    this.cooldowns.set(spell.id, spell.cooldown);
    return true;
  }

  reset(): void {
    this.mana = this.maxMana;
    this.cooldowns.clear();
    this.index = 0;
  }
}
