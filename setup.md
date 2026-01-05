# 🎙️ AudioEmotion - Panduan Setup Lengkap

Panduan ini akan membantu kamu untuk melakukan instalasi dan menjalankan project AudioEmotion (Speech Emotion Recognition) dari awal.

---

## 📋 Daftar Isi

1. [Prasyarat](#1-prasyarat)
2. [Setup Database (PostgreSQL)](#2-setup-database-postgresql)
3. [Setup Backend (Express.js + Prisma)](#3-setup-backend-expressjs--prisma)
4. [Setup Frontend (React + Vite)](#4-setup-frontend-react--vite)
5. [Menjalankan Aplikasi](#5-menjalankan-aplikasi)
6. [Troubleshooting](#6-troubleshooting)

---

## 1. Prasyarat

Pastikan kamu sudah menginstall software berikut di komputermu:

### Wajib:

- **Node.js** (v18 atau lebih baru) - [Download](https://nodejs.org/)
- **npm** atau **yarn** (biasanya sudah terinstall bersama Node.js)
- **PostgreSQL** (v14 atau lebih baru) - [Download](https://www.postgresql.org/download/)
- **Git** - [Download](https://git-scm.com/downloads)

### Opsional:

- **pgAdmin** atau **DBeaver** - Untuk mengelola database dengan GUI
- **VS Code** - Code editor yang direkomendasikan

### Cek Instalasi:

```bash
# Cek versi Node.js (harus v18+)
node --version

# Cek versi npm
npm --version

# Cek PostgreSQL
psql --version
```

---

## 2. Setup Database (PostgreSQL)

### Langkah 2.1: Install PostgreSQL

#### 🍎 macOS:

```bash
# Menggunakan Homebrew
brew install postgresql@15

# Start PostgreSQL service
brew services start postgresql@15
```

#### 🪟 Windows:

1. Download installer dari [postgresql.org](https://www.postgresql.org/download/windows/)
2. Jalankan installer dan ikuti wizard
3. Catat password yang kamu set untuk user `postgres`
4. Pastikan PostgreSQL service berjalan (cek di Services)

#### 🐧 Linux (Ubuntu/Debian):

```bash
# Update package list
sudo apt update

# Install PostgreSQL
sudo apt install postgresql postgresql-contrib

# Start service
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

### Langkah 2.2: Buat Database

```bash
# Login ke PostgreSQL sebagai user postgres
# Di macOS/Linux:
psql postgres

# Di Windows (buka Command Prompt atau PowerShell):
psql -U postgres
```

Setelah masuk ke PostgreSQL shell, jalankan:

```sql
-- Buat database baru
CREATE DATABASE audio_emotion;

-- Buat user baru (opsional, bisa pakai user postgres)
CREATE USER audio_user WITH ENCRYPTED PASSWORD 'password_kamu_disini';

-- Berikan akses ke database
GRANT ALL PRIVILEGES ON DATABASE audio_emotion TO audio_user;

-- Keluar dari psql
\q
```

### Langkah 2.3: Catat Connection URL

Format DATABASE_URL:

```
postgresql://USERNAME:PASSWORD@HOST:PORT/DATABASE_NAME
```

Contoh:

```
postgresql://audio_user:password_kamu_disini@localhost:5432/audio_emotion
```

Atau jika menggunakan user postgres:

```
postgresql://postgres:password_postgres@localhost:5432/audio_emotion
```

---

## 3. Setup Backend (Express.js + Prisma)

### Langkah 3.1: Clone Repository (jika belum)

```bash
git clone <URL_REPOSITORY>
cd AudioEmotion
```

### Langkah 3.2: Masuk ke Folder Server

```bash
cd server
```

### Langkah 3.3: Install Dependencies

```bash
npm install
```

### Langkah 3.4: Setup Environment Variables

Buat file `.env` di folder `server/`:

```bash
# Di macOS/Linux:
touch .env

# Di Windows (PowerShell):
New-Item .env -ItemType File
```

Isi file `server/.env` dengan konfigurasi berikut:

```env
# Database
DATABASE_URL="postgresql://audio_user:password_kamu@localhost:5432/audio_emotion"

# JWT Secret (ganti dengan string random yang panjang)
JWT_SECRET="ganti_dengan_secret_key_yang_sangat_panjang_dan_random_minimal_32_karakter"

# Server Config
PORT=3001
NODE_ENV=development

# Frontend URL (untuk CORS)
FRONTEND_URL="http://localhost:5173"
```

> ⚠️ **Penting**: Ganti `password_kamu` dengan password PostgreSQL yang kamu set sebelumnya!

### Langkah 3.5: Setup Prisma & Migrate Database

```bash
# Generate Prisma Client
npm run db:generate

# Push schema ke database (buat tabel-tabel)
npm run db:push
```

Jika ingin menggunakan migration (recommended untuk production):

```bash
npm run db:migrate
```

### Langkah 3.6: (Opsional) Seed Database

Jika ada data awal yang perlu dimasukkan:

```bash
npm run db:seed
```

### Langkah 3.7: Jalankan Backend Server

```bash
# Development mode (dengan auto-reload)
npm run dev

# Atau production mode
npm start
```

✅ Backend akan berjalan di: `http://localhost:3001`

Untuk melihat database dengan GUI:

```bash
npm run db:studio
```

---

## 4. Setup Frontend (React + Vite)

### Langkah 4.1: Buka Terminal Baru

Jangan tutup terminal backend! Buka terminal baru.

### Langkah 4.2: Masuk ke Root Folder Project

```bash
cd AudioEmotion
# atau jika dari folder server:
cd ..
```

### Langkah 4.3: Install Dependencies

```bash
npm install
```

### Langkah 4.4: Setup Environment Variables

Buat file `.env` di root folder (bukan di folder server):

```bash
touch .env
```

Isi file `.env` dengan:

```env
# Backend API URL
VITE_API_URL="http://localhost:3001/api"

# Supabase (Opsional - jika menggunakan Supabase)
VITE_SUPABASE_URL="https://your-project.supabase.co"
VITE_SUPABASE_ANON_KEY="your-anon-key"
```

> 📝 **Note**: Jika tidak menggunakan Supabase, biarkan nilai default atau kosongkan.

### Langkah 4.5: Jalankan Frontend Development Server

```bash
npm run dev
```

✅ Frontend akan berjalan di: `http://localhost:5173`

---

## 5. Menjalankan Aplikasi

### Quick Start (2 Terminal)

**Terminal 1 - Backend:**

```bash
cd AudioEmotion/server
npm run dev
```

**Terminal 2 - Frontend:**

```bash
cd AudioEmotion
npm run dev
```

### Buka di Browser

Buka browser dan akses: `http://localhost:5173`

---

## 6. Troubleshooting

### ❌ Error: "ECONNREFUSED" pada database

**Solusi:**

- Pastikan PostgreSQL service berjalan
- Cek apakah DATABASE_URL di `.env` sudah benar
- Verifikasi username dan password PostgreSQL

```bash
# macOS
brew services list
brew services restart postgresql@15

# Linux
sudo systemctl status postgresql
sudo systemctl restart postgresql

# Windows
# Buka Services (services.msc) dan pastikan PostgreSQL running
```

### ❌ Error: "Prisma Client not generated"

**Solusi:**

```bash
cd server
npm run db:generate
```

### ❌ Error: "Port 3001/5173 already in use"

**Solusi:**

```bash
# Cari proses yang menggunakan port
lsof -i :3001
lsof -i :5173

# Kill proses tersebut
kill -9 <PID>
```

### ❌ Error: "Cannot find module..."

**Solusi:**

```bash
# Hapus node_modules dan install ulang
rm -rf node_modules
rm package-lock.json
npm install
```

### ❌ CORS Error di Browser

**Solusi:**

- Pastikan `FRONTEND_URL` di `server/.env` sesuai dengan URL frontend
- Pastikan backend berjalan sebelum frontend

---

## 📁 Struktur Environment Files

```
AudioEmotion/
├── .env                    # Frontend environment variables
├── server/
│   └── .env                # Backend environment variables
```

### Frontend `.env` (root folder):

```env
VITE_API_URL="http://localhost:3001/api"
VITE_SUPABASE_URL="your-supabase-url"
VITE_SUPABASE_ANON_KEY="your-supabase-anon-key"
```

### Backend `server/.env`:

```env
DATABASE_URL="postgresql://user:password@localhost:5432/audio_emotion"
JWT_SECRET="your-super-secret-jwt-key"
PORT=3001
NODE_ENV=development
FRONTEND_URL="http://localhost:5173"
```

---

## 🎉 Selamat!

Jika semua langkah di atas berhasil, aplikasi AudioEmotion seharusnya sudah berjalan dengan baik!

### Port yang Digunakan:

| Service       | Port | URL                   |
| ------------- | ---- | --------------------- |
| Frontend      | 5173 | http://localhost:5173 |
| Backend       | 3001 | http://localhost:3001 |
| PostgreSQL    | 5432 | localhost:5432        |
| Prisma Studio | 5555 | http://localhost:5555 |

---

## 📞 Butuh Bantuan?

Jika menemukan masalah:

1. Cek kembali setiap langkah di atas
2. Pastikan semua environment variables sudah diisi dengan benar
3. Cek log error di terminal untuk informasi lebih detail

Happy coding! 🚀
