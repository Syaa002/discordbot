# 🤖 Ambanime Custom Bot — Master Documentation

Bot kustom Discord all-in-one yang dirancang secara khusus untuk memenuhi kebutuhan unik internal Komunitas & Staf AMBANIME (di luar fungsi bot publik biasa).

Prefix Perintah: **`.`** (Titik) — *juga otomatis merespons prefix `!`*

---

## 🌟 Ringkasan Fitur Master

### 🧹 1. Kategori Pembersihan Pesan & Kontrol Chat
- **`.delete [1-100]` / `.clear` / `.purge` / `.hapus`**: Menghapus pesan massal di channel secara instan.
- **`.slowmode [detik]`**: Mengatur jeda pengiriman pesan (misal `.slowmode 5` atau `.slowmode 0` untuk mematikan).
- **`.lock` & `.unlock`**: Mengunci atau membuka kembali channel obrolan saat ini.

---

### 🚪 2. Kategori Akses, Gerbang Server & Layanan Tiket (Gatekeeping)
- **`.setupticket`**: Mengirim panel tombol tiket bantuan resmi staf. Ketika member mengklik **"Buka Tiket"**, channel tiket privat (`#ticket-username`) otomatis dibuat rapi di dalam kategori **`REQUEST TICKET`** yang sudah ada di server, dan hanya bisa diakses oleh pelapor serta jajaran Staf (`KING'S`, `QUEEN'S`, `JACK`, Admin/Mod). Saat tiket ditutup, seluruh isi percakapan otomatis di-render menjadi **berkas transkrip HTML** interaktif dan dikirim ke channel **`#transcript-log`** serta ke DM pelapor.
- **`.setupverify`**: Mengirim panel verifikasi rules. Member baru menekan tombol untuk mengambil role **`CLUB`**, yang secara otomatis membuka akses seluruh channel kategori `COMMUNITY`.
- **`.lockdown` & `.unlockdown`**: Mengunci seluruh channel obrolan server secara instan saat terjadi serangan/raid darurat, dan membukanya kembali setelah situasi aman.
- **`.syncperms [#channel]`**: Menyamakan izin (*permissions*) suatu channel dengan kategori induknya secara otomatis.

---

### 🔎 2. Kategori Staf & Investigasi Cepat (Mod Utilities)
- **`.snipe`**: Memunculkan pesan terakhir yang baru saja dihapus di channel tersebut beserta nama pengirim, jam, dan lampiran.
- **`.editsnipe`**: Menampilkan isi asli pesan sebelum diubah atau diedit oleh pengirimnya.
- **`.checkalt [hari]`**: Memindai seluruh server untuk mendata member yang akun Discord-nya baru berumur kurang dari 3–7 hari (default 7 hari).
- **`.slowmode [detik]`**: Mengatur jeda pengiriman pesan (misal `.slowmode 5` atau `.slowmode 0` untuk mematikan).
- **🚨 Anti-Ghostping Otomatis**: Mendeteksi dan membongkar pelaku yang me-mention member/staf lalu langsung menghapus pesannya.

---

### ⚖️ 3. Kategori Disiplin & Karantina Lanjutan
- **`.modpanel @user`**: Kartu member interaktif dengan tombol taktis cepat (⏳ Mute 10m, ⚠️ Warn, 👢 Kick, 🔨 Ban).
- **`.jail @user [alasan]` & `.unjail @user`**: Karantina member ke role `@Jailed` untuk sidang staf (role asli disimpan dan dikembalikan otomatis).
- **`.softban @user [alasan]`**: Ban lalu unban instan untuk membersihkan seluruh riwayat chat spam 24 jam terakhir sekaligus mengeluarkan pelaku.
- **`.dm @user [pesan]`**: Mengirim teguran resmi atas nama bot langsung ke DM member secara privat.

---

### 🎙️ 4. Kategori Interaksi Voice Staf & Waiting Room
- **`.vckick @user`**: Disconnect paksa member dari voice channel.
- **`.vcmute @user` & `.vcunmute @user`**: Mute / unmute server mic member di voice channel.
- **`.vcmove @user [channel]`**: Memindahkan member antar-voice channel secara instan.
- **`.next` (Voice Waiting Room)**: Otomatis menarik member antrean terdepan dari Ruang Tunggu masuk ke voice channel moderator (`AdminVoice`).

---

### 📊 5. Kategori Evaluasi Internal Staf
- **`.modstats [@moderator]`**: Menampilkan rekapitulasi keaktifan staf (jumlah timeout, kick, ban, warn, clear, softban, dan tiket) untuk evaluasi Owner (`KING'S`).

---

### 🎮 6. Kategori Komunitas, Gaming, Editor & Enhanced AFK
- **`.afk [alasan]` (Enhanced AFK System)**:
  - Otomatis mengubah nama panggilan menjadi **`[AFK] Nama`** (jika bot memiliki izin *Manage Nicknames*).
  - Menyimpan nickname asli dan otomatis mengembalikannya saat member kembali.
  - **Pencabutan Otomatis:** Status AFK dicabut seketika saat member **mengetik chat** atau **bergabung ke voice channel** (`voiceStateUpdate`).
  - **Auto-Responder:** Memberikan notifikasi timestamp relatif (`<t:...:R>`) dan alasan saat orang lain me-mention member yang sedang AFK.
- **`.mabar [Game] [Slot]`**: Membuat ajakan mabar interaktif dengan tombol **"Join"** dan **"Leave"**, otomatis me-mention seluruh peserta saat kuota slot terpenuhi.
- **`.rate` / `.feedback`**: Membuat thread diskusi polling rating bintang 1–5 di bawah video AMV atau karya desain grafis member.
- **`.preset` / `.assets`**: Menampilkan panel embed berisi kumpulan link Google Drive bahan editing resmi (font pack, SFX, overlay, preset AM/AE).
- **`.rep @user [alasan]` & `.checkrep @user`**: Sistem poin reputasi/respect antar-member komunitas.

---

### ⚙️ 7. Kategori Kontrol Perintah & Pengingat Renew Hosting
- **⏰ Pengingat Renew Bot-Hosting Otomatis (`node-cron`)**: Mengirim notifikasi privat langsung ke **Direct Message (DM) Pemilik Bot** setiap hari pukul 12:00 WIB agar tidak lupa menekan tombol *Renew/Extend* (masa aktif 4 hari).
- **`.cekrenew`**: Menampilkan embed tautan resmi menuju panel dashboard Bot-Hosting untuk perpanjangan masa aktif server.
- **🧪 `.testdm` (Secret Command)**: Perintah uji coba rahasia (hanya bisa dijalankan oleh Administrator/Owner) untuk memastikan sistem pengiriman DM bot berjalan lancar. Tidak dimasukkan ke daftar menu `.help`.
- **`.disable <nama_command>`**: Menonaktifkan perintah tertentu sementara tanpa perlu restart bot (misal: `.disable preset`).
- **`.enable <nama_command>`**: Mengaktifkan kembali perintah yang sebelumnya dinonaktifkan.
- **Penyimpanan:** Daftar perintah nonaktif tersimpan di database berkas (`disabled_commands.json`) sehingga status nonaktif tetap bertahan meskipun bot di-restart.

---

### 📁 Pemisahan Channel Logging Otomatis
- **🗑️ Pesan Terhapus**: Khusus dicatat di channel **`#delete-message`**.
- **📜 Log Audit Umum**: Log pesan diedit, member join/leave, warn, jail, voice, dan tiket dicatat di **`#admin-logs`**.

---

## 🚀 Panduan Update di Bot-Hosting.net

1. Buka dashboard [bot-hosting.net](https://bot-hosting.net) (deployment **AmbanimeOfficial**).
2. Masuk ke menu **Files** > buka **`index.js`**.
3. Hapus seluruh isinya, lalu **Copy & Paste** kode terbaru dari `D:\discordbot\index.js`.
4. Klik **Save Content**.
5. Buka tab **Console**, lalu klik **Restart**.
