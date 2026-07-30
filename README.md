# Sistem Reservasi Ruangan (Express + SQLite)

Starter source code untuk tugas DevSecOps / SSDLC.

## Fitur Utama
- Registrasi pengguna baru (default role `user`).
- Login dan logout berbasis session (`express-session`).
- Role pengguna: `admin` dan `user`.
- Pengelolaan profil pengguna.
- CRUD data ruangan oleh admin.
- Pengajuan reservasi oleh user.
- Approval / rejection reservasi oleh admin.
- Dashboard admin untuk melihat audit logs keamanan dan perubahan data.
- Dashboard admin untuk manajemen pengguna dan unlock akun yang terkunci sementara.

## Penerapan Secure Coding
- Hashing password dengan `bcryptjs`.
- Parameterized query di semua akses database SQLite.
- Validasi dan sanitasi input dengan `express-validator`.
- RBAC middleware untuk proteksi akses endpoint.
- Proteksi CSRF pada semua form POST.
- Rate limiting khusus endpoint login untuk mitigasi brute force.
- Lockout akun sementara setelah gagal login berulang.
- Audit trail ke tabel `audit_logs` untuk jejak aktivitas keamanan/perubahan data penting.
- Secret/session config lewat environment variables (`dotenv`).
- Generic error handler tanpa membocorkan stack trace ke pengguna.
- Security logging sederhana untuk login sukses, login gagal, dan perubahan data penting.

## Struktur Folder
```text
.
├── database
│   └── setup.js
├── logs
├── src
│   ├── config
│   │   └── db.js
│   ├── controllers
│   ├── middlewares
│   ├── public
│   ├── routes
│   ├── utils
│   ├── validators
│   ├── views
│   │   ├── admin
│   │   ├── audit
│   ├── app.js
│   └── server.js
├── .env.example
├── .gitignore
└── package.json
```

## Cara Menjalankan
1. Install dependency:
   ```bash
   npm install
   ```
2. Buat file `.env` dari `.env.example`, lalu sesuaikan nilai secret/password.
3. Inisialisasi database + seeder akun awal:
   ```bash
   npm run db:setup
   ```
4. Jalankan aplikasi:
   ```bash
   npm start
   ```
5. Buka browser ke `http://localhost:3000`.

## Menjalankan Test
```bash
npm test
```

## CI Workflow
- Pipeline GitHub Actions tersedia pada `.github/workflows/ci.yml`.
- Workflow akan menjalankan `npm ci` dan `npm test` pada setiap `push` dan `pull_request` ke branch `main`.

## Akun Seeder Default
Nilai default ada di `.env.example` dan bisa diubah lewat file `.env`:
- Admin: `admin / Admin123!`
- User: `user / User12345!`

## Catatan
- File log keamanan disimpan pada `logs/security.log`.
- Database SQLite disimpan pada `database/app.db`.

## Deploy ke Vercel via GitHub

### 1) Push source code ke GitHub
Jika folder ini belum menjadi git repository:

```bash
git init
git add .
git commit -m "chore: prepare deployment to vercel"
git branch -M main
git remote add origin https://github.com/Hfifhmlyna/Remark-Hotel.git
git push -u origin main
```

Jika remote sudah ada, cukup:

```bash
git add .
git commit -m "chore: update app"
git push
```

### 2) Import repo di Vercel
1. Login ke Vercel menggunakan akun GitHub.
2. Klik **Add New Project**.
3. Pilih repo **Hfifhmlyna/Remark-Hotel**.
4. Framework preset: **Other**.
5. Build Command: kosongkan (tidak wajib).
6. Output Directory: kosongkan.

### 3) Set Environment Variables di Vercel
Minimal isi:

- `NODE_ENV=production`
- `SESSION_SECRET=<secret-panjang-random>`
- `HOTEL_NAME=Remark Hotel`
- `DB_PATH=/tmp/app.db`

Opsional (kalau ingin ganti akun seed):

- `SEED_ADMIN_USERNAME`
- `SEED_ADMIN_PASSWORD`
- `SEED_ADMIN_EMAIL`
- `SEED_ADMIN_NAME`

### 4) Deploy
Klik **Deploy**. Setelah berhasil, Vercel memberikan URL publik.

### Penting untuk SQLite di Vercel
- Vercel serverless memakai filesystem sementara (ephemeral).
- Data SQLite pada `/tmp/app.db` tidak permanen.
- Untuk production yang stabil, gunakan database eksternal (contoh: Turso, Supabase Postgres, Neon, PlanetScale).
