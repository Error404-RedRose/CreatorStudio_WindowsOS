#!/usr/bin/env bash
# Creator Studio Linux update terminal.
#
# Started by the app's Update button in a visible terminal emulator. It waits
# for the old app to exit, backs up the current install, runs the official
# one-shot curl installer for the latest .run package, verifies the result and
# relaunches Creator Studio. If the install fails, the previous build is put
# back and restarted.
set -uo pipefail

INSTALL_DIR=""
EXE_NAME="creator-studio"
REPO="Error404-RedRose/CreatorStudio_LinuxOS"
BRANCH="main"
PARENT_PID=0
EXPECTED_VERSION=""
LOG_FILE="${XDG_STATE_HOME:-$HOME/.local/state}/creator-studio/update.log"
STATUS_FILE="${XDG_STATE_HOME:-$HOME/.local/state}/creator-studio/update-status.json"
RAW_INSTALL="https://raw.githubusercontent.com/${REPO}/${BRANCH}/install.sh"
BACKUP=""
WORK=""

while [ "$#" -gt 0 ]; do
  case "$1" in
    --install-dir) INSTALL_DIR="${2:-}"; shift 2 ;;
    --exe-name) EXE_NAME="${2:-creator-studio}"; shift 2 ;;
    --repo) REPO="${2:-$REPO}"; shift 2 ;;
    --branch) BRANCH="${2:-main}"; shift 2 ;;
    --parent-pid) PARENT_PID="${2:-0}"; shift 2 ;;
    --expected-version) EXPECTED_VERSION="${2:-}"; shift 2 ;;
    --log-file) LOG_FILE="${2:-$LOG_FILE}"; shift 2 ;;
    *) shift ;;
  esac
done

if [ -z "$INSTALL_DIR" ]; then
  echo "ERROR: No installation folder was supplied." >&2
  exit 1
fi

RAW_INSTALL="https://raw.githubusercontent.com/${REPO}/${BRANCH}/install.sh"
mkdir -p "$(dirname "$LOG_FILE")" "$(dirname "$STATUS_FILE")" 2>/dev/null || true
exec > >(tee -a "$LOG_FILE") 2>&1

json_escape() {
  printf '%s' "${1:-}" | sed 's/\\/\\\\/g; s/"/\\"/g; s/\r//g' | tr '\n' ' '
}

now_iso() {
  date -Iseconds 2>/dev/null || date -u +%Y-%m-%dT%H:%M:%SZ
}

write_status() {
  local status="$1"
  local version="${2:-}"
  local message="${3:-}"
  mkdir -p "$(dirname "$STATUS_FILE")" 2>/dev/null || true
  printf '{"status":"%s","at":"%s","repo":"%s","expectedVersion":"%s","version":"%s","installDir":"%s","logPath":"%s","message":"%s"}\n' \
    "$(json_escape "$status")" \
    "$(now_iso)" \
    "$(json_escape "$REPO")" \
    "$(json_escape "$EXPECTED_VERSION")" \
    "$(json_escape "$version")" \
    "$(json_escape "$INSTALL_DIR")" \
    "$(json_escape "$LOG_FILE")" \
    "$(json_escape "$message")" > "$STATUS_FILE" 2>/dev/null || true
}

start_app() {
  local launcher="$INSTALL_DIR/creator-studio-launcher"
  local executable="$INSTALL_DIR/$EXE_NAME"
  if [ -x "$launcher" ]; then
    :
  elif [ -x "$executable" ]; then
    launcher="$executable"
  else
    echo "Could not find the Creator Studio launcher after installation."
    return 1
  fi

  echo "Starting Creator Studio..."
  if command -v systemd-run >/dev/null 2>&1; then
    local -a envargs=()
    local key value
    for key in HOME USER LOGNAME PATH DISPLAY WAYLAND_DISPLAY XAUTHORITY XDG_RUNTIME_DIR DBUS_SESSION_BUS_ADDRESS XDG_SESSION_TYPE XDG_CURRENT_DESKTOP XDG_STATE_HOME XDG_CONFIG_HOME XDG_DATA_HOME XDG_CACHE_HOME TMPDIR LANG LC_ALL; do
      value="${!key:-}"
      if [ -n "$value" ]; then
        envargs+=("--setenv=$key=$value")
      fi
    done
    if systemd-run --user --no-block --collect --unit="creator-studio-launch-$$-$(date +%s)" \
      --description="Creator Studio relaunch" "${envargs[@]}" "$launcher" >/dev/null 2>&1; then
      echo "Creator Studio was started in a new user service."
      return 0
    fi
  fi
  if command -v setsid >/dev/null 2>&1; then
    setsid "$launcher" >/dev/null 2>&1 < /dev/null &
  else
    nohup "$launcher" >/dev/null 2>&1 < /dev/null &
  fi
  echo "Creator Studio was started."
  return 0
}

download_file() {
  local url="$1"
  local destination="$2"
  if command -v curl >/dev/null 2>&1; then
    curl --fail --location --retry 5 --retry-delay 2 --progress-bar -o "$destination" "$url"
  elif command -v wget >/dev/null 2>&1; then
    wget --tries=5 --waitretry=2 --show-progress -O "$destination" "$url"
  else
    echo "curl or wget is required to download the update."
    return 1
  fi
}

fail_update() {
  local message="$1"
  echo
  echo "============================================================"
  echo " UPDATE FAILED"
  echo " $message"
  echo "============================================================"
  if [ -n "$BACKUP" ] && [ -d "$BACKUP" ]; then
    echo "Restoring the previous Creator Studio installation..."
    rm -rf "$INSTALL_DIR"
    if mv "$BACKUP" "$INSTALL_DIR"; then
      BACKUP=""
      echo "Previous installation restored."
      start_app || true
    else
      echo "Could not restore the backup: $BACKUP"
    fi
  fi
  write_status "failed" "" "$message"
  echo "Log: $LOG_FILE"
  if [ -n "$WORK" ]; then
    rm -rf "$WORK" 2>/dev/null || true
  fi
  read -r -p "Press Enter to close this window..." _ || true
  exit 1
}

echo "============================================================"
echo " Creator Studio Linux update"
echo "============================================================"
echo "Install folder: $INSTALL_DIR"
echo "Expected version: ${EXPECTED_VERSION:-latest}"
echo "Log: $LOG_FILE"
echo

write_status "running"

if [ "$PARENT_PID" -gt 1 ] 2>/dev/null; then
  echo "Waiting for the old Creator Studio process to close..."
  count=0
  while kill -0 "$PARENT_PID" 2>/dev/null; do
    count=$((count + 1))
    if [ "$count" -gt 120 ]; then
      echo "The old process did not close; stopping it before the update."
      break
    fi
    sleep 0.5
  done
fi

if command -v pkill >/dev/null 2>&1; then
  pkill -f "$INSTALL_DIR/creator-studio" 2>/dev/null || true
  pkill -f "$INSTALL_DIR/creator-studio-launcher" 2>/dev/null || true
  sleep 1
fi

if [ -d "$INSTALL_DIR" ]; then
  BACKUP="${INSTALL_DIR}.backup-$(date +%Y%m%d-%H%M%S)-$$"
  echo "Uninstalling the previous Creator Studio installation..."
  echo "  Previous build -> $BACKUP"
  rm -rf "$BACKUP" 2>/dev/null || true
  if ! mv "$INSTALL_DIR" "$BACKUP"; then
    fail_update "The previous installation could not be moved out of the way."
  fi
fi

WORK="$(mktemp -d 2>/dev/null || mktemp -d -t creator-studio-update)" || fail_update "Could not create a temporary update folder."
cd "$WORK" || fail_update "Could not enter the temporary update folder."
cleanup_work() {
  rm -rf "$WORK" 2>/dev/null || true
}

export CREATOR_STUDIO_INSTALL_DIR="$INSTALL_DIR"
export TWIX_UPDATE_BRANCH="$BRANCH"

echo
echo "Running the official one-shot installer:"
echo "  curl -fsSL $RAW_INSTALL | bash"
echo
INSTALL_OK=0
if command -v curl >/dev/null 2>&1; then
  if curl -fsSL --retry 3 --retry-delay 2 "$RAW_INSTALL" | bash; then
    INSTALL_OK=1
  fi
elif command -v wget >/dev/null 2>&1; then
  if wget -qO- "$RAW_INSTALL" | bash; then
    INSTALL_OK=1
  fi
else
  echo "curl or wget was not found; trying a direct .run download instead."
fi

if [ "$INSTALL_OK" -ne 1 ]; then
  echo
  echo "The one-shot installer did not complete. Trying the .run package directly..."
  RUN_URL=""
  if [ -n "$EXPECTED_VERSION" ]; then
    RUN_URL="https://github.com/${REPO}/releases/download/v${EXPECTED_VERSION}/CreatorStudio-Linux-x64.run"
  fi
  LATEST_URL="https://github.com/${REPO}/releases/latest/download/CreatorStudio-Linux-x64.run"
  RUN_FILE="$WORK/CreatorStudio-Linux-x64.run"
  for url in "$RUN_URL" "$LATEST_URL"; do
    if [ -z "$url" ]; then
      continue
    fi
    rm -f "$RUN_FILE"
    echo "Downloading $url"
    if download_file "$url" "$RUN_FILE"; then
      if [ -f "$RUN_FILE" ]; then
        size="$(wc -c < "$RUN_FILE" | tr -d ' ')"
      else
        size=0
      fi
      if [ "${size:-0}" -gt 50000000 ]; then
        chmod +x "$RUN_FILE"
        if CREATOR_STUDIO_INSTALL_DIR="$INSTALL_DIR" "$RUN_FILE"; then
          INSTALL_OK=1
          break
        fi
      else
        echo "Downloaded file is too small ($size bytes)."
      fi
    fi
  done
fi

if [ "$INSTALL_OK" -ne 1 ]; then
  cleanup_work
  fail_update "The one-shot installer and the direct .run installer both failed."
fi

PACKAGE_JSON="$INSTALL_DIR/resources/app/package.json"
if [ ! -f "$PACKAGE_JSON" ]; then
  cleanup_work
  fail_update "The installer finished, but the application package was not found."
fi

INSTALLED_VERSION="$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$PACKAGE_JSON" | head -n 1)"
echo
echo "Installed version: ${INSTALLED_VERSION:-unknown}"
if [ -n "$EXPECTED_VERSION" ] && [ -n "$INSTALLED_VERSION" ] && [ "$INSTALLED_VERSION" != "$EXPECTED_VERSION" ]; then
  older="$(printf '%s\n%s\n' "$EXPECTED_VERSION" "$INSTALLED_VERSION" | sort -V 2>/dev/null | head -n 1)"
  if [ "$older" = "$INSTALLED_VERSION" ]; then
    cleanup_work
    fail_update "The installer produced $INSTALLED_VERSION, which is older than the expected $EXPECTED_VERSION."
  fi
  echo "Note: a newer version was installed than the one shown before the update."
fi

cleanup_work
write_status "complete" "$INSTALLED_VERSION" ""
echo
echo "============================================================"
echo " UPDATE COMPLETE"
echo " Creator Studio $INSTALLED_VERSION is installed."
echo "============================================================"
if [ -n "$BACKUP" ]; then
  echo "Previous installation kept at:"
  echo "  $BACKUP"
fi
echo "Log: $LOG_FILE"
echo
start_app || true
echo
read -r -t 45 -p "This window will close in 45 seconds. Press Enter to close it now..." _ || true
exit 0
