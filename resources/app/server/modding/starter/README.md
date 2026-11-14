# Example Theme mod

This folder is a working Creator Studio mod. It adds a header button and changes the
accent colour. Use it as a template.

- `mod.json` - manifest.
- `main.js` - ES module loaded by the mod runtime.
- `style.css` - injected stylesheet.
- `backend.mjs` - optional Node backend module.
- Any other file can be served through `/api/mods/file` and used by your scripts.

Open `MODDING.md` in the parent folder for the full API and activation rules.
