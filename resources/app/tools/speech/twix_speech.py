#!/usr/bin/env python
# Creator Studio speech engine (Windows)
#
# Push-to-talk mode:
#   python twix_speech.py --control "%TEMP%/creator-studio-ptt.txt" --hotkey "right ctrl"
#
# The engine stays warm, records only while the physical Right Control key is
# held, transcribes the complete clip with Whisper, then types the finished
# sentence forward one character at a time. It never backspaces into text that
# was already in the target box; typing starts exactly at the caret.

import argparse
import ctypes
import json
import os
import queue
import shutil
import string
import subprocess
import sys
import threading
import time
from collections import deque

import numpy as np
import webrtcvad

try:
    import sounddevice as sd
except Exception as _sd_error:
    sd = None

try:
    import soundcard as sc
except Exception:
    sc = None

SAMPLE_RATE_HZ = 16000
FRAME_MS = 30
FRAME_SAMPLES = int(SAMPLE_RATE_HZ * FRAME_MS / 1000)
FRAME_BYTES = FRAME_SAMPLES * 2
VAD_MODE = 2
MIN_SPEECH_MS = 240
END_SILENCE_MS = 500
PRE_ROLL_MS = 200
MAX_HOLD_SECONDS = 90

BEEP_ON_HZ = 820
BEEP_OFF_HZ = 420
BEEP_MS = 90
TRUTHY = {"1", "on", "true", "start", "hold", "active", "yes"}
_PUNCT_TRANSLATION = str.maketrans("", "", string.punctuation)
# Whisper occasionally emits typographic punctuation that Windows keyboard
# injection cannot always map to a key. Normalise it to plain ASCII.
_GLYPH_MAP = str.maketrans(
    {
        "\u2018": "'",
        "\u2019": "'",
        "\u201c": '"',
        "\u201d": '"',
        "\u2013": "-",
        "\u2014": "-",
        "\u2026": "...",
    }
)

KEYEVENTF_KEYUP = 0x0002
MODIFIER_VKS = (0x11, 0x10, 0x12, 0x5B, 0x5C, 0xA2, 0xA3, 0xA0, 0xA1, 0xA4, 0xA5)
_LOG_LOCK = threading.Lock()


def log(message: str) -> None:
    # The recorder, transcriber and typer threads all log. Without a lock,
    # their separate print() writes can interleave into one line, which breaks
    # the overlay's [PTT]/[PROGRESS]/[DONE] state parsing.
    with _LOG_LOCK:
        print(message, flush=True)


def refresh_devices() -> None:
    """Re-enumerate PortAudio so a headset connected later is visible."""
    if sd is None:
        return
    try:
        sd._terminate()
    except Exception:
        pass
    try:
        sd._initialize()
    except Exception:
        pass


def modifier_is_down() -> bool:
    """True when Ctrl, Shift or Alt is physically held right now."""
    try:
        user32 = ctypes.windll.user32  # type: ignore[attr-defined]
    except Exception:
        return False
    for vk in (0x11, 0x10, 0x12, 0xA2, 0xA3):
        try:
            if user32.GetAsyncKeyState(vk) & 0x8000:
                return True
        except Exception:
            return False
    return False


def release_modifiers() -> None:
    """Force every modifier key up so typing can never become a shortcut."""
    try:
        import keyboard  # type: ignore

        for name in (
            "ctrl",
            "left ctrl",
            "right ctrl",
            "shift",
            "left shift",
            "right shift",
            "alt",
            "left alt",
            "right alt",
            "windows",
            "left windows",
            "right windows",
        ):
            try:
                keyboard.release(name)
            except Exception:
                pass
    except Exception:
        pass
    try:
        user32 = ctypes.windll.user32  # type: ignore[attr-defined]
        for vk in MODIFIER_VKS:
            try:
                user32.keybd_event(vk, 0, KEYEVENTF_KEYUP, 0)
            except Exception:
                pass
    except Exception:
        pass


def wait_for_modifiers_released(timeout: float = 2.5, abort=None) -> bool:
    """Wait until no modifier is held. Returns False when aborted/timed out."""
    deadline = time.monotonic() + timeout
    while modifier_is_down():
        if abort is not None and abort():
            return False
        if time.monotonic() > deadline:
            release_modifiers()
            time.sleep(0.05)
            return not modifier_is_down()
        time.sleep(0.03)
    return True


def read_control(path: str) -> bool:
    try:
        with open(path, "r", encoding="utf-8", errors="ignore") as handle:
            return handle.read().strip().lower() in TRUTHY
    except Exception:
        return False


def play_tone(freq_hz: float, duration_ms: int, volume: float = 0.2) -> None:
    if sd is None:
        return
    try:
        duration_s = duration_ms / 1000.0
        samples = int(SAMPLE_RATE_HZ * duration_s)
        if samples <= 0:
            return
        t = np.linspace(0, duration_s, samples, endpoint=False, dtype=np.float32)
        wave = (np.sin(2 * np.pi * freq_hz * t) * volume).astype(np.float32)
        sd.play(wave, SAMPLE_RATE_HZ, blocking=False)
    except Exception as error:
        log(f"[WARN] Toggle sound failed: {error}")


def linux_input_tools() -> dict:
    """Return the available Linux typing backends (Wayland first, then X11)."""
    return {
        "wtype": shutil.which("wtype"),
        "ydotool": shutil.which("ydotool"),
        "xdotool": shutil.which("xdotool"),
    }


def linux_type_text(text: str) -> bool:
    tools = linux_input_tools()
    attempts = []
    if tools["wtype"]:
        attempts.append([tools["wtype"], text])
    if tools["ydotool"]:
        attempts.append([tools["ydotool"], "type", "--", text])
    if tools["xdotool"]:
        attempts.append([tools["xdotool"], "type", "--clearmodifiers", "--", text])
    for command in attempts:
        try:
            subprocess.run(command, check=True, timeout=120)
            return True
        except Exception as error:
            log(f"[WARN] Linux typing via {os.path.basename(command[0])} failed: {error}")
    return False


def linux_press_key(key: str) -> bool:
    tools = linux_input_tools()
    attempts = []
    if tools["wtype"]:
        attempts.append([tools["wtype"], "-k", key])
    if tools["ydotool"]:
        key_codes = {"Return": "28:1 28:0", "enter": "28:1 28:0"}
        attempts.append([tools["ydotool"], "key", *key_codes.get(key, "28:1 28:0").split()])
    if tools["xdotool"]:
        attempts.append([tools["xdotool"], "key", "--clearmodifiers", key])
    for command in attempts:
        try:
            subprocess.run(command, check=True, timeout=30)
            return True
        except Exception:
            continue
    return False


def resolve_typer():
    if sys.platform.startswith("linux"):
        tools = linux_input_tools()
        preferred = "wtype" if tools["wtype"] else "ydotool" if tools["ydotool"] else "xdotool" if tools["xdotool"] else ""
        if preferred:
            def linux_writer(text: str, delay: float = 0.0) -> None:
                if not linux_type_text(text):
                    raise RuntimeError("No Linux input tool could type the transcript.")

            return linux_writer, preferred
    try:
        import keyboard  # type: ignore

        def writer(text: str, delay: float = 0.0) -> None:
            keyboard.write(text, delay=delay)

        return writer, "keyboard"
    except Exception as error:
        log(f"[WARN] keyboard module unavailable ({error}); using pyautogui.")
        try:
            import pyautogui  # type: ignore

            pyautogui.FAILSAFE = False

            def writer(text: str, delay: float = 0.0) -> None:
                pyautogui.write(text, interval=delay)

            return writer, "pyautogui"
        except Exception as fallback_error:
            log(f"[WARN] No typing backend is available: {fallback_error}")

            def writer(text: str, delay: float = 0.0) -> None:
                raise RuntimeError("No typing backend is available on this system.")

            return writer, "unavailable"


def press_enter() -> None:
    if sys.platform.startswith("linux") and linux_press_key("Return"):
        return
    try:
        import keyboard  # type: ignore

        keyboard.send("enter")
        return
    except Exception:
        pass
    try:
        import pyautogui  # type: ignore

        pyautogui.FAILSAFE = False
        pyautogui.press("enter")
    except Exception as error:
        log(f"[WARN] Enter key failed: {error}")


def foreground_title() -> str:
    try:
        user32 = ctypes.windll.user32
        hwnd = user32.GetForegroundWindow()
        length = user32.GetWindowTextLengthW(hwnd)
        buffer = ctypes.create_unicode_buffer(length + 1)
        user32.GetWindowTextW(hwnd, buffer, length + 1)
        return buffer.value
    except Exception:
        return ""


def normalize_command(text: str) -> str:
    if not text:
        return ""
    return " ".join(text.lower().translate(_PUNCT_TRANSLATION).split())


class Transcriber:
    """One accurate final transcript, typed forward at keyboard speed."""

    def __init__(self, model, language: str, type_text: bool, print_only: bool, type_delay: float = 0.03):
        self.model = model
        self.language = language
        self.type_text = type_text
        self.print_only = print_only
        self.type_delay = max(0.0, min(0.25, float(type_delay or 0.0)))
        self.microphone_enabled = True
        self.queue: queue.Queue = queue.Queue()
        self.generation = 0
        self.worker = threading.Thread(target=self._loop, daemon=True)
        self.worker.start()
        self.typer, self.typer_backend = resolve_typer()

    def begin_hold(self) -> None:
        self.generation += 1

    def end_hold(self) -> None:
        return

    def submit_final(self, audio_bytes: bytes) -> None:
        if audio_bytes:
            self.queue.put((bytes(audio_bytes), self.generation))

    def stop(self) -> None:
        self.queue.put(None)

    def _transcribe(self, audio_bytes: bytes) -> str:
        audio_i16 = np.frombuffer(audio_bytes, dtype=np.int16)
        if audio_i16.size < int(SAMPLE_RATE_HZ * 0.12):
            return ""
        audio_f32 = audio_i16.astype(np.float32) / 32768.0
        try:
            segments, _info = self.model.transcribe(
                audio_f32,
                language=self.language,
                beam_size=5,
                temperature=0.0,
                vad_filter=False,
                word_timestamps=False,
                condition_on_previous_text=False,
                without_timestamps=True,
            )
            return " ".join(segment.text.strip() for segment in segments).strip()
        except Exception as error:
            log(f"[ERROR] Transcription failed: {error}")
            return ""

    def _loop(self) -> None:
        while True:
            item = self.queue.get()
            if item is None:
                return
            audio_bytes, generation = item
            log("[PROGRESS] 2")
            text = self._transcribe(audio_bytes)
            log("[PROGRESS] 45")
            if generation != self.generation:
                # A new hold started while this clip was decoding. Drop it.
                continue
            if self._handle_command(text):
                log("[PROGRESS] 100")
                log("[DONE]")
                continue
            self._type_out(text, generation)
            log("[PROGRESS] 100")
            log("[DONE]")

    def _handle_command(self, text: str) -> bool:
        norm = normalize_command(text)
        if norm in ("activate", "activate microphone", "microphone on"):
            self.microphone_enabled = True
            log("[CMD] Microphone enabled")
            return True
        if norm in ("disable", "disable microphone", "microphone off", "disbale"):
            self.microphone_enabled = False
            log("[CMD] Microphone disabled")
            return True
        if norm in ("enter", "send"):
            log("[CMD] Enter")
            press_enter()
            return True
        return False

    def _aborted(self, generation: int) -> bool:
        return self.generation != generation

    def _type_out(self, text: str, generation: int) -> None:
        text = " ".join(str(text or "").translate(_GLYPH_MAP).split())
        if not text:
            log("[ASR] (no speech detected)")
            return
        log(f"[ASR] {text}")
        if self.print_only or not self.type_text:
            log("[PROGRESS] 95")
            return

        # The hotkey is physical Right Control. Make absolutely sure it is up
        # before the first character, otherwise the transcript turns into a
        # stream of Ctrl shortcuts (Ctrl+Backspace deletes the previous word).
        log("[PROGRESS] 50")
        release_modifiers()
        if not wait_for_modifiers_released(abort=lambda: self._aborted(generation)):
            log("[Type] Cancelled before typing: a modifier stayed down or a new hold started.")
            return
        if self._aborted(generation):
            return

        # Creator Studio's React inputs re-render on every keystroke, which is
        # slow for long dictation. Paste long text in one native event there;
        # external apps keep the per-character keyboard cadence.
        if "creator studio" in foreground_title().lower() and len(text) > 24:
            if self._paste_text(text):
                log("[PROGRESS] 95")
                log("[TYPE] pasted into Creator Studio")
                return

        time.sleep(0.08)
        total = len(text)
        last_pct = 50
        for index, char in enumerate(text):
            if self._aborted(generation):
                log("[Type] New hold started; stopped the previous transcript.")
                return
            if modifier_is_down():
                release_modifiers()
                if not wait_for_modifiers_released(abort=lambda: self._aborted(generation)):
                    log("[Type] Stopped typing because a modifier stayed down.")
                    return
            self._type_text(char)
            pause = self.type_delay
            if char in ".!?":
                pause += 0.12
            elif char in ",;:":
                pause += 0.07
            elif char == " ":
                pause += 0.01
            time.sleep(pause)
            pct = 50 + int(45 * (index + 1) / total)
            if pct != last_pct:
                last_pct = pct
                log(f"[PROGRESS] {pct}")

        if not self._aborted(generation):
            # A single trailing space keeps dictation flowing into the next sentence.
            self._type_text(" ")

    def _paste_text(self, text: str) -> bool:
        if self.print_only or not self.type_text:
            return True
        previous = None
        try:
            import pyperclip  # type: ignore

            previous = pyperclip.paste()
            pyperclip.copy(text)
        except Exception:
            return False
        try:
            import keyboard  # type: ignore

            keyboard.send("ctrl+v")
        except Exception:
            try:
                import pyautogui  # type: ignore

                pyautogui.FAILSAFE = False
                pyautogui.hotkey("ctrl", "v")
            except Exception:
                return False
        if previous is not None:
            def restore() -> None:
                try:
                    import pyperclip  # type: ignore

                    pyperclip.copy(previous)
                except Exception:
                    pass

            threading.Timer(0.8, restore).start()
        return True

    def _type_text(self, text: str) -> None:
        try:
            self.typer(text, 0.0)
            return
        except Exception as error:
            log(f"[WARN] Typing failed via {self.typer_backend}: {error}")
        try:
            import pyautogui  # type: ignore

            pyautogui.FAILSAFE = False
            pyautogui.write(text, interval=0.0)
        except Exception as error:
            log(f"[ERROR] Typing failed completely: {error}")


class HoldState:
    """Physical right-control state read directly from Windows."""

    VK_RCONTROL = 0xA3
    VK_LCONTROL = 0xA2

    def __init__(self, hotkey: str):
        self.ok = False
        self.error = ""
        self.vk = self.VK_LCONTROL if "left" in hotkey.lower() else self.VK_RCONTROL
        try:
            self.user32 = ctypes.windll.user32  # type: ignore[attr-defined]
            self.ok = True
            log(f"[Hotkey] {hotkey} is global (virtual key 0x{self.vk:02X})")
        except Exception as error:
            self.error = str(error)
            log(f"[WARN] Global hotkey unavailable ({error}); using the control file.")

    def held(self) -> bool:
        if not self.ok:
            return False
        try:
            return bool(self.user32.GetAsyncKeyState(self.vk) & 0x8000)
        except Exception:
            return False


class Microphone:
    VIRTUAL_HINTS = (
        "cable output",
        "cable input",
        "vb-audio",
        "voicemeeter",
        "voice meter",
        "virtual cable",
        "virtual audio",
        "loopback",
        "stereo mix",
        "steam streaming",
        "sound mapper",
        "primary sound capture",
    )

    @staticmethod
    def is_virtual_device(name: str) -> bool:
        lowered = str(name or "").lower()
        return any(hint in lowered for hint in Microphone.VIRTUAL_HINTS)

    @staticmethod
    def resolve_device(value: str):
        if not value:
            return None
        try:
            return int(value)
        except Exception:
            pass
        needle = str(value).strip().lower()
        if not needle:
            return None
        try:
            for index, device in enumerate(sd.query_devices()):
                if device.get("max_input_channels", 0) > 0 and needle in device.get("name", "").lower():
                    return index
        except Exception:
            return None
        return None

    @staticmethod
    def device_label(index) -> str:
        try:
            info = sd.query_devices(index)
            host = sd.query_hostapis(info.get("hostapi", 0)).get("name", "unknown")
            name = " ".join(str(info.get("name", "Microphone")).split())
            return f"{name} (index {index}, {host}, {info.get('max_input_channels', 0)} ch)"
        except Exception:
            return f"device {index}"

    @staticmethod
    def rank_input_devices(include_virtual: bool = True, usable_only: bool = True):
        """Score input devices, preferring real microphones over loopbacks.

        PortAudio's WDM-KS backend reports devices but never invokes callback
        streams on Windows, so those devices are excluded from the live engine
        unless the caller asks for the complete list (the Settings scanner).
        """
        try:
            devices = list(sd.query_devices())
        except Exception:
            return []
        ranked = []
        for index, info in enumerate(devices):
            if info.get("max_input_channels", 0) <= 0:
                continue
            name = info.get("name", "")
            virtual = Microphone.is_virtual_device(name)
            if virtual and not include_virtual:
                continue
            try:
                host = sd.query_hostapis(info.get("hostapi", 0)).get("name", "").lower()
            except Exception:
                host = ""
            if usable_only and "wdm-ks" in host:
                continue
            lowered = name.lower()
            score = -100 if virtual else 0
            if "headset" in lowered:
                score += 40
            if "microphone" in lowered or "mic" in lowered:
                score += 30
            if "array" in lowered:
                score += 10
            if "line in" in lowered:
                score += 5
            if "wasapi" in host:
                score += 8
            elif "mme" in host:
                score += 6
            elif "wdm-ks" in host:
                score += 4
            elif "directsound" in host:
                score += 3
            try:
                if float(info.get("default_samplerate") or 0) >= 16000:
                    score += 2
            except Exception:
                pass
            try:
                if int(info.get("max_input_channels") or 1) <= 2:
                    score += 2
            except Exception:
                pass
            ranked.append((score, index, name))
        ranked.sort(key=lambda item: (-item[0], item[1]))
        return ranked

    @staticmethod
    def choose_default_device():
        """Return (index, name, replaced) and skip virtual loopback cables.

        Windows can silently make VB-Cable, Stereo Mix or another loopback the
        default input. Those devices deliver silence for dictation even though
        PortAudio opens them successfully, so prefer a real microphone when the
        user has not explicitly selected a device.
        """
        try:
            default_index = sd.default.device[0]
        except Exception:
            default_index = None
        try:
            devices = list(sd.query_devices())
        except Exception:
            return default_index, None, False
        if default_index is not None and 0 <= default_index < len(devices):
            info = devices[default_index]
            name = info.get("name", "system default")
            if info.get("max_input_channels", 0) > 0 and not Microphone.is_virtual_device(name):
                return default_index, name, False
        ranked = Microphone.rank_input_devices(include_virtual=False)
        if ranked:
            return ranked[0][1], ranked[0][2], True
        return default_index, None, False

    @staticmethod
    def describe_device(device_value: str):
        try:
            if device_value:
                index = Microphone.resolve_device(device_value)
                if index is None:
                    log(f"[WARN] Selected microphone '{device_value}' was not found; using the best available input.")
                    index, _name, _replaced = Microphone.choose_default_device()
            else:
                index, name, replaced = Microphone.choose_default_device()
                if replaced:
                    log(f"[Mic] The Windows default input is a virtual loopback; using {name} instead.")
            if index is None or index < 0:
                return None, "system default"
            return index, Microphone.device_label(index)
        except Exception:
            return None, str(device_value or "system default")

    def __init__(self):
        self.vad = webrtcvad.Vad(VAD_MODE)
        self.audio_q: queue.Queue = queue.Queue(maxsize=480)
        self.pending = bytearray()
        self.stream = None
        self.device_value = ""
        self.device_index = None
        self.device_name = "system default"
        self.stream_rate = SAMPLE_RATE_HZ
        self.started_at = 0.0
        self.last_block_at = 0.0
        self.block_count = 0
        self.peak = 0
        self.stream_error = ""
        self.last_status = ""
        self.last_detected = []

    def start(self, device_value: str = "") -> None:
        self.device_value = str(device_value or "")
        try:
            sd.default.channels = 1
        except Exception:
            pass
        self.stream_error = ""
        self.last_status = ""
        self.last_detected = []
        ranked = Microphone.rank_input_devices(include_virtual=bool(self.device_value), usable_only=True)
        candidates = []
        seen = set()
        if self.device_value:
            explicit = Microphone.resolve_device(self.device_value)
            if explicit is not None:
                try:
                    host = sd.query_hostapis(sd.query_devices(explicit).get("hostapi", 0)).get("name", "").lower()
                except Exception:
                    host = ""
                if "wdm-ks" in host:
                    log("[WARN] Windows WDM-KS microphones cannot stream audio reliably; choose an MME or WASAPI device.")
                else:
                    candidates.append(explicit)
                    seen.add(explicit)
            else:
                log(f"[WARN] Selected microphone '{self.device_value}' was not found; using the best available input.")
        default_index, default_name, replaced = Microphone.choose_default_device()
        if replaced:
            log(f"[Mic] The Windows default input is a virtual loopback; using {default_name} instead.")
        if default_index is not None and default_index not in seen:
            try:
                default_label = sd.query_devices(default_index).get("name", "")
            except Exception:
                default_label = default_name or ""
            # Never silently use a loopback/virtual cable when the user has not
            # explicitly selected one. It opens fine but records pure silence.
            if self.device_value or not Microphone.is_virtual_device(default_label):
                candidates.append(default_index)
                seen.add(default_index)
        for _score, index, _name in ranked:
            if index in seen:
                continue
            candidates.append(index)
            seen.add(index)
        if not candidates:
            detected = []
            try:
                for _index, info in enumerate(sd.query_devices()):
                    if info.get("max_input_channels", 0) > 0:
                        detected.append(" ".join(str(info.get("name", "")).split()))
            except Exception:
                pass
            self.last_detected = detected
            raise RuntimeError(
                "No usable microphone found. Connect a microphone or enable it in Windows Sound settings; "
                "the engine will start automatically when a device appears."
            )

        errors = []
        for index in candidates:
            label = Microphone.device_label(index)
            rates = [SAMPLE_RATE_HZ]
            try:
                native = int(float(sd.query_devices(index).get("default_samplerate") or SAMPLE_RATE_HZ))
            except Exception:
                native = SAMPLE_RATE_HZ
            if native and native != SAMPLE_RATE_HZ:
                rates.append(native)
            for rate in rates:
                stream = None
                try:
                    sd.check_input_settings(device=index, samplerate=rate, dtype="int16", channels=1)
                except Exception as error:
                    # Some host APIs reject the probe but still open the stream.
                    errors.append(f"{label} @ {rate} Hz: {error}")
                try:
                    blocksize = max(FRAME_SAMPLES, int(round(rate * FRAME_MS / 1000.0)))
                    stream = sd.RawInputStream(
                        device=index,
                        samplerate=rate,
                        blocksize=blocksize,
                        dtype="int16",
                        channels=1,
                        callback=self._callback,
                    )
                    stream.start()
                    self.stream = stream
                    self.stream_rate = rate
                    self.device_index = index
                    self.device_name = label
                    self.started_at = time.monotonic()
                    self.last_block_at = self.started_at
                    self.block_count = 0
                    self.peak = 0
                    self.stream_error = ""
                    log(f"[Mic] Using input device: {label} at {rate} Hz")
                    if rate != SAMPLE_RATE_HZ:
                        log(f"[Mic] Resampling {rate} Hz input to {SAMPLE_RATE_HZ} Hz in software.")
                    log(f"[Mic] Stream open, {FRAME_MS} ms frames.")
                    return
                except Exception as error:
                    errors.append(f"{label} @ {rate} Hz: {error}")
                    if stream is not None:
                        try:
                            stream.close()
                        except Exception:
                            pass
        raise RuntimeError("Could not open any microphone. " + " | ".join(errors[-5:]))

    def _callback(self, indata, frames, time_info, status):
        if status:
            text = str(status)
            if text != self.last_status:
                self.last_status = text
                log(f"[Audio] {text}")
        try:
            data = bytes(indata)
            if self.stream_rate != SAMPLE_RATE_HZ and len(data) >= 2:
                source = np.frombuffer(data, dtype=np.int16).astype(np.float32)
                if source.size:
                    target_len = max(1, int(round(source.size * SAMPLE_RATE_HZ / self.stream_rate)))
                    positions = np.linspace(0, source.size - 1, target_len, dtype=np.float32)
                    source = np.interp(positions, np.arange(source.size, dtype=np.float32), source)
                    data = np.clip(source, -32768, 32767).astype(np.int16).tobytes()
            self.last_block_at = time.monotonic()
            self.block_count += 1
            if len(data) >= 2:
                try:
                    block_peak = int(np.max(np.abs(np.frombuffer(data, dtype=np.int16))))
                    self.peak = max(self.peak, block_peak)
                except Exception:
                    pass
            try:
                self.audio_q.put_nowait(data)
            except queue.Full:
                # A stalled consumer must never wedge the PortAudio callback.
                # Drop the oldest block and keep the newest audio.
                try:
                    self.audio_q.get_nowait()
                except queue.Empty:
                    pass
                try:
                    self.audio_q.put_nowait(data)
                except queue.Full:
                    pass
        except Exception as error:
            self.stream_error = str(error)
            log(f"[ERROR] Microphone callback failed: {error}")

    def read_frame(self, timeout: float = 0.1):
        if self.stream is None:
            return None
        try:
            block = self.audio_q.get(timeout=timeout)
        except queue.Empty:
            return None
        self.pending.extend(block)
        if len(self.pending) < FRAME_BYTES:
            return None
        frame = bytes(self.pending[:FRAME_BYTES])
        del self.pending[:FRAME_BYTES]
        return frame

    def drain(self, limit: int = 400) -> None:
        count = 0
        while count < limit:
            try:
                self.audio_q.get_nowait()
                count += 1
            except queue.Empty:
                break
        self.pending.clear()

    def is_stale(self, seconds: float = 12.0) -> bool:
        if self.stream is None:
            return True
        return time.monotonic() - self.last_block_at > seconds

    def restart(self) -> None:
        log("[Mic] Reopening the input stream...")
        self.stop()
        time.sleep(0.15)
        refresh_devices()
        self.start(self.device_value)
        log(f"[Mic] Reopened: {self.device_name}")

    def snapshot(self):
        return {
            "device": self.device_name,
            "blocks": self.block_count,
            "peak": self.peak,
            "lastBlockAgeMs": int((time.monotonic() - self.last_block_at) * 1000)
            if self.last_block_at
            else -1,
            "streamError": self.stream_error,
        }

    def trim(self, frames):
        if not frames:
            return b""
        voiced = []
        for index, frame in enumerate(frames):
            try:
                if self.vad.is_speech(frame, SAMPLE_RATE_HZ):
                    voiced.append(index)
            except Exception:
                pass
        if not voiced:
            return b"".join(frames)
        start = max(0, voiced[0] - 4)
        end = min(len(frames), voiced[-1] + 5)
        return b"".join(frames[start:end])

    def stop(self) -> None:
        if self.stream is not None:
            try:
                self.stream.stop()
                self.stream.close()
            except Exception:
                pass
            self.stream = None
        try:
            self.drain()
        except Exception:
            pass
        self.last_block_at = time.monotonic()


class SoundcardMicrophone:
    """PulseAudio/PipeWire capture without PortAudio.

    NixOS and minimal images do not provide an FHS libportaudio, but the
    desktop audio server is always available. soundcard talks to PulseAudio
    (including PipeWire's Pulse compatibility) and records at 16 kHz.
    """

    def __init__(self):
        self.vad = webrtcvad.Vad(VAD_MODE)
        self.audio_q: queue.Queue = queue.Queue(maxsize=480)
        self.pending = bytearray()
        self.mic = None
        self.thread = None
        self.stop_event = threading.Event()
        self.device_value = ""
        self.device_name = "system default"
        self.started_at = 0.0
        self.last_block_at = 0.0
        self.block_count = 0
        self.peak = 0
        self.stream_error = ""
        self.last_detected = []

    @staticmethod
    def _microphones():
        return list(sc.all_microphones(include_loopback=False))

    def _resolve(self, value: str):
        microphones = self._microphones()
        self.last_detected = [" ".join(str(item.name).split()) for item in microphones[:8]]
        if value:
            try:
                index = int(value)
                if 0 <= index < len(microphones):
                    return microphones[index]
            except Exception:
                pass
            needle = str(value).strip().lower()
            for item in microphones:
                if needle and needle in str(item.name).lower():
                    return item
        try:
            return sc.default_microphone()
        except Exception:
            return microphones[0] if microphones else None

    def start(self, device_value: str = "") -> None:
        if sc is None:
            raise RuntimeError(
                "The Linux speech capture backend is missing. Creator Studio is preparing it automatically."
            )
        self.device_value = str(device_value or "")
        self.stream_error = ""
        self.pending.clear()
        self.audio_q = queue.Queue(maxsize=480)
        self.mic = self._resolve(self.device_value)
        if self.mic is None:
            raise RuntimeError("No PulseAudio/PipeWire microphone was found.")
        self.device_name = " ".join(str(self.mic.name).split())
        self.stop_event.clear()
        self.thread = threading.Thread(target=self._loop, daemon=True)
        self.thread.start()
        self.started_at = time.monotonic()
        self.last_block_at = self.started_at
        self.block_count = 0
        self.peak = 0
        for _ in range(20):
            if self.block_count > 0 or self.stream_error:
                break
            time.sleep(0.05)
        if self.stream_error:
            raise RuntimeError(self.stream_error)
        log(f"[Mic] Using PulseAudio/PipeWire input: {self.device_name}")

    def _loop(self) -> None:
        try:
            with self.mic.recorder(samplerate=SAMPLE_RATE_HZ, channels=1) as recorder:
                while not self.stop_event.is_set():
                    data = recorder.record(numframes=FRAME_SAMPLES)
                    if data is None:
                        continue
                    samples = np.asarray(data, dtype=np.float32).reshape(-1)
                    if samples.size == 0:
                        continue
                    pcm = np.clip(samples, -1.0, 1.0)
                    pcm = (pcm * 32767.0).astype(np.int16).tobytes()
                    self.last_block_at = time.monotonic()
                    self.block_count += 1
                    if len(pcm) >= 2:
                        try:
                            self.peak = max(
                                self.peak,
                                int(np.max(np.abs(np.frombuffer(pcm, dtype=np.int16)))),
                            )
                        except Exception:
                            pass
                    try:
                        self.audio_q.put_nowait(pcm)
                    except queue.Full:
                        try:
                            self.audio_q.get_nowait()
                        except queue.Empty:
                            pass
                        try:
                            self.audio_q.put_nowait(pcm)
                        except queue.Full:
                            pass
        except Exception as error:
            self.stream_error = str(error)
            log(f"[ERROR] PulseAudio/PipeWire capture failed: {error}")

    def read_frame(self, timeout: float = 0.1):
        try:
            block = self.audio_q.get(timeout=timeout)
        except queue.Empty:
            return None
        self.pending.extend(block)
        if len(self.pending) < FRAME_BYTES:
            return None
        frame = bytes(self.pending[:FRAME_BYTES])
        del self.pending[:FRAME_BYTES]
        return frame

    def drain(self, limit: int = 400) -> None:
        count = 0
        while count < limit:
            try:
                self.audio_q.get_nowait()
                count += 1
            except queue.Empty:
                break
        self.pending.clear()

    def is_stale(self, seconds: float = 12.0) -> bool:
        if self.thread is None or not self.thread.is_alive():
            return True
        return time.monotonic() - self.last_block_at > seconds

    def restart(self) -> None:
        log("[Mic] Reopening the PulseAudio/PipeWire input...")
        self.stop()
        time.sleep(0.15)
        self.start(self.device_value)
        log(f"[Mic] Reopened: {self.device_name}")

    def snapshot(self):
        return {
            "device": self.device_name,
            "blocks": self.block_count,
            "peak": self.peak,
            "lastBlockAgeMs": int((time.monotonic() - self.last_block_at) * 1000)
            if self.last_block_at
            else -1,
            "streamError": self.stream_error,
        }

    def trim(self, frames):
        return Microphone.trim(self, frames)

    def stop(self) -> None:
        self.stop_event.set()
        thread = self.thread
        self.thread = None
        if thread is not None and thread.is_alive():
            try:
                thread.join(timeout=1.5)
            except Exception:
                pass
        try:
            self.drain()
        except Exception:
            pass
        self.last_block_at = time.monotonic()


def load_model(model_size: str, device: str):
    log(f"[Init] Loading faster-whisper '{model_size}' on {device}...")
    from faster_whisper import WhisperModel

    if device.lower() == "cuda":
        for compute in ("float16", "float32"):
            try:
                model = WhisperModel(model_size, device="cuda", compute_type=compute, num_workers=1)
                log(f"[Init] Using GPU (CUDA, {compute}).")
                return model
            except Exception as error:
                log(f"[Init] CUDA {compute} failed: {error}")
        log("[Init] Falling back to CPU int8.")
    threads = max(2, (os.cpu_count() or 4) - 1)
    model = WhisperModel(model_size, device="cpu", compute_type="int8", cpu_threads=threads, num_workers=1)
    log(f"[Init] Using CPU (int8, {threads} threads).")
    return model


def ptt_loop(mic: Microphone, transcriber: Transcriber, control: str, beep: bool, hold=None) -> None:
    active = False
    frames = []
    active_since = 0.0
    last_stream_check = time.monotonic()
    while True:
        physical = bool(hold.held()) if (hold is not None and hold.ok) else False
        requested = read_control(control) if control else False
        held = physical or requested
        if held and not active:
            active = True
            active_since = time.monotonic()
            frames = []
            mic.drain()
            transcriber.begin_hold()
            if beep:
                play_tone(BEEP_ON_HZ, BEEP_MS)
            log("[PTT] Recording")
            continue
        if active:
            frame = mic.read_frame(timeout=0.02)
            if frame is not None:
                frames.append(frame)
            expired = time.monotonic() - active_since > MAX_HOLD_SECONDS
            if not held or expired:
                for _ in range(12):
                    extra = mic.read_frame(timeout=0.001)
                    if extra is None:
                        break
                    frames.append(extra)
                transcriber.end_hold()
                hold_ms = int((time.monotonic() - active_since) * 1000)
                captured_ms = int(len(frames) * FRAME_MS)
                peak = 0
                for frame in frames:
                    if len(frame) < 2:
                        continue
                    try:
                        peak = max(peak, int(np.max(np.abs(np.frombuffer(frame, dtype=np.int16)))))
                    except Exception:
                        pass
                log(f"[AUDIO] hold={hold_ms}ms captured={captured_ms}ms peak={peak}")
                audio = mic.trim(frames)
                if len(audio) >= int(SAMPLE_RATE_HZ * 0.15) * 2:
                    transcriber.submit_final(audio)
                    log("[PTT] Final transcript queued")
                else:
                    # A long hold with no frames means Windows/Bluetooth stopped
                    # the PortAudio stream (for example after the headset slept).
                    # Reopen it now so the next hold is not silently empty.
                    if hold_ms >= 350 and captured_ms < 100:
                        log("[WARN] The microphone delivered no audio. Reopening the input device...")
                        try:
                            mic.restart()
                        except Exception as error:
                            log(f"[ERROR] Could not reopen the microphone: {error}")
                    elif hold_ms >= 350 and peak == 0:
                        log("[WARN] The microphone delivered silence. Check the Windows input device and mute state.")
                    log("[PROGRESS] 100")
                    log("[DONE]")
                if mic.stream_error:
                    log(f"[ERROR] Microphone stream error: {mic.stream_error}")
                active = False
                frames = []
                if beep:
                    play_tone(BEEP_OFF_HZ, BEEP_MS)
        else:
            mic.read_frame(timeout=0.05)
            mic.drain(limit=20)
            now = time.monotonic()
            if now - last_stream_check > 5.0:
                last_stream_check = now
                if mic.is_stale(12.0):
                    log("[WARN] The microphone stream stopped delivering audio. Reopening it...")
                    try:
                        mic.restart()
                    except Exception as error:
                        log(f"[ERROR] Could not reopen the microphone: {error}")


def vad_loop(mic: Microphone, transcriber: Transcriber) -> None:
    pre_roll = deque(maxlen=max(0, PRE_ROLL_MS // FRAME_MS))
    in_speech = False
    voiced_count = 0
    silence_count = 0
    phrase = []
    min_voice = max(1, MIN_SPEECH_MS // FRAME_MS)
    end_silence = max(1, END_SILENCE_MS // FRAME_MS)
    while True:
        frame = mic.read_frame(timeout=0.1)
        if frame is None:
            continue
        try:
            is_voiced = mic.vad.is_speech(frame, SAMPLE_RATE_HZ)
        except Exception:
            is_voiced = False
        if not in_speech:
            pre_roll.append(frame)
            voiced_count = voiced_count + 1 if is_voiced else 0
            if voiced_count >= min_voice:
                in_speech = True
                silence_count = 0
                phrase = list(pre_roll)
                phrase.append(frame)
        else:
            phrase.append(frame)
            if is_voiced:
                silence_count = 0
            else:
                silence_count += 1
                if silence_count >= end_silence:
                    effective = max(0, len(phrase) - end_silence)
                    transcriber.begin_hold()
                    transcriber.submit_final(b"".join(phrase[:effective]))
                    transcriber.end_hold()
                    in_speech = False
                    voiced_count = 0
                    silence_count = 0
                    phrase = []
                    pre_roll.clear()


INSTANCE_MUTEX_NAME = "CreatorStudio.TwiXSpeechEngine"
_INSTANCE_MUTEX = None


def acquire_single_instance() -> bool:
    global _INSTANCE_MUTEX
    try:
        kernel32 = ctypes.windll.kernel32  # type: ignore[attr-defined]
        _INSTANCE_MUTEX = kernel32.CreateMutexW(None, False, INSTANCE_MUTEX_NAME)
        if kernel32.GetLastError() == 183:  # ERROR_ALREADY_EXISTS
            print("[ERROR] Another Creator Studio speech process is already running.", flush=True)
            return False
    except Exception:
        pass
    return True


def main() -> int:
    parser = argparse.ArgumentParser(description="TwiX offline speech-to-text")
    parser.add_argument("--control", default=os.environ.get("TWIX_SPEECH_CONTROL", ""))
    parser.add_argument("--hotkey", default=os.environ.get("TWIX_HOTKEY", ""))
    parser.add_argument("--input-device", default=os.environ.get("TWIX_INPUT_DEVICE", ""))
    parser.add_argument("--list-devices", action="store_true")
    parser.add_argument("--type-delay", type=float, default=float(os.environ.get("TWIX_TYPE_DELAY", "0.03")))
    parser.add_argument("--model", default=os.environ.get("TWIX_MODEL", "small.en"))
    parser.add_argument("--device", default=os.environ.get("TWIX_DEVICE", "cpu"))
    parser.add_argument("--language", default="en")
    parser.add_argument("--no-beep", action="store_true")
    parser.add_argument("--no-type", action="store_true")
    parser.add_argument("--stdout", action="store_true")
    args = parser.parse_args()

    # Device enumeration must work while the warm engine owns the
    # single-instance mutex. Handle it before acquiring the mutex.
    if args.list_devices:
        devices = []
        use_soundcard = sys.platform.startswith("linux") and sc is not None
        try:
            if use_soundcard:
                microphones = list(sc.all_microphones(include_loopback=False))
                try:
                    default_mic = sc.default_microphone()
                    default_name = " ".join(str(default_mic.name).split())
                except Exception:
                    default_name = ""
                for index, microphone in enumerate(microphones):
                    name = " ".join(str(microphone.name).split())
                    devices.append(
                        {
                            "index": index,
                            "name": name,
                            "channels": 1,
                            "default": name == default_name,
                            "recommended": name == default_name,
                            "usable": True,
                            "virtual": Microphone.is_virtual_device(name),
                            "host": "PulseAudio/PipeWire",
                        }
                    )
            elif sd is not None:
                default_input = sd.default.device[0]
                recommended_index = Microphone.choose_default_device()[0]
                for index, device in enumerate(sd.query_devices()):
                    if device.get("max_input_channels", 0) > 0:
                        name = " ".join(str(device.get("name", "Microphone")).split())
                        try:
                            host = sd.query_hostapis(device.get("hostapi", 0)).get("name", "unknown")
                        except Exception:
                            host = "unknown"
                        usable = "wdm-ks" not in host.lower()
                        virtual = Microphone.is_virtual_device(name)
                        devices.append(
                            {
                                "index": index,
                                "name": name,
                                "channels": device.get("max_input_channels", 0),
                                "default": index == default_input,
                                "recommended": index == recommended_index and usable and not virtual,
                                "usable": usable,
                                "virtual": virtual,
                                "host": host,
                            }
                        )
        except Exception as error:
            log(f"[ERROR] Could not list microphones: {error}")
        devices.sort(key=lambda item: (not item["recommended"], not item["usable"], item["virtual"], item["index"]))
        print("DEVICES_JSON=" + json.dumps(devices), flush=True)
        return 0

    if not acquire_single_instance():
        return 0

    log("[TwiX] Starting speech engine.")
    try:
        model = load_model(args.model, args.device)
    except Exception as error:
        log(f"[ERROR] Could not load the speech model: {error}")
        return 2

    transcriber = Transcriber(model, args.language, not args.no_type, args.stdout, args.type_delay)
    log(f"[Type] backend={transcriber.typer_backend} delay={transcriber.type_delay:.3f}s")

    use_soundcard = sys.platform.startswith("linux") and sc is not None
    mic = SoundcardMicrophone() if use_soundcard else Microphone()
    attempts = 0
    while True:
        try:
            refresh_devices()
            mic.start(args.input_device)
            break
        except KeyboardInterrupt:
            log("[Exit] Ctrl+C.")
            return 0
        except Exception as error:
            attempts += 1
            if attempts == 1:
                if mic.last_detected:
                    log("[Mic] Detected inputs: " + (", ".join(mic.last_detected[:8]) or "none"))
                log(f"[WARN] Microphone not available yet: {error}")
                log(
                    "[MIC] Waiting for a microphone. Connect it or enable it in your system sound settings; "
                    "the engine will start automatically when a device appears."
                )
            elif attempts % 6 == 0:
                log("[MIC] Still waiting for a microphone.")
            time.sleep(5)

    log("[READY]")
    hold = HoldState(args.hotkey) if args.hotkey else None
    try:
        if args.control or hold:
            ptt_loop(mic, transcriber, args.control, not args.no_beep, hold)
        else:
            vad_loop(mic, transcriber)
    except KeyboardInterrupt:
        log("[Exit] Ctrl+C.")
    except Exception as error:
        log(f"[ERROR] Unexpected error: {error}")
        return 1
    finally:
        mic.stop()
        transcriber.stop()
        log("[TwiX] Bye.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
