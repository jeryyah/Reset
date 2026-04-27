# Reset Bot — Cara Pakai di Termux (Android)

Panduan lengkap menjalankan bot **jeryyah/Reset** di HP Android pakai Termux.
Bot akan jalan terus di background, auto-restart kalau crash, dan auto-update
dari GitHub setiap 5 menit.

---

## 📥 1. Install Pertama Kali

### Persiapan

1. Install **Termux** dari [F-Droid](https://f-droid.org/en/packages/com.termux/)
   (jangan dari Play Store — versinya udah lama)
2. (Opsional) Install **Termux:API** dari F-Droid juga, biar wake lock bisa dipakai
3. Buka Termux, lalu izinkan akses storage:
   ```bash
   termux-setup-storage
   ```

### Jalankan Skrip Setup

Copy-paste 3 baris ini ke Termux:

```bash
curl -O https://raw.githubusercontent.com/jeryyah/Reset/main/setup-termux.sh
chmod +x setup-termux.sh
./setup-termux.sh
```

Skrip akan jalan ~10–20 menit. Di tengah jalan dia akan tanya 3 hal:

| Pertanyaan | Cara dapat |
|---|---|
| `TELEGRAM_BOT_TOKEN` | Chat [@BotFather](https://t.me/BotFather) → `/newbot` → ikuti instruksi |
| `ADMIN_CHAT_ID` | Chat [@userinfobot](https://t.me/userinfobot) → kirim `/start` → catat angkanya |
| `PORT` | Tekan Enter aja (default 8080) |

### Step Terakhir: Push Schema Database

Setelah muncul banner hijau **"SETUP SELESAI 🎉"**, jalankan:

```bash
cd ~/Reset
set -a && source .env && set +a
pnpm --filter @workspace/db exec drizzle-kit push
reset-bot restart
```

> Kalau ditanya `Is bot_users table created or renamed?`, ketik `+` lalu Enter.

Atau tinggal pakai shortcut (versi skrip terbaru):
```bash
reset-bot db-push
reset-bot restart
```

### Tes Bot

Buka Telegram → cari bot kamu → kirim `/start`. Harusnya langsung balas.

---

## 🎮 2. Perintah Sehari-hari

Semua perintah pakai `reset-bot <perintah>`:

### Bot

| Perintah | Fungsi |
|---|---|
| `reset-bot status` | Cek bot hidup atau mati |
| `reset-bot logs` | Lihat log realtime (Ctrl+C untuk keluar) |
| `reset-bot restart` | Restart bot |
| `reset-bot stop` | Matikan bot |
| `reset-bot start` | Hidupkan lagi kalau di-stop |
| `reset-bot rebuild` | Build ulang lalu restart (kalau abis edit kode) |

### Auto-Updater

| Perintah | Fungsi |
|---|---|
| `reset-bot update` | Paksa cek update sekarang (nggak nunggu 5 menit) |
| `reset-bot updater-logs` | Lihat aktivitas auto-updater |
| `reset-bot updater-stop` | Pause auto-update (kalau lagi develop) |
| `reset-bot updater-start` | Nyalakan lagi auto-updater |

### Database

| Perintah | Fungsi |
|---|---|
| `reset-bot db-push` | Push schema DB (kalau abis ubah `lib/db/`) |

---

## ⚙️ 3. Konfigurasi (.env)

File konfigurasi ada di `~/Reset/.env`. Untuk edit:

```bash
nano ~/Reset/.env
```

Setelah edit, restart bot:
```bash
reset-bot restart
```

Isi `.env`:

```bash
NODE_ENV=development
PORT=8080
DATABASE_URL=postgres://u0_a247@localhost:5432/reset
TELEGRAM_BOT_TOKEN=xxx:yyy
ADMIN_CHAT_ID=123456789

# Auto-update (interval cek GitHub dalam detik, default 5 menit)
UPDATE_INTERVAL_SEC=300
GIT_BRANCH=main
```

> Setelah ubah `UPDATE_INTERVAL_SEC` atau `GIT_BRANCH`, restart updater:
> ```bash
> reset-bot updater-stop && reset-bot updater-start
> ```

---

## 🔄 4. Workflow Update Kode

Kamu **nggak perlu apa-apa di HP**. Tinggal:

1. Edit kode di Replit / laptop / GitHub web
2. Push ke branch `main`
3. Maksimal **5 menit kemudian** bot di HP otomatis update sendiri:
   - Pull commit baru
   - Install dependency baru (kalau `pnpm-lock.yaml` berubah)
   - Push schema DB (kalau `lib/db/` berubah)
   - Build ulang
   - Restart bot

Kalau build gagal, bot **tetap hidup di versi lama** — nggak ada downtime.

Mau cek update sudah masuk?
```bash
reset-bot updater-logs    # lihat aktivitas updater
reset-bot status          # lihat uptime bot (kalau baru restart, uptime kecil)
```

---

## 🛠️ 5. Troubleshooting

### Bot mati / nggak balas Telegram

```bash
reset-bot status         # cek statusnya
reset-bot logs           # lihat error terakhir (Ctrl+C untuk keluar)
reset-bot restart        # coba restart dulu
```

### Database error / tabel hilang

```bash
# Cek Postgres jalan
pg_ctl -D $PREFIX/var/lib/postgresql status

# Kalau mati, hidupkan
pg_ctl -D $PREFIX/var/lib/postgresql -l $PREFIX/var/lib/postgresql/server.log start

# Push schema lagi
reset-bot db-push
reset-bot restart
```

### Auto-updater nggak jalan

```bash
reset-bot updater-logs   # lihat error
reset-bot updater-stop && reset-bot updater-start
```

### Setelah HP di-restart, bot mati

Buka Termux 1x — `pm2 resurrect` di `.bashrc` akan auto-jalanin bot lagi.
Kalau mau bot hidup tanpa buka Termux:
```bash
pkg install termux-services
sv-enable reset-bot
```

### "Command not found: reset-bot"

```bash
source ~/.bashrc
# atau tutup-buka Termux
```

### Pengen reset total

```bash
reset-bot delete         # hapus dari PM2
rm -rf ~/Reset           # hapus folder project
# Lalu install ulang dari awal (lihat section #1)
```

---

## 📡 6. Cek Health Endpoint

```bash
curl http://localhost:$(grep ^PORT= ~/Reset/.env | cut -d= -f2)/api/healthz
```

Harusnya balas `{"status":"ok"}` atau sejenisnya.

---

## 💡 7. Tips Biar Bot Awet Hidup

- **Wake lock**: geser status bar → tap notif Termux → "Acquire wakelock"
- **Battery optimization**: HP Settings → Apps → Termux → Battery → "Don't optimize"
- **Wake lock otomatis**: skrip setup udah panggil `termux-wake-lock`, jadi seharusnya udah aktif
- **Auto-start saat HP boot**: `pkg install termux-services` lalu `sv-enable reset-bot`

---

## 📂 Lokasi File Penting

| File / Folder | Fungsi |
|---|---|
| `~/Reset/` | Folder project |
| `~/Reset/.env` | Konfigurasi (token, DB, dll) |
| `~/Reset/logs/bot.out.log` | Log output bot |
| `~/Reset/logs/bot.err.log` | Log error bot |
| `~/Reset/logs/updater.out.log` | Log auto-updater |
| `~/Reset/scripts/auto-update.sh` | Skrip auto-update |
| `~/Reset/ecosystem.config.cjs` | Config PM2 |
| `~/.local/bin/reset-bot` | Wrapper command |
| `$PREFIX/var/lib/postgresql/` | Data database |

---

Kalau ada masalah lain, cek log dulu (`reset-bot logs` atau `reset-bot updater-logs`),
biasanya error-nya jelas di situ.
