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

edit("src/renderer/game/world/PropModels.ts", [
  [
    '  "car/van.glb": 2.05,',
    '  "car/van.glb": 2.05,\n  "air/heli.glb": 2.4,',
  ],
  [
    "      const source = await this.model(placement.model);\n      let object: THREE.Object3D;\n      if (source) {\n        object = source.clone(true);",
    "      const flyer = placement.vehicle?.type === \"heli\";\n      const source = flyer ? this.buildHelicopter() : await this.model(placement.model);\n      let object: THREE.Object3D;\n      if (source) {\n        object = flyer ? source : source.clone(true);",
  ],
  [
    "  async place(placements: PropPlacement[]): Promise<PropLoadResult> {",
    "  /** Procedural county helicopter; the fetched Kenney set has no rotorcraft. */\n  private buildHelicopter(): THREE.Object3D {\n    const root = new THREE.Group();\n    root.name = \"county-heli\";\n    const paint = new THREE.MeshStandardMaterial({ color: 0x3d4a3a, roughness: 0.62, metalness: 0.35 });\n    const trim = new THREE.MeshStandardMaterial({ color: 0x8a4b2a, roughness: 0.85 });\n    const dark = new THREE.MeshStandardMaterial({ color: 0x15191a, roughness: 0.9 });\n    const glass = new THREE.MeshStandardMaterial({ color: 0x9fc6cf, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.55 });\n\n    const body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.0, 3.6), paint);\n    body.position.set(0, 1.05, 0);\n    root.add(body);\n    const belly = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.35, 2.5), trim);\n    belly.position.set(0, 0.52, 0.15);\n    root.add(belly);\n    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.62, 12, 8), paint);\n    nose.scale.set(1.15, 0.9, 1.35);\n    nose.position.set(0, 1.18, -1.85);\n    root.add(nose);\n    const canopy = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.58, 1.25), glass);\n    canopy.position.set(0, 1.52, -1.25);\n    root.add(canopy);\n    const boom = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.26, 3.2), paint);\n    boom.position.set(0, 1.34, 2.9);\n    root.add(boom);\n    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.95, 0.65), trim);\n    fin.position.set(0, 1.72, 4.35);\n    root.add(fin);\n\n    const rotor = new THREE.Group();\n    rotor.position.set(0, 1.95, 0);\n    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.3, 8), dark);\n    mast.position.y = -0.12;\n    rotor.add(mast);\n    for (const yaw of [0, Math.PI / 2]) {\n      const blade = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.055, 0.18), dark);\n      blade.rotation.y = yaw;\n      blade.position.y = 0.02;\n      rotor.add(blade);\n    }\n    root.add(rotor);\n\n    const tailRotor = new THREE.Group();\n    tailRotor.position.set(0.28, 1.7, 4.38);\n    const tailBlade = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.35, 0.12), dark);\n    tailRotor.add(tailBlade);\n    root.add(tailRotor);\n\n    for (const side of [-1, 1]) {\n      const skid = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, 2.7), dark);\n      skid.position.set(side * 0.76, 0.2, 0.1);\n      root.add(skid);\n      for (const z of [-0.65, 0.85]) {\n        const strut = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, 0.08), dark);\n        strut.position.set(side * 0.76, 0.45, z);\n        root.add(strut);\n      }\n    }\n\n    root.traverse((object) => {\n      const mesh = object as THREE.Mesh;\n      if (mesh.isMesh) {\n        mesh.castShadow = true;\n        mesh.receiveShadow = true;\n      }\n    });\n    root.userData.rotor = rotor;\n    root.userData.tailRotor = tailRotor;\n    return root;\n  }\n\n  async place(placements: PropPlacement[]): Promise<PropLoadResult> {",
  ],
]);

edit("src/renderer/game/world/SurvivalTown.ts", [
  [
    'vehicle?: { id: string; fuel: number; name: string; type?: "car" | "kart"; health?: number };',
    'vehicle?: { id: string; fuel: number; name: string; type?: "car" | "kart" | "heli"; health?: number };',
  ],
  [
    '  // Street lamps (simple posts; the HUD clock drives the mood, not dozens of lights).',
    '  // The county helicopter waits on the east verge, past the last south house.\n  props.push({\n    model: "air/heli.glb",\n    at: [44, 0, 18],\n    yaw: 180,\n    height: 2.4,\n    solid: true,\n    vehicle: { id: "county-heli", fuel: 58, name: "Mosswood Whirlybird", type: "heli", health: 85 },\n  });\n  props.push({ model: "survival/signpost.glb", at: [41, 0, 14], yaw: 35, height: 2.0, solid: false });\n\n  // Street lamps (simple posts; the HUD clock drives the mood, not dozens of lights).',
  ],
]);
