import fs from "node:fs";

const file = "src/renderer/game/Game.ts";
let source = fs.readFileSync(file, "utf8");
const heliSnippet = fs.readFileSync("tools/_heli-snippet.txt", "utf8");

function replace(from, to) {
  if (!source.includes(from)) throw new Error("missing anchor: " + from.slice(0, 90));
  source = source.replace(from, to);
}

replace(
  '    type: "car" | "kart";\n  } | null = null;',
  '    type: "car" | "kart" | "heli";\n    altitude: number;\n    lift: number;\n    rotor: THREE.Object3D | null;\n    tailRotor: THREE.Object3D | null;\n  } | null = null;',
);
replace(
  "      type: meta.type === \"kart\" ? \"kart\" : \"car\",\n    };\n    this.player.pos.set(root.position.x, 0.1, root.position.z);",
  "      type: meta.type === \"kart\" ? \"kart\" : meta.type === \"heli\" ? \"heli\" : \"car\",\n      altitude: 0,\n      lift: 0,\n      rotor: (root.userData?.rotor as THREE.Object3D | undefined) ?? null,\n      tailRotor: (root.userData?.tailRotor as THREE.Object3D | undefined) ?? null,\n    };\n    this.player.pos.set(\n      root.position.x,\n      this.vehicle.type === \"heli\" ? root.position.y + 0.9 : 0.1,\n      root.position.z,\n    );",
);

const exitStart = source.indexOf("  private exitVehicle(silent = false): void {");
const exitEnd = source.indexOf("  private updateVehicle(dt: number): void {", exitStart);
if (exitStart < 0 || exitEnd < 0) throw new Error("exitVehicle block missing");
const exitBlock = `  private exitVehicle(silent = false): void {
    const vehicle = this.vehicle;
    if (!vehicle) return;
    const heli = vehicle.type === "heli";
    if (heli && vehicle.altitude > 0.8 && !silent) {
      this.hud.toast("Land before leaving the helicopter.", 1.8);
      return;
    }
    const baseY = vehicle.root.position.y;
    const halfX = heli ? 1.0 : vehicle.type === "kart" ? 0.8 : 1.2;
    const halfZ = heli ? 1.9 : vehicle.type === "kart" ? 1.3 : 2.3;
    this.world.add(
      [vehicle.root.position.x - halfX, baseY + 0.25, vehicle.root.position.z - halfZ],
      [vehicle.root.position.x + halfX, baseY + 1.6, vehicle.root.position.z + halfZ],
      "metal",
      \`vehicle:\${vehicle.id}\`,
    );
    const rightX = Math.cos(this.player.yaw);
    const rightZ = -Math.sin(this.player.yaw);
    this.player.pos.set(
      vehicle.root.position.x + rightX * 2.0,
      baseY + 0.3,
      vehicle.root.position.z + rightZ * 2.0,
    );
    this.player.prevPos.copy(this.player.pos);
    this.player.vel.set(0, 0, 0);
    this.vehicle = null;
    this.survivalHud.setVehicle(null, null);
    if (!silent) this.hud.toast("You leave the vehicle.", 1.6);
  }

`;
source = source.slice(0, exitStart) + exitBlock + source.slice(exitEnd);

replace(
  "  private updateVehicle(dt: number): void {\n    const vehicle = this.vehicle;\n    if (!vehicle) return;\n    const throttle = this.input.moveZ;",
  "  private updateVehicle(dt: number): void {\n    const vehicle = this.vehicle;\n    if (!vehicle) return;\n    if (vehicle.type === \"heli\") {\n      this.updateHelicopter(dt, vehicle);\n      return;\n    }\n    const throttle = this.input.moveZ;",
);
replace(
  "  private tryGrapple(): void {",
  heliSnippet + "  private tryGrapple(): void {",
);
replace(
  "      this.vehicle ? Math.abs(this.vehicle.speed) * 3.6 : null,\n      this.vehicle ? this.vehicle.fuel : null,\n      this.vehicle ? { health: this.vehicle.health, max: this.vehicle.maxHealth } : null,\n    );",
  "      this.vehicle\n        ? this.vehicle.type === \"heli\"\n          ? Math.hypot(this.vehicle.speed, this.vehicle.lift) * 3.6\n          : Math.abs(this.vehicle.speed) * 3.6\n        : null,\n      this.vehicle ? this.vehicle.fuel : null,\n      this.vehicle ? { health: this.vehicle.health, max: this.vehicle.maxHealth } : null,\n      this.vehicle?.type === \"heli\" ? this.vehicle.altitude : null,\n    );",
);

fs.writeFileSync(file, source);
console.log("Game helicopter patched");
