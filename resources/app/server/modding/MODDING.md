# Creator Studio Modding

Creator Studio mods load from your user data folder, **not** from the installed application.
The application files stay untouched. Delete a mod folder to remove it.

## License gate

Mods only load when this PC holds an **activated Creator Studio product license**.
The backend checks the Twilight Studio license on every mod file request:

- Not activated: `/api/mods/file`, mod scripts, CSS and backend calls return **403**.
- Activated: enabled mods load at startup and receive the full runtime API.
- A mod cannot activate Creator Studio, bypass the product-key screen, or replace the
  license check. Mods are an extension layer, not a license.

If the app is activated on this PC, mods can use the same local activation when the
licence server is temporarily unreachable (the normal cached-license behavior).

## Folder layout

The **Mods** tab in Settings > Mods shows the exact folder. The default is:

```text
Documents/3D Creator Studio/mods/
  MODDING.md                  <- this file
  AI_MODDING_PROMPT.txt       <- paste into an AI coding chat
  example-theme/
    mod.json
    main.js
    style.css
    README.md
  your-mod/
    mod.json
    main.js
    style.css
    backend.mjs               <- optional server-side Node module
    tools/anything.py         <- optional Python helpers
```

Mods may contain any JS, CSS, JSON, image, font, Markdown, Python or data file.
They are served through the gated `/api/mods/file` route, never from the app bundle.

## mod.json

```json
{
  "id": "your-mod",
  "name": "Your Mod",
  "version": "1.0.0",
  "author": "Your name",
  "description": "What this changes.",
  "main": "main.js",
  "styles": ["style.css"],
  "backend": "backend.mjs"
}
```

`main` is loaded as an ES module in the renderer after the license gate passes.
`styles` are injected as stylesheets. `backend` is only used when you explicitly call
`POST /api/mods/backend`.

## Runtime API

The renderer exposes `window.CreatorStudio` before mod scripts run.

```js
const studio = window.CreatorStudio;

studio.version                     // Creator Studio version
studio.modsRoot                    // absolute mods folder on this PC
studio.api                         // the app's typed API client (fetch wrappers)
studio.store                       // useAppStore: getState, setState, subscribe
studio.engine()                    // ModelerEngine instance, or null outside the 3D applet
studio.toast(message, tone)        // "success" | "error" | "info"
studio.log(...args)
studio.waitFor(selector)           // Promise<Element>
```

### UI hooks

```js
studio.ui.addStyle(`
  :root { --accent: #ff5cc8; }
  .topbar { background: #120018; }
`);

studio.ui.addHeaderButton({
  id: "my-header-button",
  label: "My Studio",
  icon: "sparkle",
  onClick() { studio.toast("Hello from my mod"); }
});

studio.ui.mount("#creatorstudio-header-slot", element);
studio.ui.overrideClick(".some-button", (event) => {
  // return false to stop the app's normal click handler
  return false;
});
```

Persistent slots:

- `#creatorstudio-header-slot` - the main app header, left of Settings.
- `#creatorstudio-toolbar-slot` - the 3D editor bottom toolbar, beside AI.

For a full UI overhaul, inject CSS that hides or rearranges the existing layout, then
mount replacement panels into `document.body` or a slot. Use a `MutationObserver`
for elements React re-renders. This is intentionally powerful: a mod can restyle,
rename, hide or replace any interface element.

### Tool overrides

```js
studio.tools.override("rect", ({ engine, tool, setTool, event }) => {
  engine?.addLabel("Custom rectangle tool", new THREE.Vector3(0, 0, 0));
  studio.toast("The Rectangle button is now my tool");
  return true; // true = handled, false/undefined = run the original action
});
```

Tool ids match the 3D editor: `select`, `erase`, `line`, `rect`, `circle`, `arc`,
`pushpull`, `offset`, `bevel`, `followme`, `move`, `rotate`, `scale`, `measure`,
`paint`, `uv`, `uvwrap`, `text`, and the rest of `MODELER_TOOL_GROUPS`.

You also have `studio.store` and `studio.engine()`, so a mod can rewrite app state,
create geometry, add objects, change materials, drive AI requests, or listen to events.

### Events

```js
studio.events.on("scene-changed", (detail) => console.log(detail));
studio.events.emit("my-mod-event", { value: 1 });
```

Mods can use the same browser APIs as the app: `fetch`, `indexedDB`, `localStorage`,
`WebSocket`, canvas, Web Audio, WebGL and dynamic `import()`.

## Backend hooks

Server-side modules receive a small context and run only after the license gate:

```js
// backend.mjs
export default async function ({ action, payload, context }) {
  if (action === "hello") return { message: "Hello from the backend", payload };
  return { action, dataDir: context.dataDir };
}
```

Call it from `main.js`:

```js
const result = await studio.api.modsBackend("your-mod", "backend.mjs", "hello", { n: 1 });
```

Python helpers are supported through the same gate:

```js
const result = await studio.api.modsPython("your-mod", "tools/build.py", ["--fast"]);
```

The Python process runs with the mod folder as its working directory and a 60 second
timeout. Install any Python packages yourself; Creator Studio does not manage mod
virtual environments.

## Developer workflow

1. Settings > Mods > **Open folder**.
2. Create or edit a mod. Keep `main.js` small and reload after changes.
3. Enable the mod in Settings > Mods.
4. Restart Creator Studio (or press **Reload mods**) to load the new scripts.
5. Errors appear in the browser console and in Diagnostics > Logs.

## Rules

- Do not edit files inside the installed Creator Studio folder. Put everything in the mods folder.
- Do not attempt to bypass activation. Mods that are not licensed are not served or executed.
- A mod runs with the same access as the app itself. Only install mods you trust.
- To disable everything, turn off the mod or rename its folder. The base app is unaffected.
