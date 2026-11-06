require('dotenv').config();
const { 
  Client, 
  GatewayIntentBits, 
  Partials, 
  PermissionFlagsBits, 
  ChannelType,
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  EmbedBuilder 
} = require('discord.js');
const fs = require('fs');
const path = require('path');

// Inisialisasi Discord Client dengan Intent & Partial lengkap
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration
  ],
  partials: [
    Partials.Message,
    Partials.Channel,
    Partials.GuildMember,
    Partials.User
  ]
});

// Konfigurasi Bot
const PREFIX = process.env.PREFIX || '!';
const LOG_CHANNEL_NAME = (process.env.LOG_CHANNEL_NAME || 'admin-logs').toLowerCase();

// File Penyimpanan Peringatan (Warn System Persistence)
const WARN_FILE = path.join(__dirname, 'warnings.json');

function loadWarnings() {
  try {
    if (fs.existsSync(WARN_FILE)) {
      return JSON.parse(fs.readFileSync(WARN_FILE, 'utf8'));
    }
  } catch (err) {
    console.error('Gagal membaca warnings.json:', err);
  }
  return {};
}

function saveWarnings(data) {
  try {
    fs.writeFileSync(WARN_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('Gagal menyimpan warnings.json:', err);
  }
}

// ==========================================
// DAFTAR ROLE MINAT (SELF-ASSIGNABLE ROLES)
// ==========================================
const ROLE_CONFIG = [
  {
    id: 'role_mlbb',
    name: 'MLBB',
    label: 'MLBB',
    emoji: '⚔️',
    style: ButtonStyle.Primary,
    description: 'Pemain Mobile Legends: Bang Bang'
  },
  {
    id: 'role_valorant',
    name: 'Valorant',
    label: 'Valorant',
    emoji: '🎯',
    style: ButtonStyle.Danger,
    description: 'Pemain Valorant'
  },
  {
    id: 'role_anime',
    name: 'Anime',
    label: 'Anime',
    emoji: '🌸',
    style: ButtonStyle.Secondary,
    description: 'Pecinta Anime & Manga'
  },
  {
    id: 'role_video_editor',
    name: 'Video Editor',
    label: 'Video Editor',
    emoji: '🎬',
    style: ButtonStyle.Success,
    description: 'Creator, Content & Video Editor'
  }
];

// Daftar Kata Kasar / SARA (Word Blacklist)
const BLACKLISTED_WORDS = [
  'kontol', 'memek', 'ngentot', 'pantek', 'peler', 'jembut',
  'lonte', 'perek', 'babi', 'anjing', 'bangsat', 'bajingan',
  'tolol', 'goblok', 'idiot'
];

// Helper: Mengirim pesan log ke channel #admin-logs
async function sendAuditLog(guild, embed) {
  if (!guild) return;
  try {
    const logChannel = guild.channels.cache.find(
      c => c.isTextBased() && c.name.toLowerCase() === LOG_CHANNEL_NAME
    );
    if (logChannel) {
      await logChannel.send({ embeds: [embed] }).catch(() => {});
    }
  } catch (err) {
    console.error('Error saat mengirim log ke admin-logs:', err);
  }
}

// Helper: Parser durasi waktu (misal: 10, 10m, 1h, 1d)
function parseDuration(input) {
  if (!input) return null;
  if (/^\d+$/.test(input)) {
    return parseInt(input, 10) * 60 * 1000;
  }
  const match = input.match(/^(\d+)\s*(s|m|h|d|w)$/i);
  if (!match) return null;
  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();

  switch (unit) {
    case 's': return value * 1000;
    case 'm': return value * 60 * 1000;
    case 'h': return value * 60 * 60 * 1000;
    case 'd': return value * 24 * 60 * 60 * 1000;
    case 'w': return value * 7 * 24 * 60 * 60 * 1000;
    default: return null;
  }
}

// Helper: Format durasi milidetik ke teks yang mudah dibaca
function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds} detik`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} menit`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} jam`;
  const days = Math.floor(hours / 24);
  return `${days} hari`;
}

// Helper: Deteksi Capslock Berlebihan (> 70% pada pesan panjang)
function isExcessiveCaps(text) {
  const cleaned = text
    .replace(/<@!?[0-9]+>/g, '')
    .replace(/<#?[0-9]+>/g, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/<a?:[a-zA-Z0-9_]+:[0-9]+>/g, '')
    .trim();

  const lettersOnly = cleaned.replace(/[^a-zA-Z]/g, '');
  if (lettersOnly.length < 12) return false;

  const upperCount = (lettersOnly.match(/[A-Z]/g) || []).length;
  return (upperCount / lettersOnly.length) >= 0.70;
}

// Helper: Deteksi Kata Kasar / SARA
function detectBadWord(text) {
  const lower = text.toLowerCase();
  for (const word of BLACKLISTED_WORDS) {
    const regex = new RegExp(`(^|\\s|[^a-zA-Z0-9])${word}($|\\s|[^a-zA-Z0-9])`, 'i');
    if (regex.test(lower)) return word;
  }
  return null;
}

// ==========================================
// EVENT: BOT SIAP & ONLINE
// ==========================================
client.once('ready', () => {
  console.log(`========================================`);
  console.log(`✅ Bot berhasil online sebagai: ${client.user.tag}`);
  console.log(`⚙️ Prefix perintah: ${PREFIX}`);
  console.log(`📋 Channel logging target: #${LOG_CHANNEL_NAME}`);
  console.log(`🎫 Sistem Tiket, Auto-Mod & Warn System: AKTIF`);
  console.log(`========================================`);
});

// ==========================================
// 1. SISTEM LOGGING (AUDIT TRAIL)
// ==========================================

// Log: Pesan Dihapus
client.on('messageDelete', async (message) => {
  if (!message.guild || message.author?.bot) return;

  const content = message.content 
    ? (message.content.length > 1024 ? message.content.substring(0, 1020) + '...' : message.content)
    : '*[Tidak ada teks / pesan kosong]*';

  const embed = new EmbedBuilder()
    .setTitle('🗑️ Pesan Dihapus')
    .setColor(0xED4245)
    .addFields(
      { name: 'Pengirim', value: message.author ? `${message.author.tag} (<@${message.author.id}>)` : '*Tidak diketahui*', inline: true },
      { name: 'Channel', value: `${message.channel}`, inline: true },
      { name: 'Isi Pesan', value: content }
    )
    .setTimestamp();

  if (message.attachments && message.attachments.size > 0) {
    const attachmentNames = message.attachments.map(a => a.name || 'File').join(', ');
    embed.addFields({ name: '📎 Lampiran', value: attachmentNames.substring(0, 1024) });
  }

  await sendAuditLog(message.guild, embed);
});

// Log: Pesan Diedit
client.on('messageUpdate', async (oldMessage, newMessage) => {
  if (!newMessage.guild || newMessage.author?.bot) return;
  if (oldMessage.content === newMessage.content) return;

  const oldText = oldMessage.content 
    ? (oldMessage.content.length > 1024 ? oldMessage.content.substring(0, 1020) + '...' : oldMessage.content)
    : '*[Pesan lama tidak tersimpan di cache]*';

  const newText = newMessage.content 
    ? (newMessage.content.length > 1024 ? newMessage.content.substring(0, 1020) + '...' : newMessage.content)
    : '*[Pesan kosong]*';

  const embed = new EmbedBuilder()
    .setTitle('✏️ Pesan Diedit')
    .setColor(0xFEE75C)
    .addFields(
      { name: 'Pengirim', value: `${newMessage.author.tag} (<@${newMessage.author.id}>)`, inline: true },
      { name: 'Channel', value: `${newMessage.channel}`, inline: true },
      { name: 'Sebelum', value: oldText },
      { name: 'Sesudah', value: newText },
      { name: 'Tautan', value: `[Lompat ke Pesan](${newMessage.url})` }
    )
    .setTimestamp();

  await sendAuditLog(newMessage.guild, embed);
});

// Log: Member Baru Bergabung
client.on('guildMemberAdd', async (member) => {
  const accountCreated = Math.floor(member.user.createdTimestamp / 1000);
  const embed = new EmbedBuilder()
    .setTitle('📥 Member Bergabung')
    .setColor(0x57F287)
    .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
    .addFields(
      { name: 'Member', value: `${member.user.tag} (<@${member.id}>)`, inline: true },
      { name: 'ID Member', value: member.id, inline: true },
      { name: 'Akun Dibuat', value: `<t:${accountCreated}:F> (<t:${accountCreated}:R>)` },
      { name: 'Total Member Server', value: `${member.guild.memberCount} member` }
    )
    .setTimestamp();

  await sendAuditLog(member.guild, embed);
});

// Log: Member Keluar / Dikeluarkan
client.on('guildMemberRemove', async (member) => {
  const roles = member.roles?.cache
    ? member.roles.cache.filter(r => r.id !== member.guild.id).map(r => r.name).join(', ')
    : 'Tidak ada';

  const embed = new EmbedBuilder()
    .setTitle('📤 Member Keluar')
    .setColor(0xED4245)
    .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
    .addFields(
      { name: 'Member', value: `${member.user.tag} (<@${member.id}>)`, inline: true },
      { name: 'ID Member', value: member.id, inline: true },
      { name: 'Role Terakhir', value: roles.length > 0 ? roles.substring(0, 1024) : 'Tidak ada' },
      { name: 'Total Member Tersisa', value: `${member.guild.memberCount} member` }
    )
    .setTimestamp();

  await sendAuditLog(member.guild, embed);
});

// ==========================================
// 2. MODERASI, AUTO-MOD & PERINTAH BOT
// ==========================================
client.on('messageCreate', async (message) => {
  if (!message.guild || message.author.bot) return;

  const content = message.content;
  const isStaff = message.member.permissions.has(PermissionFlagsBits.ManageMessages) ||
                  message.member.permissions.has(PermissionFlagsBits.Administrator);

  // ------------------------------------------
  // AUTO-MOD 1: ANTI-INVITE & ANTI-PHISHING
  // ------------------------------------------
  const inviteRegex = /(https?:\/\/)?(www\.)?(discord\.(gg|io|me|li)|discordapp\.com\/invite|discord\.com\/invite|dsc\.gg|invite\.gg)\/[a-zA-Z0-9_-]+/gi;
  const phishingRegex = /(nitro.*gift|gift.*nitro|free.*nitro|steamcommunity.*trade|steamcommunitu|dlscord|discorcl|discocrd|discord-nitro|nitro-airdrop)/gi;

  if (!isStaff && (inviteRegex.test(content) || phishingRegex.test(content))) {
    const isPhishing = phishingRegex.test(content);
    await message.delete().catch(() => {});

    const warningText = isPhishing 
      ? `⚠️ ${message.author}, dilarang membagikan link mencurigakan / phishing!`
      : `⚠️ ${message.author}, dilarang membagikan link invite server lain di sini!`;

    const warnMsg = await message.channel.send(warningText).catch(() => {});
    if (warnMsg) setTimeout(() => warnMsg.delete().catch(() => {}), 5000);

    const alertEmbed = new EmbedBuilder()
      .setTitle(isPhishing ? '🚨 Deteksi Link Phishing' : '🛡️ Deteksi Link Invite')
      .setColor(0xED4245)
      .addFields(
        { name: 'Pelanggar', value: `${message.author.tag} (<@${message.author.id}>)`, inline: true },
        { name: 'Channel', value: `${message.channel}`, inline: true },
        { name: 'Tindakan', value: 'Pesan otomatis dihapus', inline: true },
        { name: 'Isi Pesan', value: content.substring(0, 1024) }
      )
      .setTimestamp();

    await sendAuditLog(message.guild, alertEmbed);
    return;
  }

  // ------------------------------------------
  // AUTO-MOD 2: ANTI-SPAM MENTION
  // ------------------------------------------
  if (!isStaff) {
    const hasEveryoneTag = !message.member.permissions.has(PermissionFlagsBits.MentionEveryone) &&
                           (content.includes('@everyone') || content.includes('@here'));
    const isMassTag = message.mentions.users.size > 4;

    if (hasEveryoneTag || isMassTag) {
      await message.delete().catch(() => {});
      const warnMsg = await message.channel.send(`⚠️ ${message.author}, dilarang melakukan spam mention atau tag berlebihan!`).catch(() => {});
      if (warnMsg) setTimeout(() => warnMsg.delete().catch(() => {}), 5000);

      const alertEmbed = new EmbedBuilder()
        .setTitle('🚨 Deteksi Spam Mention')
        .setColor(0xED4245)
        .addFields(
          { name: 'Pelanggar', value: `${message.author.tag} (<@${message.author.id}>)`, inline: true },
          { name: 'Channel', value: `${message.channel}`, inline: true },
          { name: 'Jumlah Tag', value: `${message.mentions.users.size} pengguna`, inline: true },
          { name: 'Pesan', value: content.substring(0, 1024) }
        )
        .setTimestamp();

      await sendAuditLog(message.guild, alertEmbed);
      return;
    }
  }

  // ------------------------------------------
  // AUTO-MOD 3: ANTI-CAPSLOCK BERLEBIHAN
  // ------------------------------------------
  if (!isStaff && isExcessiveCaps(content)) {
    await message.delete().catch(() => {});
    const warnMsg = await message.channel.send(`⚠️ ${message.author}, harap tidak menggunakan huruf kapital (CAPSLOCK) berlebihan!`).catch(() => {});
    if (warnMsg) setTimeout(() => warnMsg.delete().catch(() => {}), 5000);

    const alertEmbed = new EmbedBuilder()
      .setTitle('⚠️ Deteksi Capslock Berlebihan')
      .setColor(0xFEE75C)
      .addFields(
        { name: 'Pengirim', value: `${message.author.tag} (<@${message.author.id}>)`, inline: true },
        { name: 'Channel', value: `${message.channel}`, inline: true },
        { name: 'Pesan', value: content.substring(0, 1024) }
      )
      .setTimestamp();

    await sendAuditLog(message.guild, alertEmbed);
    return;
  }

  // ------------------------------------------
  // AUTO-MOD 4: WORD BLACKLIST (KATA KASAR/SARA)
  // ------------------------------------------
  if (!isStaff) {
    const badWord = detectBadWord(content);
    if (badWord) {
      await message.delete().catch(() => {});
      const warnMsg = await message.channel.send(`⚠️ ${message.author}, tolong jaga tata bahasa! Penggunaan kata kasar atau SARA dilarang di server ini.`).catch(() => {});
      if (warnMsg) setTimeout(() => warnMsg.delete().catch(() => {}), 5000);

      const alertEmbed = new EmbedBuilder()
        .setTitle('🚫 Filter Kata Kasar Terdeteksi')
        .setColor(0xED4245)
        .addFields(
          { name: 'Pengirim', value: `${message.author.tag} (<@${message.author.id}>)`, inline: true },
          { name: 'Channel', value: `${message.channel}`, inline: true },
          { name: 'Kata Terdeteksi', value: `\`${badWord}\``, inline: true },
          { name: 'Pesan Lengkap', value: content.substring(0, 1024) }
        )
        .setTimestamp();

      await sendAuditLog(message.guild, alertEmbed);
      return;
    }
  }

  // Periksa Prefix Perintah
  if (!content.startsWith(PREFIX)) return;

  const args = content.slice(PREFIX.length).trim().split(/\s+/);
  const command = args.shift().toLowerCase();

  // ------------------------------------------
  // PERINTAH: !help [mod]
  // ------------------------------------------
  if (command === 'help') {
    const isModHelp = args[0]?.toLowerCase() === 'mod';

    if (isModHelp) {
      const modEmbed = new EmbedBuilder()
        .setTitle('🛡️ Panel Panduan Terpadu Staf & Moderator')
        .setColor(0xED4245)
        .setDescription('Panduan referensi cepat perintah staf untuk mengelola server:')
        .addFields(
          {
            name: '⚖️ Manajemen Peringatan Bertingkat (Warn)',
            value:
              `\`${PREFIX}warn @user [alasan]\` : Beri peringatan.\n` +
              `↳ *3x Warn = Auto-Timeout 1 Jam*\n` +
              `↳ *5x Warn = Auto-Ban Permanen*\n` +
              `\`${PREFIX}checkwarn @user\` : Cek riwayat peringatan member.\n` +
              `\`${PREFIX}clearwarn @user\` : Reset semua peringatan member.`
          },
          {
            name: '🔒 Kontrol & Komunikasi Channel',
            value:
              `\`${PREFIX}lock\` : Kunci channel agar member biasa tidak bisa chat.\n` +
              `\`${PREFIX}unlock\` : Buka kembali kunci channel.\n` +
              `\`${PREFIX}say [pesan]\` : Kirim pengumuman resmi atas nama bot.`
          },
          {
            name: '🧹 Moderasi Pesan & Disiplin',
            value:
              `\`${PREFIX}clear [1-100]\` / \`${PREFIX}purge [1-100]\` : Hapus pesan massal.\n` +
              `\`${PREFIX}timeout @user [durasi] [alasan]\` (Alias: \`${PREFIX}mute\`)\n` +
              `\`${PREFIX}untimeout @user\` (Alias: \`${PREFIX}unmute\`)\n` +
              `\`${PREFIX}kick @user [alasan]\` : Keluarkan member.\n` +
              `\`${PREFIX}ban @user [alasan]\` : Ban member & hapus chat 24 jam.\n` +
              `\`${PREFIX}unban <ID_User> [alasan]\` : Cabut status ban via ID.`
          },
          {
            name: '🎫 Panel Komunitas & Bantuan',
            value:
              `\`${PREFIX}setupticket\` : Memasang panel Tiket Bantuan Privat Staf.\n` +
              `\`${PREFIX}setuproles\` : Memasang panel tombol role minat (@MLBB, @Valorant, dll).`
          },
          {
            name: '🤖 Otomasi Auto-Mod Aktif',
            value:
              `• Anti-Invite Discord & Anti-Phishing Link\n` +
              `• Anti-Capslock (> 70% pada pesan panjang)\n` +
              `• Anti-Spam Mention (> 4 member atau @everyone)\n` +
              `• Word Blacklist (Filter kata kasar/SARA otomatis)\n` +
              `• Seluruh log masuk ke channel \`#${LOG_CHANNEL_NAME}\``
          }
        )
        .setFooter({ text: 'Gunakan wewenang moderasi dengan bijak dan adil.' })
        .setTimestamp();

      return message.channel.send({ embeds: [modEmbed] });
    }

    const helpEmbed = new EmbedBuilder()
      .setTitle('🌟 Panduan Perintah Komunitas')
      .setColor(0x5865F2)
      .setDescription('Selamat datang di bot server! Berikut daftar perintah yang tersedia:')
      .addFields(
        {
          name: '💬 Perintah Umum & Role',
          value:
            `\`${PREFIX}help\` : Menampilkan menu bantuan ini.\n` +
            `\`${PREFIX}setuproles\` : Munculkan panel pilihan role notifikasi minat.\n` +
            `\`${PREFIX}setupticket\` : Munculkan panel buka tiket bantuan staf.`
        },
        {
          name: '🛡️ Menu Bantuan Staf & Moderator',
          value: `Ketik **\`${PREFIX}help mod\`** untuk melihat seluruh perintah khusus staf (Disiplin, Warn, Lock, Purge, dll).`
        }
      )
      .setFooter({ text: 'Ambanime Official Bot' })
      .setTimestamp();

    return message.channel.send({ embeds: [helpEmbed] });
  }

  // ------------------------------------------
  // PERINTAH: !setupticket / !ticketpanel
  // ------------------------------------------
  if (command === 'setupticket' || command === 'ticketpanel') {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply('❌ Hanya Administrator yang dapat memunculkan panel tiket bantuan.');
    }

    const ticketEmbed = new EmbedBuilder()
      .setTitle('🎫 PUSAT BANTUAN & TIKET STAF')
      .setDescription(
        'Butuh bantuan, ingin melaporkan member bermasalah, atau ingin menghubungi admin secara privat?\n\n' +
        'Klik tombol **Buka Tiket** di bawah. Bot akan otomatis membuatkan channel obrolan privat khusus antara Anda dan staf server.'
      )
      .setColor(0x5865F2)
      .setFooter({ text: 'Layanan Bantuan Resmi Server' })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('ticket_create')
        .setLabel('Buka Tiket')
        .setEmoji('📩')
        .setStyle(ButtonStyle.Primary)
    );

    await message.channel.send({ embeds: [ticketEmbed], components: [row] });
    await message.delete().catch(() => {});
    return;
  }

  // ------------------------------------------
  // PERINTAH: !warn @user [alasan]
  // ------------------------------------------
  if (command === 'warn') {
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      return message.reply('❌ Kamu tidak memiliki izin `Moderate Members` untuk memberi peringatan.');
    }

    const target = message.mentions.members.first();
    if (!target) {
      return message.reply(`⚠️ Sebutkan member yang ingin diberi peringatan.\nContoh: \`${PREFIX}warn @user Toxic di chat umum\``);
    }

    if (target.id === message.author.id) {
      return message.reply('❌ Kamu tidak bisa memberi peringatan pada diri sendiri.');
    }

    if (target.id === client.user.id) {
      return message.reply('❌ Kamu tidak bisa memberi peringatan pada bot.');
    }

    const reason = args.slice(1).join(' ') || 'Melanggar aturan komunitas';
    const key = `${message.guild.id}_${target.id}`;
    const allWarnings = loadWarnings();

    if (!allWarnings[key]) {
      allWarnings[key] = { count: 0, records: [] };
    }

    allWarnings[key].count += 1;
    allWarnings[key].records.push({
      reason,
      moderatorTag: message.author.tag,
      moderatorId: message.author.id,
      timestamp: Date.now()
    });

    const currentCount = allWarnings[key].count;
    saveWarnings(allWarnings);

    const warnEmbed = new EmbedBuilder()
      .setTitle('⚠️ Peringatan Diberikan (Warn)')
      .setColor(0xFEE75C)
      .setDescription(`**${target.user.tag}** telah menerima peringatan ke-**${currentCount}**.`)
      .addFields(
        { name: 'Target', value: `<@${target.id}>`, inline: true },
        { name: 'Moderator', value: `<@${message.author.id}>`, inline: true },
        { name: 'Total Peringatan', value: `**${currentCount}** kali`, inline: true },
        { name: 'Alasan', value: reason }
      )
      .setTimestamp();

    await message.channel.send({ embeds: [warnEmbed] });
    await sendAuditLog(message.guild, warnEmbed);

    // Otomasi Tindakan Bertingkat:
    // 5x Warn = Auto Ban
    if (currentCount >= 5) {
      if (target.bannable) {
        try {
          await target.ban({ reason: `Mencapai 5 kali peringatan bertingkat (Auto-Ban)` });
          const banEmbed = new EmbedBuilder()
            .setTitle('🔨 Tindakan Otomatis: Auto-Ban')
            .setColor(0xED4245)
            .setDescription(`**${target.user.tag}** otomatis di-ban permanen karena telah mencapai **5 kali peringatan**.`)
            .setTimestamp();
          await message.channel.send({ embeds: [banEmbed] });
          await sendAuditLog(message.guild, banEmbed);
        } catch (e) {
          console.error(e);
        }
      }
    } 
    // 3x Warn = Auto Timeout 1 Jam
    else if (currentCount === 3) {
      if (target.moderatable) {
        try {
          const oneHourMs = 60 * 60 * 1000;
          await target.timeout(oneHourMs, 'Mencapai 3 kali peringatan bertingkat (Auto-Timeout 1 Jam)');
          const muteEmbed = new EmbedBuilder()
            .setTitle('⏳ Tindakan Otomatis: Timeout 1 Jam')
            .setColor(0xFEE75C)
            .setDescription(`**${target.user.tag}** otomatis di-timeout selama **1 jam** karena telah mencapai **3 kali peringatan**.`)
            .setTimestamp();
          await message.channel.send({ embeds: [muteEmbed] });
          await sendAuditLog(message.guild, muteEmbed);
        } catch (e) {
          console.error(e);
        }
      }
    }
    return;
  }

  // ------------------------------------------
  // PERINTAH: !checkwarn @user / !warns @user
  // ------------------------------------------
  if (command === 'checkwarn' || command === 'warns') {
    const target = message.mentions.members.first() || message.member;
    const key = `${message.guild.id}_${target.id}`;
    const allWarnings = loadWarnings();
    const data = allWarnings[key];

    if (!data || data.count === 0) {
      return message.channel.send(`✅ **${target.user.tag}** memiliki catatan bersih (0 peringatan).`);
    }

    const history = data.records.map((r, i) => {
      const date = new Date(r.timestamp).toLocaleDateString('id-ID');
      return `**${i + 1}.** [${date}] Alasan: *${r.reason}* (Oleh: ${r.moderatorTag})`;
    }).slice(-10).join('\n');

    const embed = new EmbedBuilder()
      .setTitle(`📋 Catatan Peringatan: ${target.user.tag}`)
      .setColor(0xFEE75C)
      .addFields(
        { name: 'Total Peringatan', value: `**${data.count}** kali`, inline: true },
        { name: 'Status Ambang Batas', value: data.count >= 3 ? '⚠️ Rawan Hukuman Otomatis' : 'Aman', inline: true },
        { name: 'Riwayat Terakhir', value: history || 'Tidak ada catatan rinci.' }
      )
      .setTimestamp();

    return message.channel.send({ embeds: [embed] });
  }

  // ------------------------------------------
  // PERINTAH: !clearwarn @user
  // ------------------------------------------
  if (command === 'clearwarn' || command === 'resetwarn') {
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      return message.reply('❌ Kamu tidak memiliki izin `Moderate Members`.');
    }

    const target = message.mentions.members.first();
    if (!target) {
      return message.reply(`⚠️ Sebutkan member yang ingin dihapus peringatannya.\nContoh: \`${PREFIX}clearwarn @user\``);
    }

    const key = `${message.guild.id}_${target.id}`;
    const allWarnings = loadWarnings();

    if (!allWarnings[key] || allWarnings[key].count === 0) {
      return message.reply(`Member **${target.user.tag}** tidak memiliki peringatan.`);
    }

    delete allWarnings[key];
    saveWarnings(allWarnings);

    const embed = new EmbedBuilder()
      .setTitle('✨ Peringatan Dihapus (Reset Warn)')
      .setColor(0x57F287)
      .setDescription(`Seluruh poin peringatan untuk **${target.user.tag}** telah berhasil dibersihkan oleh <@${message.author.id}>.`)
      .setTimestamp();

    await message.channel.send({ embeds: [embed] });
    await sendAuditLog(message.guild, embed);
    return;
  }

  // ------------------------------------------
  // PERINTAH: !lock & !unlock (Kunci Channel)
  // ------------------------------------------
  if (command === 'lock') {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
      return message.reply('❌ Kamu tidak memiliki izin `Manage Channels`.');
    }

    await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, {
      SendMessages: false
    });

    const lockEmbed = new EmbedBuilder()
      .setTitle('🔒 Channel Dikunci')
      .setColor(0xED4245)
      .setDescription(`Channel ini telah dikunci sementara oleh <@${message.author.id}>. Member biasa tidak dapat mengirim pesan.`)
      .setTimestamp();

    await message.channel.send({ embeds: [lockEmbed] });
    await sendAuditLog(message.guild, lockEmbed);
    return;
  }

  if (command === 'unlock') {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
      return message.reply('❌ Kamu tidak memiliki izin `Manage Channels`.');
    }

    await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, {
      SendMessages: null
    });

    const unlockEmbed = new EmbedBuilder()
      .setTitle('🔓 Channel Dibuka Kembali')
      .setColor(0x57F287)
      .setDescription(`Channel ini telah dibuka kembali oleh <@${message.author.id}>. Member dapat mengobrol seperti biasa.`)
      .setTimestamp();

    await message.channel.send({ embeds: [unlockEmbed] });
    await sendAuditLog(message.guild, unlockEmbed);
    return;
  }

  // ------------------------------------------
  // PERINTAH: !say [pesan]
  // ------------------------------------------
  if (command === 'say') {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
      return message.reply('❌ Kamu tidak memiliki izin untuk menggunakan perintah ini.');
    }

    const announcement = args.join(' ');
    if (!announcement) {
      return message.reply('⚠️ Masukkan teks yang ingin disampaikan oleh bot.');
    }

    await message.delete().catch(() => {});
    await message.channel.send(announcement);
    return;
  }

  // ------------------------------------------
  // PERINTAH: !clear / !purge [jumlah]
  // ------------------------------------------
  if (command === 'clear' || command === 'purge' || command === 'hapus') {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
      return message.reply('❌ Kamu tidak memiliki izin `Manage Messages`.');
    }

    if (!message.guild.members.me.permissions.has(PermissionFlagsBits.ManageMessages)) {
      return message.reply('❌ Bot tidak memiliki izin `Manage Messages` di channel ini.');
    }

    const amount = parseInt(args[0], 10);
    if (isNaN(amount) || amount < 1 || amount > 100) {
      return message.reply(`⚠️ Masukkan jumlah pesan antara **1 - 100**.\nContoh: \`${PREFIX}clear 20\``);
    }

    try {
      await message.delete().catch(() => {});
      const deleted = await message.channel.bulkDelete(amount, true);
      const confirmMsg = await message.channel.send(`✅ Berhasil membersihkan **${deleted.size}** pesan.`);
      setTimeout(() => confirmMsg.delete().catch(() => {}), 4000);

      const logEmbed = new EmbedBuilder()
        .setTitle('🧹 Pesan Dibersihkan (Mass Purge)')
        .setColor(0x57F287)
        .addFields(
          { name: 'Moderator', value: `${message.author.tag} (<@${message.author.id}>)`, inline: true },
          { name: 'Channel', value: `${message.channel}`, inline: true },
          { name: 'Jumlah Pesan', value: `${deleted.size} pesan`, inline: true }
        )
        .setTimestamp();

      await sendAuditLog(message.guild, logEmbed);
    } catch (err) {
      console.error(err);
      message.channel.send('❌ Gagal menghapus pesan secara massal (pesan >14 hari tidak dapat dihapus massal).');
    }
    return;
  }

  // ------------------------------------------
  // PERINTAH: !timeout / !mute @user [durasi] [alasan]
  // ------------------------------------------
  if (command === 'timeout' || command === 'mute') {
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      return message.reply('❌ Kamu tidak memiliki izin `Moderate Members`.');
    }

    if (!message.guild.members.me.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      return message.reply('❌ Bot tidak memiliki izin `Moderate Members`.');
    }

    const target = message.mentions.members.first();
    if (!target) {
      return message.reply(`⚠️ Harap sebutkan member yang ingin di-timeout.\nContoh: \`${PREFIX}timeout @user 10m Toxic saat mabar\``);
    }

    if (target.id === message.author.id || target.id === client.user.id) {
      return message.reply('❌ Tidak dapat memberi timeout pada target tersebut.');
    }

    if (!target.moderatable) {
      return message.reply('❌ Posisi role bot berada di bawah member tersebut.');
    }

    if (message.member.roles.highest.position <= target.roles.highest.position && message.guild.ownerId !== message.author.id) {
      return message.reply('❌ Kamu tidak bisa memberi timeout pada member dengan role setara atau lebih tinggi.');
    }

    let durationMs = 10 * 60 * 1000;
    let reasonIndex = 1;

    const parsed = parseDuration(args[1]);
    if (parsed) {
      durationMs = parsed;
      reasonIndex = 2;
    }

    const MAX_TIMEOUT = 28 * 24 * 60 * 60 * 1000;
    if (durationMs > MAX_TIMEOUT) {
      return message.reply('❌ Durasi timeout maksimal adalah 28 hari.');
    }

    const reason = args.slice(reasonIndex).join(' ') || 'Melanggar aturan komunitas';

    try {
      await target.timeout(durationMs, `${message.author.tag}: ${reason}`);
      const durationStr = formatDuration(durationMs);

      const successEmbed = new EmbedBuilder()
        .setTitle('⏳ Member Di-timeout')
        .setColor(0xFEE75C)
        .setDescription(`**${target.user.tag}** berhasil dibungkam selama **${durationStr}**.`)
        .addFields(
          { name: 'Target', value: `<@${target.id}>`, inline: true },
          { name: 'Moderator', value: `<@${message.author.id}>`, inline: true },
          { name: 'Alasan', value: reason }
        )
        .setTimestamp();

      await message.channel.send({ embeds: [successEmbed] });
      await sendAuditLog(message.guild, successEmbed);
    } catch (err) {
      console.error(err);
      message.reply('❌ Gagal memproses timeout.');
    }
    return;
  }

  // ------------------------------------------
  // PERINTAH: !untimeout / !unmute @user
  // ------------------------------------------
  if (command === 'untimeout' || command === 'unmute') {
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      return message.reply('❌ Kamu tidak memiliki izin `Moderate Members`.');
    }

    const target = message.mentions.members.first();
    if (!target) return message.reply(`⚠️ Sebutkan member yang ingin dicabut timeout-nya.`);

    if (!target.moderatable) {
      return message.reply('❌ Bot tidak dapat mengubah status timeout member ini.');
    }

    const reason = args.slice(1).join(' ') || 'Timeout dicabut oleh moderator';

    try {
      await target.timeout(null, `${message.author.tag}: ${reason}`);

      const embed = new EmbedBuilder()
        .setTitle('🔊 Timeout Dicabut')
        .setColor(0x57F287)
        .setDescription(`Hukuman timeout untuk **${target.user.tag}** telah dicabut.`)
        .addFields(
          { name: 'Target', value: `<@${target.id}>`, inline: true },
          { name: 'Moderator', value: `<@${message.author.id}>`, inline: true },
          { name: 'Alasan', value: reason }
        )
        .setTimestamp();

      await message.channel.send({ embeds: [embed] });
      await sendAuditLog(message.guild, embed);
    } catch (err) {
      console.error(err);
      message.reply('❌ Gagal mencabut timeout.');
    }
    return;
  }

  // ------------------------------------------
  // PERINTAH: !kick @user [alasan]
  // ------------------------------------------
  if (command === 'kick') {
    if (!message.member.permissions.has(PermissionFlagsBits.KickMembers)) {
      return message.reply('❌ Kamu tidak memiliki izin `Kick Members`.');
    }

    const target = message.mentions.members.first();
    if (!target) return message.reply(`⚠️ Sebutkan member yang ingin di-kick.`);
    if (target.id === message.author.id || !target.kickable) {
      return message.reply('❌ Tidak bisa meng-kick member ini.');
    }

    const reason = args.slice(1).join(' ') || 'Melanggar aturan komunitas';

    try {
      await target.kick(`${message.author.tag}: ${reason}`);
      const embed = new EmbedBuilder()
        .setTitle('👢 Member Dikeluarkan (Kick)')
        .setColor(0xED4245)
        .setDescription(`**${target.user.tag}** berhasil dikeluarkan dari server.`)
        .addFields(
          { name: 'Target', value: `${target.user.tag} (${target.id})`, inline: true },
          { name: 'Moderator', value: `<@${message.author.id}>`, inline: true },
          { name: 'Alasan', value: reason }
        )
        .setTimestamp();

      await message.channel.send({ embeds: [embed] });
      await sendAuditLog(message.guild, embed);
    } catch (err) {
      console.error(err);
      message.reply('❌ Terjadi kesalahan saat meng-kick member.');
    }
    return;
  }

  // ------------------------------------------
  // PERINTAH: !ban @user [alasan] / !ban <ID> [alasan]
  // ------------------------------------------
  if (command === 'ban') {
    if (!message.member.permissions.has(PermissionFlagsBits.BanMembers)) {
      return message.reply('❌ Kamu tidak memiliki izin `Ban Members`.');
    }

    const targetMention = message.mentions.members.first();
    const targetId = targetMention ? targetMention.id : args[0]?.replace(/[<@!>]/g, '');

    if (!targetId || targetId === message.author.id) {
      return message.reply(`⚠️ Masukkan target member atau ID yang valid.`);
    }

    const reason = args.slice(1).join(' ') || 'Pelanggaran fatal aturan komunitas';

    try {
      await message.guild.members.ban(targetId, {
        deleteMessageSeconds: 86400,
        reason: `${message.author.tag}: ${reason}`
      });

      const embed = new EmbedBuilder()
        .setTitle('🔨 Member Di-ban Permanen')
        .setColor(0xED4245)
        .setDescription(`Member dengan ID **${targetId}** berhasil di-ban dari server.`)
        .addFields(
          { name: 'Target ID', value: targetId, inline: true },
          { name: 'Moderator', value: `<@${message.author.id}>`, inline: true },
          { name: 'Alasan', value: reason }
        )
        .setTimestamp();

      await message.channel.send({ embeds: [embed] });
      await sendAuditLog(message.guild, embed);
    } catch (err) {
      console.error(err);
      message.reply('❌ Terjadi kesalahan saat memproses ban.');
    }
    return;
  }

  // ------------------------------------------
  // PERINTAH: !unban <ID_User> [alasan]
  // ------------------------------------------
  if (command === 'unban') {
    if (!message.member.permissions.has(PermissionFlagsBits.BanMembers)) {
      return message.reply('❌ Kamu tidak memiliki izin `Ban Members`.');
    }

    const userId = args[0]?.replace(/[<@!>]/g, '');
    if (!userId) return message.reply(`⚠️ Masukkan ID pengguna yang ingin dicabut ban-nya.`);

    const reason = args.slice(1).join(' ') || 'Pencabutan ban oleh moderator';

    try {
      const banInfo = await message.guild.bans.fetch(userId).catch(() => null);
      if (!banInfo) return message.reply('⚠️ Pengguna tersebut tidak ada dalam daftar ban server ini.');

      await message.guild.members.unban(userId, `${message.author.tag}: ${reason}`);

      const embed = new EmbedBuilder()
        .setTitle('🔓 Status Ban Dicabut (Unban)')
        .setColor(0x57F287)
        .setDescription(`Status ban untuk **${banInfo.user.tag}** (${userId}) berhasil dicabut.`)
        .addFields(
          { name: 'Target', value: `${banInfo.user.tag} (${userId})`, inline: true },
          { name: 'Moderator', value: `<@${message.author.id}>`, inline: true },
          { name: 'Alasan', value: reason }
        )
        .setTimestamp();

      await message.channel.send({ embeds: [embed] });
      await sendAuditLog(message.guild, embed);
    } catch (err) {
      console.error(err);
      message.reply('❌ Gagal mencabut ban.');
    }
    return;
  }

  // ------------------------------------------
  // PERINTAH: !setuproles / !rolepanel
  // ------------------------------------------
  if (command === 'setuproles' || command === 'rolepanel') {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply('❌ Hanya Administrator yang dapat memunculkan panel role minat.');
    }

    const roleDescriptions = ROLE_CONFIG.map(
      r => `${r.emoji} • **@${r.name}** : ${r.description}`
    ).join('\n');

    const embed = new EmbedBuilder()
      .setTitle('🎮 PILIHAN ROLE MINAT & NOTIFIKASI')
      .setDescription(
        'Silakan ambil role sesuai minat dan game yang kamu sukai dengan menekan tombol di bawah ini!\n\n' +
        'Dengan memiliki role ini, kamu hanya akan menerima tag & notifikasi sesuai ketertarikanmu saat ada yang mabar atau info terbaru.\n\n' +
        `${roleDescriptions}\n\n` +
        '📌 *Klik tombol sekali untuk mengambil role, klik lagi untuk melepas role.*'
      )
      .setColor(0x2B2D31)
      .setFooter({ text: 'Sistem Self-Assignable Roles Otomatis' })
      .setTimestamp();

    const row = new ActionRowBuilder();
    for (const r of ROLE_CONFIG) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(r.id)
          .setLabel(r.label)
          .setEmoji(r.emoji)
          .setStyle(r.style)
      );
    }

    await message.channel.send({ embeds: [embed], components: [row] });
    await message.delete().catch(() => {});
    return;
  }
});

// ==========================================
// 3. INTERAKSI TOMBOL (ROLES & SISTEM TIKET)
// ==========================================
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;

  const guild = interaction.guild;
  const member = interaction.member;

  // ------------------------------------------
  // A. SISTEM BUKA TIKET (ticket_create)
  // ------------------------------------------
  if (interaction.customId === 'ticket_create') {
    const cleanUsername = interaction.user.username.toLowerCase().replace(/[^a-z0-9]/g, '') || interaction.user.id;
    const channelName = `ticket-${cleanUsername}`;

    // Cek apakah member sudah memiliki tiket yang sedang dibuka
    const existingTicket = guild.channels.cache.find(c => c.name === channelName);
    if (existingTicket) {
      return interaction.reply({
        content: `⚠️ Kamu sudah memiliki tiket yang masih aktif di <#${existingTicket.id}>! Harap selesaikan tiket tersebut terlebih dahulu.`,
        ephemeral: true
      });
    }

    // Role Staf/Admin jika ada
    const staffRole = guild.roles.cache.find(r => 
      ['staff', 'admin', 'moderator', 'mod'].includes(r.name.toLowerCase())
    );

    const overwrites = [
      {
        id: guild.roles.everyone.id,
        deny: [PermissionFlagsBits.ViewChannel]
      },
      {
        id: member.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.AttachFiles
        ]
      },
      {
        id: guild.members.me.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ManageChannels,
          PermissionFlagsBits.ReadMessageHistory
        ]
      }
    ];

    if (staffRole) {
      overwrites.push({
        id: staffRole.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.ManageMessages
        ]
      });
    }

    try {
      const channelOptions = {
        name: channelName,
        type: ChannelType.GuildText,
        permissionOverwrites: overwrites,
        reason: `Tiket bantuan untuk ${interaction.user.tag}`
      };

      if (interaction.channel.parent) {
        channelOptions.parent = interaction.channel.parent;
      }

      const ticketChannel = await guild.channels.create(channelOptions);

      const ticketEmbed = new EmbedBuilder()
        .setTitle('🎫 Tiket Bantuan Resmi Staf')
        .setColor(0x5865F2)
        .setDescription(
          `Halo <@${member.id}>! Selamat datang di tiket bantuan privat Anda.\n\n` +
          `Silakan jelaskan kendala, pertanyaan, atau laporan Anda secara rinci (sertakan bukti screenshot/video jika ada).\n\n` +
          `Staf dan moderator kami akan segera menanggapi laporan Anda di sini.\n\n` +
          `📌 *Jika masalah telah selesai, silakan tekan tombol **Tutup Tiket** di bawah.*`
        )
        .setTimestamp();

      const closeRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('ticket_close')
          .setLabel('Tutup Tiket')
          .setEmoji('🔒')
          .setStyle(ButtonStyle.Danger)
      );

      await ticketChannel.send({ content: `<@${member.id}>`, embeds: [ticketEmbed], components: [closeRow] });

      await interaction.reply({
        content: `✅ Tiket bantuan Anda berhasil dibuat: <#${ticketChannel.id}>`,
        ephemeral: true
      });

      // Log ke #admin-logs
      const logEmbed = new EmbedBuilder()
        .setTitle('🎫 Tiket Bantuan Dibuka')
        .setColor(0x57F287)
        .addFields(
          { name: 'Pembuat', value: `${interaction.user.tag} (<@${interaction.user.id}>)`, inline: true },
          { name: 'Channel Tiket', value: `<#${ticketChannel.id}>`, inline: true }
        )
        .setTimestamp();

      await sendAuditLog(guild, logEmbed);
    } catch (err) {
      console.error('Error saat membuat tiket:', err);
      return interaction.reply({
        content: '❌ Gagal membuat channel tiket. Pastikan bot memiliki izin `Manage Channels`.',
        ephemeral: true
      });
    }
    return;
  }

  // ------------------------------------------
  // B. SISTEM TUTUP TIKET (ticket_close)
  // ------------------------------------------
  if (interaction.customId === 'ticket_close') {
    await interaction.reply({
      content: '🔒 Tiket ini akan ditutup dan dihapus dalam **5 detik**...'
    });

    const logEmbed = new EmbedBuilder()
      .setTitle('🔒 Tiket Bantuan Ditutup')
      .setColor(0xED4245)
      .addFields(
        { name: 'Ditutup Oleh', value: `${interaction.user.tag} (<@${interaction.user.id}>)`, inline: true },
        { name: 'Nama Channel', value: interaction.channel.name, inline: true }
      )
      .setTimestamp();

    await sendAuditLog(guild, logEmbed);

    setTimeout(() => {
      interaction.channel.delete().catch(() => {});
    }, 5000);
    return;
  }

  // ------------------------------------------
  // C. TOGGLE AUTO-ROLE MINAT
  // ------------------------------------------
  const targetConfig = ROLE_CONFIG.find(r => r.id === interaction.customId);
  if (!targetConfig) return;

  let role = guild.roles.cache.find(
    r => r.name.toLowerCase() === targetConfig.name.toLowerCase()
  );

  if (!role && guild.members.me.permissions.has(PermissionFlagsBits.ManageRoles)) {
    try {
      role = await guild.roles.create({
        name: targetConfig.name,
        reason: `Auto-create role untuk panel minat (${targetConfig.name})`,
        mentionable: true
      });
    } catch (e) {
      console.error('Gagal membuat role otomatis:', e);
    }
  }

  if (!role) {
    return interaction.reply({
      content: `⚠️ Role **@${targetConfig.name}** belum ada di server ini. Minta Admin untuk membuat role dengan nama \`${targetConfig.name}\`.`,
      ephemeral: true
    });
  }

  const botHighestRole = guild.members.me.roles.highest;
  if (role.position >= botHighestRole.position) {
    return interaction.reply({
      content: `⚠️ Bot tidak dapat mengelola role **${role.name}** karena posisi role bot berada di bawah role tersebut. Silakan geser posisi role bot ke atas di **Server Settings > Roles**.`,
      ephemeral: true
    });
  }

  try {
    if (member.roles.cache.has(role.id)) {
      await member.roles.remove(role);
      return interaction.reply({
        content: `🔴 Role **@${role.name}** berhasil dilepas dari profilmu.`,
        ephemeral: true
      });
    } else {
      await member.roles.add(role);
      return interaction.reply({
        content: `🟢 Role **@${role.name}** berhasil ditambahkan ke profilmu! Sekarang kamu akan menerima notifikasi tag terkait.`,
        ephemeral: true
      });
    }
  } catch (err) {
    console.error('Error saat toggle role:', err);
    return interaction.reply({
      content: '❌ Gagal memperbarui role. Pastikan bot memiliki izin `Manage Roles` dan posisinya di atas role yang ingin diberikan.',
      ephemeral: true
    });
  }
});

// Penanganan error global agar bot tidak crash
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception thrown:', err);
});

// Login Bot menggunakan token dari file .env
client.login(process.env.DISCORD_TOKEN);
