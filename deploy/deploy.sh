#!/usr/bin/env bash
# ------------------------------------------------------------
#  Deploy the NoteOS / Threshold static site to a Hostinger VPS.
#
#  Usage:
#     cp deploy/.env.example deploy/.env   # fill it in once
#     ./deploy/deploy.sh
#
#  It rsyncs the static files to $VPS_PATH on the server.
#  Run ./deploy/deploy.sh --setup-nginx once to install the
#  nginx server block (requires sudo on the server).
# ------------------------------------------------------------
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# ---- load config ----
if [[ -f deploy/.env ]]; then
  set -a; source deploy/.env; set +a
fi
: "${VPS_HOST:?Set VPS_HOST in deploy/.env}"
: "${VPS_USER:?Set VPS_USER in deploy/.env}"
: "${VPS_PATH:?Set VPS_PATH in deploy/.env}"
VPS_PORT="${VPS_PORT:-22}"
DOMAIN="${DOMAIN:-noteos.in}"

SSH_OPTS=(-p "$VPS_PORT" -o StrictHostKeyChecking=accept-new)
RSYNC_SSH="ssh -p $VPS_PORT -o StrictHostKeyChecking=accept-new"
if [[ -n "${VPS_SSH_KEY:-}" ]]; then
  KEY="${VPS_SSH_KEY/#\~/$HOME}"
  SSH_OPTS+=(-i "$KEY")
  RSYNC_SSH="$RSYNC_SSH -i $KEY"
fi
TARGET="${VPS_USER}@${VPS_HOST}"

# ---- optional one-time nginx setup ----
if [[ "${1:-}" == "--setup-nginx" ]]; then
  echo "→ Installing nginx server block for $DOMAIN on $TARGET"
  scp "${SSH_OPTS[@]}" deploy/nginx.conf "${TARGET}:/tmp/noteos.conf"
  ssh "${SSH_OPTS[@]}" "$TARGET" bash -s <<EOF
set -e
sudo sed -i "s/__DOMAIN__/${DOMAIN}/g; s#__ROOT__#${VPS_PATH}#g" /tmp/noteos.conf
sudo mkdir -p ${VPS_PATH}
sudo mv /tmp/noteos.conf /etc/nginx/sites-available/noteos.conf
sudo ln -sf /etc/nginx/sites-available/noteos.conf /etc/nginx/sites-enabled/noteos.conf
sudo nginx -t && sudo systemctl reload nginx
echo "nginx configured. For HTTPS run:  sudo certbot --nginx -d ${DOMAIN} -d www.${DOMAIN}"
EOF
  echo "✓ nginx setup complete"
  exit 0
fi

# ---- guard: anon key must be set ----
if grep -q "PASTE_YOUR_SUPABASE_ANON_KEY_HERE" supabase-config.js; then
  echo "✗ supabase-config.js still has the placeholder anon key. Set it before deploying." >&2
  exit 1
fi

# ---- deploy ----
echo "→ Deploying to ${TARGET}:${VPS_PATH}"
ssh "${SSH_OPTS[@]}" "$TARGET" "mkdir -p '${VPS_PATH}'"
rsync -avz --delete \
  -e "$RSYNC_SSH" \
  --include='index.html' \
  --include='supabase-config.js' \
  --include='manifest.json' \
  --include='sw.js' \
  --include='README.md' \
  --include='icons/' \
  --include='icons/***' \
  --exclude='*' \
  ./ "${TARGET}:${VPS_PATH}/"

echo "✓ Deployed. Visit https://${DOMAIN}"
