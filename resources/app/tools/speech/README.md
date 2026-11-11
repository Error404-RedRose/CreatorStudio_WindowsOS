# Creator Studio speech engine

The microphone is a first-party Creator Studio feature. It runs entirely on
this PC and uses only the virtual environment inside this folder. Creator
Studio never falls back to a BitBoy install or to system Python.

## Pieces

- `twix_speech.py` - push-to-talk Whisper engine. It prints `[READY]` after the
  model loads and only records while the control file is set to `1` or the
  physical Right Control key is held. After release it transcribes the whole
  clip, waits for every modifier key to come up, then types the finished text
  from the current caret, one character at a time. It never backspaces into
  text that was already in the box.
- `mic_overlay.py` - the always-on-top status card. It appears at the **top
  center** of the screen while Right Control is held and while the transcript
  is being processed and typed. Progress is shown as a bar with the percentage
  underneath, and the card stays up for a short "Done" moment at 100%.
- `../../server/speech.mjs` - spawns and supervises the Python process, writes
  the push-to-talk control file, and exposes `/api/speech/*`. It also launches
  the overlay.
- `../../src/components/SettingsModal.tsx` - the Microphone tab: enable or
  disable dictation, pick an input device, pick a model, and set the typing
  cadence (default 30 ms per character).

Hotkey: **Right Control only** (fixed; hold to talk, release to finish). Left
Control is ignored. It works system-wide while Creator Studio is running, so
the transcript goes into whichever text box is focused, inside or outside the
app.

## Install the local Python environment

```bat
tools\speech\setup.bat
```

This creates `tools/speech/venv` and installs the requirements. Creator Studio
uses only this venv. The Windows builder verifies that `twix_speech.py`,
`mic_overlay.py`, `requirements.txt` and `venv\Scripts\python.exe` are present
both before packaging and inside the finished build, and stops with an error
if the voice engine is missing from the packaged app.

The first transcription downloads the selected Whisper model (`small.en` by
default). Set `TWIX_MODEL` or edit `speech.model` in Settings to change it.
`TWIX_DEVICE` can be `cpu` or `cuda`.

## How push-to-talk works

1. The app starts and warms the engine in the background.
2. Holding Right Control records; the overlay appears at the top of the screen.
3. Releasing it trims and transcribes the complete utterance.
4. Every Ctrl/Shift/Alt key is released before typing starts, then the final
   text is written letter by letter with a small human pace. Starting a new
   hold cancels any typing that is still in progress, so the transcript can
   never turn into Ctrl+Backspace or other shortcut damage.
