import fs from "node:fs";

const file = "E:/CREATOR STUDIO/Twilight Studio 3D/tools/_patch-heli-game.mjs";
let source = fs.readFileSync(file, "utf8");
const start = source.indexOf("replace(\n  '    this.hud.toast(`Driving");
const end = source.indexOf(");\n\nconst exitStart", start);
if (start < 0 || end < 0) throw new Error("toast replace block missing");
source = source.slice(0, start) + source.slice(end + 3);
fs.writeFileSync(file, source);
console.log("heli script toast block removed");
