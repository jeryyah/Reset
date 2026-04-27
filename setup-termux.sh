#!/data/data/com.termux/files/usr/bin/bash
# ==============================================================================
# Reset (jeryyah/Reset) — Termux Auto Setup
# ==============================================================================
# Pemakaian:
#   1. Simpan file ini di Termux, lalu:
#        chmod +x setup-termux.sh
#   2. (Opsional) export GitHub token kalau repo private atau ingin git push:
#        export GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx
#   3. Jalankan:
#        ./setup-termux.sh
#
# Skrip ini akan:
#   - update Termux & install paket sistem (node, pnpm, postgres, dll)
#   - init & start PostgreSQL lokal, buat database `reset`
#   - clone repo jeryyah/Reset (pakai GITHUB_TOKEN kalau ada)
#   - patch package.json & .npmrc supaya kompatibel dengan Termux
#   - install dependency project
#   - tanya TELEGRAM_BOT_TOKEN & ADMIN_CHAT_ID, tulis ke .env
#   - push schema database
#   - build api-server
#   - kasih instruksi cara run
# ==============================================================================

set -euo pipefail

# ---------- helpers ----------
RED=$'\033[0;31m'; GRN=$'\033[0;32m'; YLW=$'\033[1;33m'; CYA=$'\033[0;36m'; RST=$'\033[0m'
log()  { printf "%s[*]%s %s\n" "$CYA" "$RST" "$*"; }
ok()   { printf "%s[OK]%s %s\n" "$GRN" "$RST" "$*"; }
warn() { printf "%s[!]%s %s\n" "$YLW" "$RST" "$*"; }
err()  { printf "%s[X]%s %s\n" "$RED" "$RST" "$*" >&2; }

require_termux() {
  if [ -z "${PREFIX:-}" ] || [ ! -d "$PREFIX" ]; then
    err "Skrip ini harus dijalankan di Termux ('\$PREFIX' tidak terdeteksi)."
    exit 1
  fi
}

confirm() {
  local prompt="$1" default="${2:-Y}" reply
  read -r -p "$prompt [$default]: " reply || true
  reply="${reply:-$default}"
  case "$reply" in [yY]*) return 0 ;; *) return 1 ;; esac
}

# ---------- konfigurasi ----------
REPO_URL_PUBLIC="https://github.com/jeryyah/Reset.git"
REPO_OWNER="jeryyah"
REPO_NAME="Reset"
PROJECT_DIR="$HOME/Reset"
PG_DATA="$PREFIX/var/lib/postgresql"
PG_LOG="$PG_DATA/server.log"
DB_NAME="reset"

require_termux

# ==============================================================================
# 1. Update & install paket sistem
# ==============================================================================
log "Update paket Termux..."
yes | pkg update -y >/dev/null
yes | pkg upgrade -y >/dev/null

log "Install paket sistem yang diperlukan..."
pkg install -y \
  git curl nano \
  nodejs-lts \
  python build-essential clang make pkg-config \
  postgresql \
  openssl libjansson \
  tmux >/dev/null

ok "Paket sistem terpasang."
log "Versi Node: $(node -v)"

# ==============================================================================
# 2. Install pnpm
# ==============================================================================
if ! command -v pnpm >/dev/null 2>&1; then
  log "Install pnpm..."
  if ! npm install -g pnpm >/dev/null 2>&1; then
    warn "Install global gagal, mencoba via prefix lokal..."
    mkdir -p "$HOME/.npm-global"
    npm config set prefix "$HOME/.npm-global"
    if ! grep -q ".npm-global/bin" "$HOME/.bashrc" 2>/dev/null; then
      echo 'export PATH=$HOME/.npm-global/bin:$PATH' >> "$HOME/.bashrc"
    fi
    export PATH="$HOME/.npm-global/bin:$PATH"
    npm install -g pnpm
  fi
fi
ok "pnpm version: $(pnpm -v)"

# ==============================================================================
# 3. Setup PostgreSQL lokal
# ==============================================================================
if [ ! -s "$PG_DATA/PG_VERSION" ]; then
  log "Inisialisasi PostgreSQL data dir..."
  mkdir -p "$PG_DATA"
  initdb "$PG_DATA" >/dev/null
fi

if ! pg_ctl -D "$PG_DATA" status >/dev/null 2>&1; then
  log "Menjalankan PostgreSQL..."
  pg_ctl -D "$PG_DATA" -l "$PG_LOG" start >/dev/null
  sleep 2
fi
ok "PostgreSQL aktif."

PG_USER="$(whoami)"
if ! psql -lqt | cut -d \| -f 1 | grep -qw "$PG_USER"; then
  createuser --superuser "$PG_USER" 2>/dev/null || true
fi
if ! psql -lqt | cut -d \| -f 1 | grep -qw "$DB_NAME"; then
  log "Membuat database '$DB_NAME'..."
  createdb "$DB_NAME"
fi
ok "Database siap: postgres://$PG_USER@localhost:5432/$DB_NAME"

# Auto-start postgres tiap buka Termux
AUTO_START_LINE='pg_ctl -D $PREFIX/var/lib/postgresql status >/dev/null 2>&1 || pg_ctl -D $PREFIX/var/lib/postgresql -l $PREFIX/var/lib/postgresql/server.log start >/dev/null 2>&1'
if ! grep -Fq "$AUTO_START_LINE" "$HOME/.bashrc" 2>/dev/null; then
  echo "$AUTO_START_LINE" >> "$HOME/.bashrc"
  ok "Postgres akan otomatis hidup setiap buka Termux."
fi

# ==============================================================================
# 4. Clone repo (pakai GITHUB_TOKEN kalau ada)
# ==============================================================================
if [ -d "$PROJECT_DIR/.git" ]; then
  log "Repo sudah ada di $PROJECT_DIR, pull update terbaru..."
  git -C "$PROJECT_DIR" pull --ff-only || warn "git pull gagal, lanjut dengan kondisi sekarang."
else
  if [ -n "${GITHUB_TOKEN:-}" ]; then
    CLONE_URL="https://${GITHUB_TOKEN}@github.com/${REPO_OWNER}/${REPO_NAME}.git"
    log "Clone repo dengan GitHub token..."
  else
    CLONE_URL="$REPO_URL_PUBLIC"
    warn "GITHUB_TOKEN tidak diset — clone secara anonim (oke kalau repo public)."
  fi
  git clone "$CLONE_URL" "$PROJECT_DIR"
fi
ok "Project ada di $PROJECT_DIR"

cd "$PROJECT_DIR"

# ==============================================================================
# 5. Install dependency project (pakai flag, jangan modif file tracked)
# ==============================================================================
log "Install dependency (ini bisa lama di HP, sabar ya)..."
pnpm install \
  --config.node-linker=hoisted \
  --config.auto-install-peers=true \
  --config.strict-peer-dependencies=false

# Pastikan dotenv-cli tersedia untuk run dengan .env
if ! pnpm ls -w dotenv-cli >/dev/null 2>&1; then
  log "Install dotenv-cli untuk load .env..."
  pnpm add -w -D dotenv-cli
fi
ok "Dependency terpasang."

# ==============================================================================
# 7. Buat .env (interaktif)
# ==============================================================================
ENV_FILE="$PROJECT_DIR/.env"
if [ ! -f "$ENV_FILE" ]; then
  log "Membuat file .env..."

  read -r -p "TELEGRAM_BOT_TOKEN (dari @BotFather): " TG_TOKEN
  read -r -p "ADMIN_CHAT_ID (Telegram user ID admin, dari @userinfobot): " ADMIN_ID
  read -r -p "PORT untuk API server [8080]: " PORT_IN
  PORT_IN="${PORT_IN:-8080}"

  cat > "$ENV_FILE" <<EOF
# Auto-generated by setup-termux.sh
NODE_ENV=development
PORT=$PORT_IN
DATABASE_URL=postgres://$PG_USER@localhost:5432/$DB_NAME
TELEGRAM_BOT_TOKEN=$TG_TOKEN
ADMIN_CHAT_ID=$ADMIN_ID

# Auto-update settings (cek commit baru di GitHub setiap N detik)
UPDATE_INTERVAL_SEC=300
GIT_BRANCH=main
EOF
  chmod 600 "$ENV_FILE"
  ok ".env dibuat."
else
  warn ".env sudah ada — tidak ditimpa. Edit manual kalau perlu: nano $ENV_FILE"
fi

# ==============================================================================
# 8. Push schema database
# ==============================================================================
log "Push schema ke database..."
if pnpm --filter @workspace/db run push 2>/dev/null; then
  ok "Schema ter-push (via script 'push')."
elif pnpm exec dotenv -e .env -- pnpm --filter @workspace/db exec drizzle-kit push 2>/dev/null; then
  ok "Schema ter-push (via drizzle-kit push)."
else
  warn "Push schema gagal otomatis. Coba manual:"
  warn "  pnpm exec dotenv -e .env -- pnpm --filter @workspace/db exec drizzle-kit push"
fi

# ==============================================================================
# 9. Build api-server
# ==============================================================================
log "Build api-server..."
pnpm --filter @workspace/api-server run build
ok "Build selesai."

# ==============================================================================
# 10. Auto-restart pakai PM2 + boot persistence
# ==============================================================================
log "Install PM2 untuk auto-restart bot..."
if ! command -v pm2 >/dev/null 2>&1; then
  npm install -g pm2 >/dev/null 2>&1 || {
    warn "Install pm2 global gagal, coba via prefix lokal..."
    mkdir -p "$HOME/.npm-global"
    npm config set prefix "$HOME/.npm-global"
    export PATH="$HOME/.npm-global/bin:$PATH"
    npm install -g pm2
  }
fi
ok "PM2 version: $(pm2 -v)"

# Buat ecosystem config untuk PM2 (auto-load .env, auto-restart kalau crash)
ECOSYSTEM_FILE="$PROJECT_DIR/ecosystem.config.cjs"
log "Buat ecosystem.config.cjs..."
cat > "$ECOSYSTEM_FILE" <<'PMEOF'
// Auto-generated by setup-termux.sh — config PM2 untuk Reset bot.
const fs = require('fs');
const path = require('path');

const envFile = path.join(__dirname, '.env');
const env = {};
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
}

module.exports = {
  apps: [
    {
      name: 'reset-bot',
      cwd: __dirname,
      script: 'artifacts/api-server/dist/index.mjs',
      interpreter: 'node',
      interpreter_args: '--enable-source-maps',
      env,
      autorestart: true,
      restart_delay: 3000,
      max_restarts: 50,
      min_uptime: '10s',
      max_memory_restart: '400M',
      out_file: 'logs/bot.out.log',
      error_file: 'logs/bot.err.log',
      merge_logs: true,
      time: true,
    },
    {
      name: 'reset-bot-updater',
      cwd: __dirname,
      script: 'scripts/auto-update.sh',
      interpreter: 'bash',
      env: {
        ...env,
        UPDATE_INTERVAL_SEC: env.UPDATE_INTERVAL_SEC || '300',
        GIT_BRANCH: env.GIT_BRANCH || 'main',
      },
      autorestart: true,
      restart_delay: 10000,
      max_restarts: 20,
      out_file: 'logs/updater.out.log',
      error_file: 'logs/updater.err.log',
      merge_logs: true,
      time: true,
    },
  ],
};
PMEOF
mkdir -p "$PROJECT_DIR/logs" "$PROJECT_DIR/scripts"
ok "ecosystem.config.cjs siap."

# ==============================================================================
# 10b. Auto-update script (poll GitHub tiap N detik, pull + rebuild + restart)
# ==============================================================================
log "Buat scripts/auto-update.sh..."
cat > "$PROJECT_DIR/scripts/auto-update.sh" <<'AUEOF'
#!/data/data/com.termux/files/usr/bin/bash
# Auto-update worker untuk reset-bot.
# Cek commit baru di branch GIT_BRANCH tiap UPDATE_INTERVAL_SEC detik.
# Kalau ada commit baru: pull, install (kalau lockfile berubah), rebuild, restart.

set -u
cd "$(dirname "$0")/.."

INTERVAL="${UPDATE_INTERVAL_SEC:-300}"
BRANCH="${GIT_BRANCH:-main}"
LOG_PREFIX="[updater]"

log() { echo "$(date -Iseconds) $LOG_PREFIX $*"; }

# Pastikan PATH punya pnpm/pm2/node walau dijalankan dari PM2
export PATH="$HOME/.local/bin:$HOME/.npm-global/bin:$PREFIX/bin:$PATH"

log "Started. branch=$BRANCH interval=${INTERVAL}s repo=$(pwd)"

while true; do
  # fetch tanpa output
  if ! git fetch origin "$BRANCH" --quiet 2>/dev/null; then
    log "git fetch failed, retry in ${INTERVAL}s"
    sleep "$INTERVAL"
    continue
  fi

  LOCAL=$(git rev-parse HEAD 2>/dev/null || echo "")
  REMOTE=$(git rev-parse "origin/$BRANCH" 2>/dev/null || echo "")

  if [ -z "$REMOTE" ]; then
    log "Tidak bisa baca origin/$BRANCH, skip."
    sleep "$INTERVAL"
    continue
  fi

  if [ "$LOCAL" != "$REMOTE" ]; then
    log "Commit baru terdeteksi: $LOCAL -> $REMOTE"

    OLD_LOCK_HASH=""
    [ -f pnpm-lock.yaml ] && OLD_LOCK_HASH=$(sha256sum pnpm-lock.yaml | cut -d' ' -f1)

    # Stash local changes (kalau ada), hard reset ke remote
    git stash push --include-untracked -m "auto-update-$(date +%s)" >/dev/null 2>&1 || true
    if ! git reset --hard "origin/$BRANCH"; then
      log "git reset gagal, skip update kali ini."
      sleep "$INTERVAL"
      continue
    fi

    NEW_LOCK_HASH=""
    [ -f pnpm-lock.yaml ] && NEW_LOCK_HASH=$(sha256sum pnpm-lock.yaml | cut -d' ' -f1)

    if [ "$OLD_LOCK_HASH" != "$NEW_LOCK_HASH" ]; then
      log "Lockfile berubah, install ulang dependency..."
      pnpm install \
        --config.node-linker=hoisted \
        --config.auto-install-peers=true \
        --config.strict-peer-dependencies=false || log "pnpm install gagal"
    fi

    # Cek apakah perlu push schema (kalau folder lib/db berubah)
    if git diff --name-only "$LOCAL" "$REMOTE" 2>/dev/null | grep -q "^lib/db/"; then
      log "Schema DB berubah, push migration..."
      pnpm exec dotenv -e .env -- pnpm --filter @workspace/db exec drizzle-kit push 2>&1 | tail -5 || \
        log "drizzle-kit push gagal — cek manual"
    fi

    log "Build api-server..."
    if pnpm --filter @workspace/api-server run build; then
      log "Restart reset-bot via PM2..."
      pm2 restart reset-bot --update-env || log "pm2 restart gagal"
      log "✅ Update selesai (commit $REMOTE)"
    else
      log "❌ Build gagal, bot TIDAK di-restart. Tetap di commit lama secara runtime."
    fi
  fi

  sleep "$INTERVAL"
done
AUEOF
chmod +x "$PROJECT_DIR/scripts/auto-update.sh"
ok "Auto-update worker terpasang (cek tiap 5 menit, atur via UPDATE_INTERVAL_SEC)."

# Wrapper command supaya gampang dipakai
BIN_DIR="$HOME/.local/bin"
mkdir -p "$BIN_DIR"
cat > "$BIN_DIR/reset-bot" <<EOF
#!/data/data/com.termux/files/usr/bin/bash
# Helper command: 'reset-bot <perintah>'
set -e
cd "$PROJECT_DIR"
case "\${1:-status}" in
  start)          pm2 start ecosystem.config.cjs ;;
  stop)           pm2 stop reset-bot ;;
  restart)        pm2 restart reset-bot ;;
  reload)         pm2 reload reset-bot ;;
  logs)           pm2 logs reset-bot ;;
  status)         pm2 status ;;
  delete)         pm2 delete reset-bot reset-bot-updater 2>/dev/null || true ;;
  rebuild)        pnpm --filter @workspace/api-server run build && pm2 restart reset-bot ;;
  update)         bash scripts/auto-update.sh & echo "Manual update dipicu." ;;
  updater-logs)   pm2 logs reset-bot-updater ;;
  updater-stop)   pm2 stop reset-bot-updater ;;
  updater-start)  pm2 start reset-bot-updater ;;
  *) echo "Usage: reset-bot {start|stop|restart|reload|logs|status|delete|rebuild|update|updater-logs|updater-stop|updater-start}"; exit 1 ;;
esac
EOF
chmod +x "$BIN_DIR/reset-bot"
if ! grep -q "$BIN_DIR" "$HOME/.bashrc" 2>/dev/null; then
  echo "export PATH=\"$BIN_DIR:\$PATH\"" >> "$HOME/.bashrc"
fi
ok "Wrapper 'reset-bot' terpasang di $BIN_DIR/reset-bot"

# Auto-start saat Termux dibuka (PM2 resurrect)
PM2_HOOK='[ -d "$HOME/.pm2" ] && pm2 resurrect >/dev/null 2>&1 || true'
if ! grep -Fq "$PM2_HOOK" "$HOME/.bashrc" 2>/dev/null; then
  echo "$PM2_HOOK" >> "$HOME/.bashrc"
fi

# (Opsional) Setup termux-services untuk start saat boot HP
if confirm "Pasang termux-services supaya bot otomatis hidup saat HP booting?" "Y"; then
  pkg install -y termux-services >/dev/null
  SVC_DIR="$PREFIX/var/service/reset-bot"
  mkdir -p "$SVC_DIR/log"
  cat > "$SVC_DIR/run" <<EOF
#!/data/data/com.termux/files/usr/bin/sh
exec 2>&1
cd "$PROJECT_DIR"
export PATH="$BIN_DIR:$HOME/.npm-global/bin:\$PATH"
# Pastikan postgres hidup
pg_ctl -D \$PREFIX/var/lib/postgresql status >/dev/null 2>&1 || \\
  pg_ctl -D \$PREFIX/var/lib/postgresql -l \$PREFIX/var/lib/postgresql/server.log start
exec pnpm exec dotenv -e .env -- node --enable-source-maps artifacts/api-server/dist/index.mjs
EOF
  chmod +x "$SVC_DIR/run"
  cat > "$SVC_DIR/log/run" <<EOF
#!/data/data/com.termux/files/usr/bin/sh
exec svlogd -tt $PROJECT_DIR/logs
EOF
  chmod +x "$SVC_DIR/log/run"
  sv-enable reset-bot 2>/dev/null || true
  ok "termux-services aktif. Reboot Termux/HP supaya hook-nya ke-load."
fi

# Start bot via PM2 sekarang
log "Menjalankan bot via PM2..."
( cd "$PROJECT_DIR" && pm2 start ecosystem.config.cjs )
pm2 save
ok "Bot berjalan & PM2 list disimpan."

# Aktifkan wake lock supaya HP tidak mematikan proses
termux-wake-lock 2>/dev/null && ok "Wake lock aktif." || warn "termux-wake-lock tidak tersedia (install Termux:API)."

# ==============================================================================
# 11. Petunjuk run
# ==============================================================================
cat <<EOF

${GRN}========================================================================${RST}
${GRN}  SETUP SELESAI 🎉${RST}
${GRN}========================================================================${RST}

Bot SUDAH JALAN via PM2 (otomatis restart kalau crash).
Auto-updater juga aktif: cek commit baru di GitHub tiap 5 menit, lalu
otomatis pull → install → build → restart bot.

Perintah cepat (pakai 'reset-bot'):
  reset-bot status         # cek status semua proses
  reset-bot logs           # log bot realtime
  reset-bot restart        # restart bot
  reset-bot stop           # stop bot
  reset-bot rebuild        # build ulang lalu restart
  reset-bot start          # start lagi kalau di-stop

  reset-bot update         # PAKSA cek update sekarang (tidak nunggu 5 menit)
  reset-bot updater-logs   # lihat log auto-updater
  reset-bot updater-stop   # matikan auto-updater (kalau mau pause)
  reset-bot updater-start  # nyalakan lagi auto-updater

Atau manual via PM2:
  pm2 list
  pm2 logs reset-bot
  pm2 monit

Ubah interval auto-update (default 300 detik = 5 menit):
  nano $ENV_FILE      # edit UPDATE_INTERVAL_SEC
  reset-bot updater-stop && reset-bot updater-start

Cek health endpoint:
  curl http://localhost:\$(grep ^PORT= $ENV_FILE | cut -d= -f2)/api/healthz

Edit kredensial / port:
  nano $ENV_FILE
  reset-bot restart

Tips supaya bot tetap hidup di Android:
  - Matikan battery optimization untuk Termux (Settings → Apps → Termux)
  - Install Termux:API & jalankan: termux-wake-lock
  - Reboot HP setelah pasang termux-services supaya boot hook aktif
  - Restart PostgreSQL kalau bermasalah:
      pg_ctl -D \$PREFIX/var/lib/postgresql restart

${GRN}========================================================================${RST}
EOF
