#!/bin/bash
set -e

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh"
export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

APP_NAME="talksql"
DEPLOY_DIR="/var/www/talksql"
NODE_ENTRY="$DEPLOY_DIR/server.js"
PORT="${PORT:-3100}"

log() { echo -e "${GREEN}[$(date '+%F %T')] $1${NC}"; }
warn() { echo -e "${YELLOW}[$(date '+%F %T')] WARN: $1${NC}"; }
error() {
  echo -e "${RED}[$(date '+%F %T')] ERROR: $1${NC}" >&2
  exit 1
}

detect_pm() {
  if command -v bun >/dev/null 2>&1; then
    PM="bun"
    log "✅ Using Bun ($(bun --version))"
  else
    PM="npm"
    log "⚙️  Bun not found, using npm ($(npm --version))"
  fi
}

prepare_env() {
  log "Preparing environment..."
  export NODE_ENV=production
  export NODE_OPTIONS=--max_old_space_size=4096
  [ -f "$DEPLOY_DIR/.env" ] || error "$DEPLOY_DIR/.env missing — create it with prod secrets first"
}

clean() {
  log "Cleaning old build artifacts..."
  rm -rf .next || true
}

install_deps() {
  log "Installing dependencies with $PM..."
  if [ "$PM" = "bun" ]; then
    bun install --prefer-offline
  else
    npm ci --prefer-offline --no-audit --no-fund || npm install --prefer-offline --no-audit --no-fund
  fi
}

migrate() {
  log "Running DB migrations..."
  set -a; source "$DEPLOY_DIR/.env"; set +a
  if [ "$PM" = "bun" ]; then
    bun run db:migrate
  else
    npm run db:migrate
  fi
}

build() {
  log "Building Next.js (standalone)..."
  if [ "$PM" = "bun" ]; then
    bun run build
  else
    npm run build
  fi
  [ -f ".next/standalone/server.js" ] || error "standalone output missing — is output:'standalone' set in next.config.ts?"
}

deploy() {
  log "Deploying to $DEPLOY_DIR..."
  sudo mkdir -p "$DEPLOY_DIR"
  sudo chown -R "$USER":"$USER" "$DEPLOY_DIR"

  # standalone server doesn't bundle public/ or .next/static — copy them in
  rsync -a --delete --exclude '.env' .next/standalone/ "$DEPLOY_DIR"/
  rsync -a --delete public/ "$DEPLOY_DIR"/public/
  rsync -a --delete .next/static/ "$DEPLOY_DIR"/.next/static/
}

restart_server() {
  [ -f "$NODE_ENTRY" ] || error "Server entry not found ($NODE_ENTRY) — build/deploy is broken"

  if pm2 list | grep -q "$APP_NAME"; then
    log "Reloading PM2 (zero-downtime)..."
    pm2 reload "$APP_NAME" --update-env
  else
    log "Starting PM2..."
    PORT="$PORT" HOSTNAME=127.0.0.1 pm2 start "$NODE_ENTRY" --name "$APP_NAME" --cwd "$DEPLOY_DIR"
  fi
  pm2 save
}

reload_nginx() {
  log "Reloading Nginx..."
  sudo nginx -t && sudo systemctl reload nginx || warn "Nginx reload failed"
}

main() {
  local start=$(date +%s)
  log "🚀 Starting talksql build + deploy"
  detect_pm
  prepare_env
  clean
  install_deps
  migrate
  build
  deploy
  restart_server
  reload_nginx
  log "✅ Finished in $(($(date +%s) - start))s (port $PORT)"
}

main
