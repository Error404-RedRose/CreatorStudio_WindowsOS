# Creator Studio

**By Twilight Studio** · Version **0.14.0-beta.12** · Windows x64

A native Windows creative workspace where AI agents and manual tools share the same project.
Model in 3D, simulate cloth, format writing, code with an AI agent, drive a live Unity Editor,
edit layered images, and run AI research — all from one desktop application.

> **Using Linux instead?** Download the Linux build here:
> **[CreatorStudio_LinuxOS](https://github.com/Error404-RedRose/CreatorStudio_LinuxOS)**
>
> The Windows and Linux repositories are separate. If you opened this page by mistake,
> the link above takes you to the correct Linux distribution.

---

## Downloading and installing from GitHub

The main executable is stored with **Git LFS** because it is larger than GitHub's
100 MB file limit. A plain ZIP download contains a small **pointer file** instead of
the real program (about 134 bytes), so use one of these methods.

### Recommended: run `install.bat`

1. Download the repository as a ZIP and extract it completely.
2. Open the extracted folder and run **`install.bat`**.
3. The installer downloads the complete build, verifies the 238 MB executable, and
   starts Creator Studio.

`install.bat` uses `git clone` plus `git lfs pull` when Git is installed. If Git is
missing, it offers a direct download of the executable from GitHub's LFS media
endpoint, so no developer tools are required. Run it again any time you need to
restore the executable.

### Manual: clone with Git LFS

```text
git lfs install
git clone https://github.com/Error404-RedRose/CreatorStudio_WindowsOS.git
cd CreatorStudio_WindowsOS
git lfs pull
```

Then run `Creator Studio.exe`.

### Manual: single executable

Open `Creator Studio.exe` on GitHub and use **Download** on the file page. The file
is about 238 MB; keep it in the same folder as the rest of the release files.

---

## What's in this folder

| Item | Description |
| --- | --- |
| `Creator Studio.exe` | The application. Run it from this folder. |
| `install.bat` | Restores the full executable when the repository was downloaded as a ZIP. |
| `resources/`, `locales/`, `*.dll`, `*.pak`, `*.bin` | Required runtime files. Do not move or delete them. |
| `README.md` | This document. |
| `LICENSE.txt` | License terms for Creator Studio. |
| `LICENSE.electron.txt`, `LICENSES.chromium.html` | Third-party license notices. |

Keep this folder intact. The executable depends on the DLLs, `resources.pak`, `locales/`, and the
other bundled files beside it — the app will not start if files are separated or moved out.

> This is alpha software. Back up important projects and expect interface changes between builds.

---

## System requirements

- **Windows 10 or Windows 11, 64-bit**
- **8 GB RAM recommended** (4 GB minimum)
- A GPU and driver with **WebGL 2** support
- **About 1 GB free disk space** for the application, plus room for projects
- **Internet connection** for product activation, AI providers, GitHub, and updates
- **OpenCode CLI**, a local **Hermes** endpoint, or a local **Claude-compatible** endpoint
  installed on the same PC to use AI features (see below)

The Windows build is packaged for x64 Windows. A separate Linux build is available at
**[CreatorStudio_LinuxOS](https://github.com/Error404-RedRose/CreatorStudio_LinuxOS)**.

---

## Run the app

1. If `Creator Studio.exe` is only about 134 bytes, run `install.bat` first.
2. Open `Creator Studio.exe` in this folder.
3. If Windows SmartScreen appears, choose **More info → Run anyway**. The build is not
   code-signed.
4. Enter your product key when the activation screen appears.

The application opens as a full-screen, frameless window with a custom title bar. Use the title
bar buttons for Home, minimize, and close.

To move the app to another location, copy the **entire folder**, not just the executable.

### Scale the interface

Open **Settings > Appearance** and use **App scale** to resize the whole interface from 80% to
150%. The setting is saved and applies to panels, dialogs, the launcher and the 3D viewport.
**Ctrl + =**, **Ctrl + -** and **Ctrl + 0** also work from any applet. **Text scale** changes only
the workspace text. Both Windows and Linux builds use the same controls.

---

## Activation

Creator Studio requires a **product key**.

- Enter the key on the activation screen or in **Settings → License**.
- An internet connection is required to verify the key. The app re-checks it while running.
- A valid key stays unlocked. An expired, revoked, or device-mismatched key returns to the
  activation screen.
- Each key is tied to the device it was first activated on.

Need a key or hit an activation problem? Contact Twilight Studio using the details at the bottom
of this file.

---

## Set up AI (OpenCode, Hermes or Claude)

Creator Studio needs one AI backend. All three choices use the same agents, tools, sessions,
approval flow and per-studio model memory.

- **OpenCode** — install it from [opencode.ai](https://opencode.ai/), then open
  **Settings → OpenCode**. Creator Studio can provision a compatible 1.x runtime automatically.
- **Hermes** — install Hermes from
  [hermes-agent.nousresearch.com](https://hermes-agent.nousresearch.com/). Creator Studio reads
  Hermes's authenticated model providers directly (including the BlitzBoy models and Nous free
  when its token is valid), so OpenCode's tools and approvals work normally. If Hermes is installed
  but not signed in, open **Settings → AI backends** and configure it there.
- **Claude** — install Claude from [claude.com/download](https://claude.com/download). Claude Code and
  Claude Desktop are agents, not local model servers: they do not expose an HTTP model endpoint by
  themselves. Run a Claude-compatible proxy, or enter the proxy URL in **Settings → AI backends**.
  Creator Studio scans local ports and auto-fills a running Claude proxy when it finds one.

Use **Test endpoint**, then **Save & reconnect agents**. The header model menu follows the active
backend and shows only that backend's models. Auto-connect uses whichever backend you saved.

When Ollama is running on this PC, Creator Studio also adds an **Ollama (local)** provider with
every installed model. OpenCode Zen, OpenCode Go and Ollama Cloud models stay in the same model
menu, so you can switch between free Zen models, Go models and local models without leaving the app.

**Each workspace remembers its own model.** The model you select for Writing is used for Writing;
the model you select for Coding is used for Coding, and so on. Choose models with tool calling
support for 3D scene editing, coding, and GitHub actions.

You can also configure provider API keys for OpenAI and Gemini in **Settings → Providers** if you
want those providers in Research or Photo.

---

## Workspaces

### 3D Studio
Real-time modeling with object and mesh modes, move/rotate/scale gizmos, rectangle and pen tools,
vertex editing, measurement, decimation, smooth/flat shading, and scene presets. Import FBX, GLB,
GLTF, and OBJ; export GLB, OBJ, STL, and FBX. Materials include full PBR maps, procedural
patterns, a Material Lab, UV generation, and a stretch-colored UV viewer. Rigging, blend shapes,
lighting, cameras, and six viewport modes are included.

### Clothworks
A real-time cloth simulator with Curtain, Blanket, Towel, and Pillow presets. Adjust gravity,
wind, stiffness, and damping; switch between sphere and box colliders; toggle wireframe; pause,
play, or reset the simulation.

### Writing
Paste raw text and press **Format** (or `Ctrl`+`Enter`). The app starts a fresh AI session, shows
live progress and elapsed time, and returns clean professional text. **Copy** places rich HTML and
plain text on the clipboard so headings, lists, bold, and links survive when pasted into email or
a document. **Cancel** stops a slow run immediately.

### Coding
A file tree, tabbed editor, dirty-state tracking, search, image attachments, and persistent
sessions. The AI view streams file edits with added/removed line highlights, command output, and
up to four concurrent agent panels. **Follow AI edits** jumps to each completed write. Writes and
commands stay disabled until you explicitly trust the project.

### Unity Live
Connect to an open Unity Editor project. The app shows the project, active scene, and a filterable
hierarchy; focuses objects on double-click; surfaces compile and scene messages; and can refresh
assets, request script compilation, and enter or exit play mode. Install the bundled bridge from
`resources\app\unity\com.twilightstudio.creatorstudio` using **Package Manager → + → Add package
from disk…** (Unity 2021.3 or newer). The bridge listens on loopback only.

### Photo
Layered canvas editing with brush, eraser, rectangle, ellipse, and text. Add, duplicate, reorder,
hide, and blend layers. Import images, save layered `.creatorstudio.json` documents, and export
flattened PNG, JPEG, or WebP. AI output arrives as a new SVG layer instead of replacing the canvas.

### Research
Chat with OpenCode, OpenAI, or Gemini. Search the web through DuckDuckGo, add results to project
references in one click, and optionally include GitHub repository and code matches as research
context for every prompt.

---

## GitHub (optional)

Connect a **fine-grained personal access token** in **Settings → GitHub**.

- The token is stored locally and redacted from logs.
- Browse repositories, branches, and file trees; read files; search code and repositories.
- Create repositories, commit and push text files, and open issues or pull requests.
- Add search matches to the reference library.

Enable **Search GitHub with every prompt** to give the AI related public repositories and code as
context. Binary assets and very large batches should be downloaded rather than pushed; keep
individual pushed files under 25 MB and batches under 50 MB.

---

## Your data

| Data | Location |
| --- | --- |
| Settings, logs, mods, references | `Documents\3D Creator Studio` |
| Projects | `E:\CREATOR STUDIO` when drive `E:` exists, otherwise `Documents\3D Creator Studio Projects` |

The project folder is configurable in Settings. Open **Settings → Diagnostics** to browse logs,
open the exact log folder, or download the current log. Logs are JSONL and have API keys and
tokens redacted.

Back up `Documents\3D Creator Studio` if you want to keep your settings, references, and learning
notes. Projects should be backed up separately.

---

## Troubleshooting

**The app does not open**
- Confirm the executable is still inside this folder with its DLLs, `resources`, and `locales`.
- Re-extract or re-copy the complete build if files were moved or deleted.
- Check **Settings → Diagnostics** after a successful launch, or open the log folder shown there.

**The updater stops with a folder or rename error**
- This can happen once when updating from a build older than 0.7.1 that was launched from
  its own folder. Windows will not rename a folder while a process is using it, and the
  old helper ran from inside the application folder.
- Run `install.bat` in this folder (or extract a fresh release ZIP and run it), then open
  Creator Studio. Updates work normally from 0.7.1 onward.

**Windows SmartScreen warning**
- Choose **More info → Run anyway**. The build is not code-signed.

**Blank or black window**
- Update your graphics driver.
- Close other GPU-heavy applications.
- If the problem persists, report it with the log file attached.

**AI is offline or no models appear**
- Confirm OpenCode, Hermes or Claude is installed and its local endpoint is running.
- For OpenCode, check the executable path in **Settings → OpenCode**.
- For Hermes or Claude, check **Settings → AI backends**, press **Test endpoint**, and confirm the
  selected backend has a model id and the correct OpenAI/Anthropic API style.
- Use **Test connection** and review the activity console for the exact error.

**AI requests time out**
- Choose a faster model for that workspace. Model choice is saved per workspace.
- Some free or remote models are slow or queue heavily; try another provider.
- In Writing, press **Cancel** and retry with a different model.

**Unity project is not detected**
- Install the bridge package from `resources\app\unity\com.twilightstudio.creatorstudio`.
- Confirm the bridge is running in Unity under **Creator Studio → Unity Bridge**.
- Allow loopback traffic for `127.0.0.1` ports `47823–47843` in your firewall.
- Unity must be open with the project loaded; the bridge does not run in built players.

**Activation fails**
- Confirm the PC is online.
- Check the key for typos and confirm it has not expired or been activated on another device.
- Contact Twilight Studio if the key should be valid.

---

## Uninstall

1. Close Creator Studio.
2. Delete this application folder.
3. Optional: delete `Documents\3D Creator Studio` to remove settings, references, logs, and local
   AI history. This also removes your saved API keys and activation state.
4. Optional: delete the app's Electron data folder under `%APPDATA%` if you want no residual cache.

Back up projects before deleting any data folder.

---

## Third-party components

This application includes open-source and third-party components, including **Electron**,
**Chromium**, **Node.js**, **React**, **Three.js**, **Express**, and **Zustand**.

- Electron and Chromium license texts ship alongside the executable
  (`LICENSE.electron.txt` and `LICENSES.chromium.html`).
- Other components retain their own licenses and copyright notices.

Nothing in the Creator Studio license restricts rights granted to you by those component
licenses.

---

## License

Creator Studio is proprietary software by Twilight Studio. Use is governed by `LICENSE.txt` in
this folder. A valid product key is required to run the application.

---

## Support

**Twilight Studio**

- Discord: [discord.gg/V2vDQCUSNe](https://discord.gg/V2vDQCUSNe)
- Email: [twilightstudio.dev@gmail.com](mailto:twilightstudio.dev@gmail.com)
- Website: [twilightstudio.carrd.co](https://twilightstudio.carrd.co/)

When reporting a problem, include the app version, a short description, and the relevant log
lines from **Settings → Diagnostics**. Remove any personal information before sharing.

© 2026 Twilight Studio. All rights reserved.

---

**Other platform:** [Creator Studio for Linux](https://github.com/Error404-RedRose/CreatorStudio_LinuxOS)
