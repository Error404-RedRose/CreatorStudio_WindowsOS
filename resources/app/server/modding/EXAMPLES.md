# Creator Studio Mod Examples

These examples use the runtime installed by `src/lib/modRuntime.ts`. Put files in
your own folder under `mods/`. The full API is in `MODDING.md`.

## Header button and toast

`mod.json`

```json
{
  "id": "my-header",
  "name": "My Header",
  "version": "1.0.0",
  "author": "You",
  "description": "Adds a header button.",
  "main": "main.js"
}
```

`main.js`

```js
const studio = window.CreatorStudio;
if (studio) {
  studio.ui.addHeaderButton({
    id: "my-header-button",
    label: "My Studio",
    onClick() {
      studio.toast("My header button works", "success");
    },
  });
}
```

## Full UI theme

`style.css`

```css
:root {
  --accent: #ff5cc8;
  --accent-soft: color-mix(in srgb, #ff5cc8 18%, transparent);
  --panel: #140b1c;
  --panel-2: #1d0f28;
}

.topbar {
  background: linear-gradient(90deg, #16051d, #2a0b36);
}
```

Add `"styles": ["style.css"]` to the manifest.

## Replace a 3D tool click

```js
studio.tools.override("rect", ({ engine, setTool, event }) => {
  // Return true to fully replace the normal Rectangle tool click.
  setTool("line");
  studio.toast("Rectangle is now my custom tool", "success");
  return true;
});
```

The tool ids are the same as `MODELER_TOOL_GROUPS`: `select`, `erase`, `line`,
`rect`, `circle`, `arc`, `pushpull`, `offset`, `bevel`, `followme`, `move`,
`rotate`, `scale`, `measure`, `paint`, `uv`, `uvwrap` and `text`.

## Intercept any button

```js
document.querySelector("#creatorstudio-header-slot")?.addEventListener("click", () => {
  studio.toast("Header slot clicked");
});

studio.ui.overrideClick(".modeler-tb-btn", (event, element) => {
  // Return false to stop the app's own click handler.
  console.log("toolbar click", element.title);
  return true;
});
```

## Full layout replacement

```js
studio.ui.addStyle(`
  .app-shell { display: none !important; }
`, "my-shell-hide");

studio.waitFor("body").then((body) => {
  const shell = document.createElement("div");
  shell.id = "my-shell";
  shell.innerHTML = `
    <main style="position:fixed;inset:0;z-index:9999;background:#08040c;color:#fff;padding:32px">
      <h1>My Creator Studio</h1>
      <button id="my-open">Open the original UI</button>
    </main>`;
  body.appendChild(shell);
  shell.querySelector("#my-open")?.addEventListener("click", () => {
    shell.remove();
    studio.ui.removeStyle("my-shell-hide");
  });
});
```

The original React app keeps running behind the replacement. This is the safest
way to make a complete UI overhaul without editing application files.

## Backend module

`backend.mjs`

```js
export default async function ({ action, payload, context }) {
  if (action === "ping") return { pong: true, version: context.version };
  return { action, payload };
}
```

`main.js`

```js
const result = await studio.api.modsBackend("my-mod", "backend.mjs", "ping", { x: 1 });
console.log(result);
```

## Python helper

`tools/make_layout.py`

```python
import json
print(json.dumps({"rooms": [{"w": 6, "d": 4}]}))
```

`main.js`

```js
const result = await studio.api.modsPython("my-mod", "tools/make_layout.py", ["--json"]);
console.log(result.stdout);
```

## AI prompt

Paste `docs/AI_MODDING_PROMPT.txt` into an AI coding chat. It already describes
the license gate, mod folder, runtime API, UI slots and backend/Python hooks.
