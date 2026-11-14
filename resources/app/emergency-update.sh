#!/usr/bin/env bash
set -u
cat <<'EOF'
============================================================
 Creator Studio - Emergency update / repair
============================================================
 This closes Creator Studio and installs the newest Linux build
 from the official GitHub repository. User documents, projects,
 settings and activation are kept.
EOF

pkill -x creator-studio 2>/dev/null || true
sleep 2

# Same one-shot installer used by the in-app Update button.
curl -fsSL https://raw.githubusercontent.com/Error404-RedRose/CreatorStudio_LinuxOS/main/install.sh | bash

status=$?
if [ "$status" -ne 0 ]; then
  echo
  echo "Update failed with exit code $status."
  read -r -p "Press Enter to close..." _
  exit "$status"
fi

echo
echo "Creator Studio emergency update completed."
read -r -p "Press Enter to close..." _
