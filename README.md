# 🤖 Discord Moderation, Community & Staff Bot

Bot Discord lengkap dan siap pakai yang dirancang untuk komunitas besar dengan fitur **Sistem Tiket Bantuan Privat**, **Auto-Mod Ringan**, **Sistem Peringatan Bertingkat (Warn System)**, **Moderasi Pesan & Disiplin Member**, **Role Minat Interaktif (@MLBB, @Valorant, @Anime, @Video Editor)**, serta **Audit Trail ke `#admin-logs`**.

Prefix perintah utama bot ini adalah: **`.`** (Titik)

---

## 🌟 Paket Fitur Utama

### 1. 🎫 Sistem Tiket Bantuan Staf (Support Ticket)
- **`.setupticket` / `.ticketpanel`**: Memunculkan panel pesan dengan tombol **`📩 Buka Tiket`**.
- **Privat & Eksklusif**: Bot otomatis membuat channel baru `#ticket-<namaMember>` yang hanya dapat diakses oleh pembuat tiket, bot, dan role staf/moderator.
- **Tutup Tiket Cepat**: Tersedia tombol **`🔒 Tutup Tiket`** di dalam channel tiket untuk menutup dan menghapus channel dalam hitungan detik setelah konsultasi selesai.
- **Log Tiket**: Setiap pembukaan dan penutupan tiket tercatat rapi di `#admin-logs`.

### 2. 🤖 Otomasi Pengawasan Chat (Auto-Mod Ringan)
- **Anti-Capslock Berlebihan**: Otomatis menghapus dan menegur pesan dengan huruf kapital > 70% pada kalimat panjang (≥ 12 karakter).
- **Anti-Spam Mention**: Menghapus dan menegur jika ada member biasa mention `@everyone`, `@here`, atau tag lebih dari 4 orang sekaligus.
- **Word Blacklist (Filter Kata Kasar & SARA)**: Otomatis mendeteksi dan menghapus daftar kata kotor/kasar/SARA sebelum sempat memicu keributan.
- **Anti-Invite & Phishing**: Otomatis mendeteksi dan menghapus link invite server Discord lain serta domain fake nitro/scam.

### 3. ⚖️ Manajemen Peringatan Bertingkat (Warn System)
- **`.warn @user [alasan]`**: Menambahkan poin peringatan ke data member (tersimpan permanen di `warnings.json`).
- **Tindakan Otomatis**:
  - **3x Warn**: Bot otomatis memberi **Timeout 1 Jam**.
  - **5x Warn**: Bot otomatis mengeksekusi **Auto-Ban Permanen**.
- **`.checkwarn @user` / `.warns @user`**: Memeriksa total teguran dan riwayat alasan yang pernah diterima member.
- **`.clearwarn @user`**: Mereset seluruh catatan peringatan member jika sudah menyelesaikan masa hukuman atau banding disetujui.

### 4. 🛡️ Kontrol Channel & Menu Bantuan Staf (`.help mod`)
- **`.help mod`**: Menu embed panduan terpadu khusus seluruh perintah moderator dan staf.
- **`.lock` & `.unlock`**: Mengunci dan membuka kembali channel dalam sekejap saat terjadi kerusuhan chat.
- **`.say [pesan]`**: Mengirim pengumuman resmi server atas nama bot.
- **`.clear [jumlah]` / `.purge [jumlah]`**: Membersihkan 1–100 chat secara massal.
- **`.timeout @user [durasi] [alasan]` / `.untimeout @user`**: Timeout fleksibel (5m, 10m, 1h, dll).
- **`.kick @user [alasan]`**: Mengeluarkan pengguna.
- **`.ban @user [alasan]` / `.unban <ID>`**: Ban permanen dan fitur unban via ID.

### 5. 🎭 Self-Assignable Roles (Role Minat)
- **`.setuproles` / `.rolepanel`**: Panel tombol interaktif untuk role minat:
  - ⚔️ **@MLBB** : Mobile Legends
  - 🎯 **@Valorant** : Valorant
  - 🌸 **@Anime** : Anime & Manga
  - 🎬 **@Video Editor** : Creator / Editor
- **Sistem Toggle**: Klik sekali untuk mengambil, klik lagi untuk melepas (respon ephemeral).
- **Auto-create Role**: Otomatis membuatkan role di server jika belum ada.

### 6. 📜 Audit Trail (`#admin-logs`)
Mencatat pesan terhapus, pesan diedit, member bergabung, member keluar, serta seluruh tindakan moderasi otomatis dan manual.

---

## 📋 Daftar Perintah Lengkap (Prefix: `.`)

### Perintah Publik & Pengaturan
| Perintah | Izin | Deskripsi |
|---|---|---|
| `.help` | Semua Member | Menampilkan panduan umum bot |
| `.help mod` | Staf / Admin | Menampilkan panduan lengkap seluruh perintah staf |
| `.setuproles` | Admin | Memunculkan panel pemilihan role minat |
| `.setupticket` | Admin | Memunculkan panel pembuatan tiket bantuan |

### Perintah Staf & Disiplin
| Perintah | Deskripsi | Contoh |
|---|---|---|
| `.warn @user [alasan]` | Memberi peringatan bertingkat (3x=Mute, 5x=Ban) | `.warn @user Toxic saat mabar` |
| `.checkwarn @user` | Memeriksa riwayat peringatan | `.checkwarn @user` |
| `.clearwarn @user` | Mereset seluruh peringatan member | `.clearwarn @user` |
| `.lock` | Mengunci channel dari obrolan member | `.lock` |
| `.unlock` | Membuka kembali channel | `.unlock` |
| `.say [pesan]` | Mengirim pesan pengumuman via bot | `.say Turnamen dimulai pukul 20:00 WIB` |
| `.clear [1-100]` | Menghapus pesan massal | `.clear 30` |
| `.timeout @user [durasi] [alasan]` | Timeout member sementara (Alias: `.mute`) | `.timeout @user 15m Rusuh` |
| `.untimeout @user` | Mencabut timeout (Alias: `.unmute`) | `.untimeout @user` |
| `.kick @user [alasan]` | Mengeluarkan member | `.kick @user Melanggar rules` |
| `.ban @user [alasan]` | Ban permanen & hapus chat 24 jam | `.ban @user Raiding server` |
| `.unban <ID> [alasan]` | Mencabut ban via ID akun | `.unban 123456789012345678 Banding diterima` |

---

## 🚀 Panduan Update di Bot-Hosting.net

1. Buka dashboard di [bot-hosting.net](https://bot-hosting.net).
2. Klik deployment **AmbanimeOfficial**.
3. Buka tab **Files** > klik file **`index.js`**.
4. Ganti seluruh isinya dengan kode terbaru dari `D:\discordbot\index.js`.
5. Buka file **`.env`** di Bot-Hosting dan pastikan `PREFIX=.`.
6. Buka tab **Console**, lalu klik **Restart**.
