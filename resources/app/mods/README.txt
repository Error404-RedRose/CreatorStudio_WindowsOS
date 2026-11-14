Creator Studio Mods
===================

Create your own folder here. Each mod folder needs a mod.json manifest and its
own JavaScript, CSS or data files. Nothing in the installed Creator Studio
application is edited.

Documentation:
  docs/MODDING.md          - full modding guide and runtime API
  docs/EXAMPLES.md         - working UI, theme and tool-override examples
  docs/AI_MODDING_PROMPT.txt - paste into an AI coding chat to build a mod

Example layout:

  mods/
    my-mod/
      mod.json
      main.js
      style.css
      backend.mjs          (optional)
      tools/script.py      (optional Python helper)

Mods only load when this PC has an activated Creator Studio license. The backend
checks the license before serving a mod file or running a backend/Python call.
Keep the docs folder; it is replaced with the latest instructions on update.
