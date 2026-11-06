# 🤖 Ambanime Custom Bot — Master Documentation

Bot kustom Discord all-in-one yang dirancang secara khusus untuk memenuhi kebutuhan unik internal Komunitas & Staf AMBANIME (di luar fungsi bot publik biasa).

Prefix Perintah: **`.`** (Titik) — *juga otomatis merespons prefix `!`*

---

## 🌟 Ringkasan 6 Kategori Fitur Master

### 🚪 1. Kategori Akses, Gerbang Server & Verifikasi (Gatekeeping)
- **`.setupverify`**: Mengirim panel verifikasi rules. Member baru menekan tombol untuk mengambil role **`CLUB`**, yang secara otomatis membuka akses seluruh channel kategori `COMMUNITY`.
- **`.lockdown`**: Mengunci seluruh channel obrolan server secara instan saat terjadi serangan/raid darurat.
- **`.unlockdown`**: Mencabut status lockdown dan membuka kembali obrolan normal.
- **`.syncperms [#channel]`**: Menyamakan izin (*permissions*) suatu channel dengan kategori induknya secara otomatis.

---

### 🔎 2. Kategori Staf & Investigasi Cepat (Mod Utilities)
- **`.snipe`**: Memunculkan pesan terakhir yang baru saja dihapus di channel tersebut beserta nama pengirim, jam, dan lampiran.
- **`.editsnipe`**: Menampilkan isi asli pesan sebelum diubah atau diedit oleh pengirimnya.
- **`.checkalt [hari]`**: Memindai seluruh server untuk mendata member yang akun Discord-nya baru berumur kurang dari 3–7 hari (default 7 hari).
- **`.slowmode [detik]`**: Mengatur jeda pengiriman pesan (misal `.slowmode 5` atau `.slowmode 0` untuk mematikan).
- **🚨 Anti-Ghostping Otomatis**: Mendeteksi dan membongkar pelaku yang me-mention member/staf lalu langsung menghapus pesannya dalam hitungan detik.

---

### ⚖️ 3. Kategori Disiplin & Karantina Lanjutan
- **`.modpanel @user`**: Memunculkan kartu member interaktif dengan tombol taktis cepat:
  - ⏳ **Mute 10m**
  - ⚠️ **Warn**
  - 👢 **Kick**
  - 🔨 **Ban**
- **`.jail @user [alasan]`**: Mencabut semua role member, menyimpannya di database, dan memindahkannya ke role **`@Jailed`** untuk sidang interogasi staf.
- **`.unjail @user`**: Mengembalikan seluruh role asli member setelah sidang selesai.
- **`.softban @user [alasan]`**: Melakukan ban lalu unban instan untuk membersihkan seluruh riwayat chat spam 24 jam terakhir sekaligus mengeluarkan pelaku.
- **`.dm @user [pesan]`**: Mengirim teguran atau pesan resmi atas nama bot langsung ke direct message member secara privat.

---

### 🎙️ 4. Kategori Interaksi Voice Staf & Waiting Room
- **`.vckick @user`**: Memutus sambungan (*disconnect*) paksa member dari voice channel.
- **`.vcmute @user`** / **`.vcunmute @user`**: Mute / unmute server mic member di voice channel.
- **`.vcmove @user [channel]`**: Memindahkan member antar-voice channel secara instan.
- **`.next` (Voice Waiting Room)**: Otomatis menarik member antrean terdepan dari Ruang Tunggu masuk ke voice channel moderator (`AdminVoice`) saat sesi sidang/pengaduan.

---

### 📊 5. Kategori Evaluasi Internal Staf
- **`.modstats [@moderator]`**: Menampilkan rekapitulasi keaktifan staf (jumlah timeout, kick, ban, warn, clear chat, dan tiket yang ditangani) untuk bahan evaluasi berkala oleh Owner (`KING'S`).

---

### 🎮 6. Kategori Komunitas, Gaming & Editor
- **`.mabar [Game] [Slot]`**: Membuat ajakan mabar interaktif dengan tombol **"Join"** dan **"Leave"**, lalu otomatis me-mention seluruh peserta saat kuota slot terpenuhi.
- **`.rate` / `.feedback`**: Membuat thread diskusi polling rating bintang 1–5 di bawah video AMV atau karya desain grafis member.
- **`.preset` / `.assets`**: Menampilkan panel embed berisi kumpulan link Google Drive bahan editing resmi (font pack, SFX, overlay, preset AM/AE).
- **`.afk [alasan]`**: Menandai status AFK; bot akan membalas otomatis jika ada yang me-mention Anda, lalu mencabut statusnya saat Anda kembali mengetik.
- **`.rep @user [alasan]`** & **`.checkrep @user`**: Sistem poin reputasi/respect antar-member komunitas.

---

### 📁 Pemisahan Channel Logging Otomatis
- **🗑️ Pesan Terhapus**: Khusus dicatat di channel **`#delete-message`**.
- **📜 Log Audit Umum**: Log pesan diedit, member join/leave, warn, jail, voice, dan tiket dicatat di **`#admin-logs`**.

---

## 🚀 Panduan Update di Bot-Hosting.net

1. Buka dashboard [bot-hosting.net](https://bot-hosting.net) (deployment **AmbanimeOfficial**).
2. Masuk ke menu **Files** > buka **`index.js`**.
3. Hapus seluruh isi lama, lalu **Copy & Paste** kode terbaru dari `D:\discordbot\index.js`.
4. Klik **Save Content**.
5. Buka tab **Console**, lalu klik **Restart**.
