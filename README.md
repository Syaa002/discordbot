# 🤖 Discord Moderation, Voice & Staf Utility Bot

Bot kustom Discord yang dirancang khusus untuk memenuhi kebutuhan unik internal Staf & Moderator server komunitas (tanpa menduplikasi fitur bot publik umum seperti leveling atau musik).

Prefix Perintah: **`.`** (Titik) — *juga otomatis merespons prefix `!`*

---

## 🌟 Kategori Fitur Utama

### 1. 📁 Pemisahan Channel Logging (Audit Trail Khusus)
- **🗑️ Pesan Dihapus (`#delete-message`)**: Seluruh riwayat pesan yang dihapus (beserta nama pengirim, channel, teks, dan lampiran foto/file) otomatis dicatat di channel khusus **`#delete-message`**.
- **📜 Log Audit Umum (`#admin-logs`)**: Seluruh log edit pesan, member masuk/keluar, tindakan moderasi (kick, ban, softban, timeout, warn), tiket bantuan, dan voice disconnect otomatis masuk ke channel **`#admin-logs`**.

---

### 2. 🎙️ Manajemen Voice Channel Staf (Room Control)
- **`.vckick @user`**: Memutus koneksi (*disconnect*) paksa member yang mengganggu dari voice channel tanpa perlu kick dari server.
- **`.vcmute @user`**: Server-mute instan mic member di voice channel saat terjadi mic-spam atau keributan.
- **`.vcunmute @user`**: Mencabut server-mute mic member di voice channel.
- **`.vcmove @user [nama/ID channel]`**: Memindahkan member langsung ke voice channel lain (contoh: dipindahkan ke ruang rapat/sidang mod).

---

### 3. 🛡️ Karantina & Deteksi Keamanan (Anti-Raid / Alt-Detection)
- **`.slowmode [detik]`**: Mengatur jeda pengiriman pesan (misal `.slowmode 10` atau `.slowmode 0` untuk menonaktifkan) saat terjadi obrolan yang memanas tanpa harus mengunci channel.
- **`.scanalt`**: Memindai seluruh member server untuk mencari akun kloningan / perusuh yang umur akun Discord-nya kurang dari 7 hari.
- **`.softban @user [alasan]`**: Melakukan ban lalu unban otomatis dalam 1 detik untuk menghapus riwayat chat spam member tersebut selama 24 jam terakhir sekaligus mengeluarkannya dari server.

---

### 4. 🤫 Utilitas Moderasi & Notifikasi Senyap
- **`.dm @user [pesan]`**: Mengirim pesan pribadi resmi staf atas nama bot kepada member (berguna untuk teguran privat atau klarifikasi tanpa memicu drama publik).
- **`.snipe`**: Memunculkan kembali pesan terakhir yang baru saja dihapus di channel tersebut beserta nama pengirim dan lampirannya.
- **`.roleall @role`**: Memberikan role tertentu ke seluruh member server secara otomatis (dilengkapi anti-ratelimit).
- **`.removeroleall @role`**: Mencabut role tertentu dari seluruh member server sekaligus.

---

### 5. ⚖️ Sistem Peringatan Bertingkat & Kontrol Server
- **`.warn @user [alasan]`**: Menambah poin pelanggaran (3x = Timeout 1 Jam, 5x = Auto-Ban).
- **`.checkwarn @user`**: Memeriksa riwayat teguran member.
- **`.clearwarn @user`**: Mereset riwayat teguran member.
- **`.lock` & `.unlock`**: Kunci dan buka channel obrolan seketika.
- **`.clear [1-100]`**: Hapus pesan massal.
- **`.setupticket`**: Panel tombol tiket bantuan privat staf.
- **`.setuproles`**: Panel tombol role minat (@MLBB, @Valorant, @Anime, @Video Editor).

---

## 📋 Tabel Perintah Staf Lengkap

| Perintah | Deskripsi | Contoh |
|---|---|---|
| `.help mod` | Menampilkan panduan lengkap seluruh fitur staf | `.help mod` |
| `.snipe` | Menampilkan pesan terakhir yang dihapus di channel | `.snipe` |
| `.vckick @user` | Disconnect paksa member dari voice | `.vckick @user` |
| `.vcmute @user` / `.vcunmute @user` | Mute / Unmute mic member di voice | `.vcmute @user` |
| `.vcmove @user [channel]` | Pindahkan member ke voice channel lain | `.vcmove @user AdminVoice` |
| `.slowmode [detik]` | Atur jeda slowmode chat channel | `.slowmode 10` |
| `.scanalt` | Pindai akun mencurigakan (< 7 hari) | `.scanalt` |
| `.softban @user [alasan]` | Bersihkan chat 24 jam & keluarkan member | `.softban @user Spam raiding` |
| `.dm @user [pesan]` | Kirim DM resmi atas nama bot | `.dm @user Harap baca rules` |
| `.roleall @role` | Berikan role ke seluruh member | `.roleall @Member` |
| `.removeroleall @role` | Cabut role dari seluruh member | `.removeroleall @Event` |
| `.warn @user [alasan]` | Beri peringatan bertingkat (3x=Mute, 5x=Ban) | `.warn @user Toxic di chat` |
| `.checkwarn @user` | Cek poin & riwayat pelanggaran | `.checkwarn @user` |
| `.clearwarn @user` | Reset seluruh poin peringatan member | `.clearwarn @user` |
| `.lock` / `.unlock` | Kunci / buka obrolan di channel saat ini | `.lock` |
| `.clear [1-100]` | Hapus pesan massal | `.clear 30` |

---

## 🚀 Panduan Update ke Bot-Hosting.net

1. Buka dashboard di [bot-hosting.net](https://bot-hosting.net).
2. Masuk ke deployment **AmbanimeOfficial**.
3. Buka tab **Files** > klik file **`index.js`**.
4. Ganti seluruh isinya dengan kode terbaru dari `D:\discordbot\index.js`.
5. Buka tab **Console**, lalu klik **Restart**.
