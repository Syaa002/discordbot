require('dotenv').config();
const { 
  Client, 
  GatewayIntentBits, 
  Partials, 
  PermissionFlagsBits, 
  ChannelType,
  AuditLogEvent,
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  EmbedBuilder,
  AttachmentBuilder
} = require('discord.js');
let cron = null;
try {
  cron = require('node-cron');
} catch (e) {
  // node-cron tidak terpasang di host, sistem otomatis beralih ke native timer bawaan Node.js
}
const fs = require('fs');
const path = require('path');

// Inisialisasi Discord Client dengan Intent & Partial lengkap
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessageReactions
  ],
  partials: [
    Partials.Message,
    Partials.Channel,
    Partials.GuildMember,
    Partials.User,
    Partials.Reaction
  ]
});

// Konfigurasi Bot
const PREFIX = process.env.PREFIX || '.';
const LOG_CHANNEL_NAME = (process.env.LOG_CHANNEL_NAME || 'admin-logs').toLowerCase();
const DELETE_LOG_CHANNEL_NAME = (process.env.DELETE_LOG_CHANNEL_NAME || 'delete-message').toLowerCase();
const OWNER_USER_ID = process.env.OWNER_USER_ID || '';

// Penyimpanan Data Sementara di Memori (In-Memory Caches)
const snipes = new Map();
const editSnipes = new Map();
const activeMabars = new Map();
const afkUsers = new Map();

// Helper untuk Mencabut Status AFK & Mengembalikan Nickname
async function removeAfk(member, reasonMessage = null) {
  if (!member || !afkUsers.has(member.id)) return;

  const data = afkUsers.get(member.id);
  afkUsers.delete(member.id);

  // Kembalikan nickname ke nama asli
  if (member.manageable) {
    await member.setNickname(data.originalNickname).catch(() => {});
  }

  const welcomeBack = `👋 Selamat datang kembali, <@${member.id}>! Status AFK kamu telah dicabut.`;
  if (reasonMessage) {
    reasonMessage.reply(welcomeBack)
      .then(msg => setTimeout(() => msg.delete().catch(() => {}), 5000))
      .catch(() => {});
  }
}

// Helper Penyimpanan Berkas JSON
function loadData(filename, defaultVal = {}) {
  const filePath = path.join(__dirname, filename);
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  } catch (err) {
    console.error(`Gagal membaca ${filename}:`, err);
  }
  return defaultVal;
}

function saveData(filename, data) {
  const filePath = path.join(__dirname, filename);
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error(`Gagal menyimpan ${filename}:`, err);
  }
}

// Tempat Menyimpan Daftar Perintah yang Dinonaktifkan (Persistent Set)
const disabledCommands = new Set(loadData('disabled_commands.json', []));

// Rekam Statistik Moderator untuk Evaluasi (.modstats)
function recordModStat(modId, action) {
  if (!modId) return;
  const stats = loadData('modstats.json', {});
  if (!stats[modId]) {
    stats[modId] = { timeout: 0, kick: 0, ban: 0, warn: 0, clear: 0, ticket: 0, softban: 0 };
  }
  stats[modId][action] = (stats[modId][action] || 0) + 1;
  saveData('modstats.json', stats);
}

// Daftar Kata Kasar / SARA (Word Blacklist)
const BLACKLISTED_WORDS = [
  'kontol', 'memek', 'ngentot', 'pantek', 'peler', 'jembut',
  'lonte', 'perek', 'babi', 'anjing', 'bangsat', 'bajingan',
  'tolol', 'goblok', 'idiot'
];

// Helper: Mengirim pesan log umum ke #admin-logs
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

// Helper: Mengirim log khusus pesan dihapus ke #delete-message (fallback ke admin-logs jika belum ada)
async function sendDeleteLog(guild, embed) {
  if (!guild) return;
  try {
    const targetChannel = guild.channels.cache.find(
      c => c.isTextBased() && c.name.toLowerCase() === DELETE_LOG_CHANNEL_NAME
    ) || guild.channels.cache.find(
      c => c.isTextBased() && c.name.toLowerCase() === LOG_CHANNEL_NAME
    );

    if (targetChannel) {
      await targetChannel.send({ embeds: [embed] }).catch(() => {});
    }
  } catch (err) {
    console.error('Error saat mengirim log ke delete-message:', err);
  }
}

// Helper Parser Durasi Waktu
function parseDuration(input) {
  if (!input) return null;
  if (/^\d+$/.test(input)) return parseInt(input, 10) * 60 * 1000;
  const match = input.match(/^(\d+)\s*(s|m|h|d|w)$/i);
  if (!match) return null;
  const val = parseInt(match[1], 10);
  const u = match[2].toLowerCase();
  switch (u) {
    case 's': return val * 1000;
    case 'm': return val * 60 * 1000;
    case 'h': return val * 60 * 60 * 1000;
    case 'd': return val * 24 * 60 * 60 * 1000;
    case 'w': return val * 7 * 24 * 60 * 60 * 1000;
    default: return null;
  }
}

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

function detectBadWord(text) {
  const lower = text.toLowerCase();
  for (const word of BLACKLISTED_WORDS) {
    const regex = new RegExp(`(^|\\s|[^a-zA-Z0-9])${word}($|\\s|[^a-zA-Z0-9])`, 'i');
    if (regex.test(lower)) return word;
  }
  return null;
}

function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Generator Berkas Transkrip Teks Bersih (Bisa dibuka langsung di HP & PC via Discord Viewer)
function generateTextTranscript(channelName, guildName, messages, closedByTag, ownerDisplay) {
  let text = `=====================================================\n`;
  text += `TRANSKRIP TIKET: #${channelName}\n`;
  text += `Server: ${guildName}\n`;
  text += `Pembuat Tiket: ${ownerDisplay}\n`;
  text += `Ditutup Oleh: ${closedByTag}\n`;
  text += `Waktu Selesai: ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB\n`;
  text += `Total Pesan: ${messages.length} pesan\n`;
  text += `=====================================================\n\n`;

  for (const msg of messages) {
    const time = new Date(msg.createdTimestamp).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
    const author = msg.author?.tag || 'Pengguna';
    const content = msg.content || '';
    let attachments = '';
    if (msg.attachments && msg.attachments.size > 0) {
      attachments = ' [Lampiran: ' + msg.attachments.map(a => a.url).join(', ') + ']';
    }
    text += `[${time}] ${author}:\n${content || '[Hanya berkas/lampiran]'}${attachments}\n\n`;
  }

  text += `=====================================================\n`;
  text += `Akhir dari transkrip obrolan tiket.\n`;
  return text;
}

// Generator Berkas Transkrip HTML Modern (Format Discord Dark Theme)
function generateHtmlTranscript(channelName, guildName, messages, closedByTag, ownerMention) {
  const messageRows = messages.map(msg => {
    const timeStr = new Date(msg.createdTimestamp).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
    const authorName = escapeHtml(msg.author?.tag || 'Pengguna Tidak Dikenal');
    const authorAvatar = msg.author ? msg.author.displayAvatarURL({ extension: 'png', size: 64 }) : 'https://cdn.discordapp.com/embed/avatars/0.png';
    const content = escapeHtml(msg.content || '');
    
    let attachmentsHtml = '';
    if (msg.attachments && msg.attachments.size > 0) {
      attachmentsHtml = '<div class="attachments">' + msg.attachments.map(att => {
        const isImage = /\.(png|jpe?g|gif|webp)$/i.test(att.name || '');
        if (isImage) {
          return `<div class="attachment"><a href="${att.url}" target="_blank"><img src="${att.url}" alt="${escapeHtml(att.name)}" style="max-width: 320px; max-height: 240px; border-radius: 6px; margin-top: 6px;" /></a></div>`;
        }
        return `<div class="attachment"><a href="${att.url}" target="_blank" style="color: #00a8fc; text-decoration: underline;">📎 ${escapeHtml(att.name || 'Berkas Lampiran')}</a></div>`;
      }).join('') + '</div>';
    }

    return `
      <div class="message">
        <img class="avatar" src="${authorAvatar}" alt="avatar" />
        <div class="content-wrapper">
          <div class="header">
            <span class="author">${authorName}</span>
            <span class="timestamp">${timeStr}</span>
          </div>
          <div class="text">${content ? content.replace(/\n/g, '<br>') : '<em>[Tidak ada teks / lampiran]</em>'}</div>
          ${attachmentsHtml}
        </div>
      </div>
    `;
  }).join('');

  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <title>Transkrip Tiket - ${escapeHtml(channelName)}</title>
  <style>
    body {
      background-color: #313338;
      color: #dbdee1;
      font-family: 'gg sans', 'Whitney', 'Helvetica Neue', Helvetica, Arial, sans-serif;
      margin: 0;
      padding: 20px;
    }
    .container {
      max-width: 900px;
      margin: 0 auto;
      background-color: #2b2d31;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 4px 12px rgba(0,0,0,0.4);
    }
    .header-panel {
      background-color: #1e1f22;
      padding: 16px 20px;
      border-bottom: 2px solid #232428;
    }
    .header-panel h1 {
      margin: 0 0 6px 0;
      font-size: 20px;
      color: #f2f3f5;
    }
    .header-panel p {
      margin: 3px 0;
      font-size: 13px;
      color: #949ba4;
    }
    .messages-list {
      padding: 16px 20px;
    }
    .message {
      display: flex;
      gap: 14px;
      margin-bottom: 14px;
      padding-bottom: 10px;
      border-bottom: 1px solid rgba(255,255,255,0.04);
    }
    .avatar {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      flex-shrink: 0;
      background-color: #383a40;
    }
    .content-wrapper {
      flex: 1;
    }
    .header {
      margin-bottom: 4px;
    }
    .author {
      font-weight: 600;
      color: #f2f3f5;
      font-size: 14px;
      margin-right: 8px;
    }
    .timestamp {
      font-size: 11px;
      color: #949ba4;
    }
    .text {
      font-size: 14px;
      line-height: 1.4;
      color: #dbdee1;
      word-break: break-word;
    }
    .footer {
      background-color: #1e1f22;
      padding: 12px 20px;
      text-align: center;
      font-size: 12px;
      color: #949ba4;
      border-top: 1px solid #232428;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header-panel">
      <h1>📑 Transkrip Obrolan Tiket: #${escapeHtml(channelName)}</h1>
      <p><strong>Server:</strong> ${escapeHtml(guildName)}</p>
      <p><strong>Pembuat Tiket:</strong> ${escapeHtml(ownerMention)}</p>
      <p><strong>Ditutup Oleh:</strong> ${escapeHtml(closedByTag)}</p>
      <p><strong>Total Pesan:</strong> ${messages.length} pesan</p>
      <p><strong>Waktu Penutupan:</strong> ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB</p>
    </div>
    <div class="messages-list">
      ${messageRows || '<p style="color: #949ba4;">Tidak ada pesan yang dicatat di tiket ini.</p>'}
    </div>
    <div class="footer">
      Transkrip otomatis dibuat oleh Ambanime Official Bot • Sistem Manajemen Tiket Komunitas
    </div>
  </div>
</body>
</html>`;
}

// ==========================================
// EVENT: BOT SIAP & ONLINE
// ==========================================
client.once('ready', async () => {
  console.log(`========================================`);
  console.log(`✅ Bot berhasil online sebagai: ${client.user.tag}`);
  console.log(`⚙️ Prefix perintah: ${PREFIX} (juga mendukung !)`);
  console.log(`📋 Channel log umum: #${LOG_CHANNEL_NAME}`);
  console.log(`🗑️ Channel log pesan terhapus: #${DELETE_LOG_CHANNEL_NAME}`);
  console.log(`🚀 Seluruh Kategori Fitur Staf & Komunitas: AKTIF`);
  console.log(`========================================`);

  // Pre-fetch pesan terakhir dari setiap text channel agar tersimpan di cache Discord.js
  for (const [, guild] of client.guilds.cache) {
    try {
      const textChannels = guild.channels.cache.filter(
        c => c.isTextBased() && c.type === ChannelType.GuildText
      );
      for (const [, ch] of textChannels) {
        ch.messages.fetch({ limit: 50 }).catch(() => {});
      }
    } catch (e) {
      console.error('Gagal pre-cache messages:', e);
    }
  }

  // ==========================================
  // JADWAL PENGINGAT RENEW KE DM PRIBADI OWNER (Setiap Hari Pukul 12:00 WIB)
  // ==========================================
  async function sendRenewNotification(source = 'Otomatis') {
    try {
      let targetUser = null;

      // 1. Ambil akun berdasarkan OWNER_USER_ID jika dikonfigurasi
      const cleanOwnerId = (OWNER_USER_ID || '').trim().replace(/['"]/g, '');
      if (cleanOwnerId && cleanOwnerId.length > 10 && cleanOwnerId !== 'MASUKKAN_ID_DISCORD_ANDA_DI_SINI') {
        targetUser = await client.users.fetch(cleanOwnerId).catch(() => null);
      }

      // 2. Fallback otomatis ke Server Owner jika OWNER_USER_ID belum diisi / tidak valid
      if (!targetUser) {
        for (const [, guild] of client.guilds.cache) {
          try {
            const guildOwner = await guild.fetchOwner();
            if (guildOwner?.user) {
              targetUser = guildOwner.user;
              break;
            }
          } catch (e) {}
        }
      }

      if (!targetUser) {
        console.warn('[Renew Reminder] Akun Owner tidak ditemukan.');
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle('⏰ PENGINGAT PRIBADI: RENEW BOT-HOSTING')
        .setDescription(
          `Halo **${targetUser.username}**!\n\n` +
          'Ini adalah pengingat harian untuk mengecek sisa masa aktif server bot di **Bot-Hosting.net**.\n\n' +
          '⚠️ **Server gratis wajib di-renew setiap 4 hari sekali.**\n' +
          'Segera buka dashboard dan klik tombol **Renew / Extend** agar bot tetap menyala.'
        )
        .setColor(0xFEE75C)
        .addFields(
          { name: '🌐 Link Dashboard', value: '[Buka Bot-Hosting.net](https://bot-hosting.net)' }
        )
        .setFooter({ text: `Notifikasi ${source} • Ambanime Bot` })
        .setTimestamp();

      await targetUser.send({ embeds: [embed] });
      console.log(`[Renew Reminder] Notifikasi (${source}) berhasil dikirim ke DM: ${targetUser.tag}`);
    } catch (err) {
      console.error('Gagal mengirim DM pengingat renew ke Owner:', err);
    }
  }

  // Penjadwalan: Jika library cron ada gunakan cron, jika tidak ada gunakan timer internal Node.js
  if (cron) {
    cron.schedule('0 12 * * *', () => sendRenewNotification('Harian (Cron)'), {
      timezone: "Asia/Jakarta"
    });
    console.log('⏰ Penjadwal Renew: Menggunakan node-cron (Setiap 12:00 WIB)');
  } else {
    let lastNotifiedDay = -1;
    setInterval(() => {
      const now = new Date();
      const currentDay = now.getUTCDate();
      const utcHours = now.getUTCHours();
      const utcMinutes = now.getUTCMinutes();

      // 12:00 WIB = 05:00 UTC
      if (utcHours === 5 && utcMinutes === 0 && lastNotifiedDay !== currentDay) {
        lastNotifiedDay = currentDay;
        sendRenewNotification('Harian (Native Timer)');
      }
    }, 60 * 1000);
    console.log('⏰ Penjadwal Renew: Menggunakan timer native Node.js (Setiap 12:00 WIB)');
  }
});

// ==========================================
// 1. SISTEM LOGGING (AUDIT TRAIL) & ANTI-GHOSTPING
// ==========================================

// Log: Pesan Dihapus -> Dikirim ke #delete-message + Deteksi Ghost Ping
client.on('messageDelete', async (message) => {
  if (!message.guild) return;
  if (message.author?.bot) return;

  // Simpan data pesan terakhir untuk perintah .snipe jika author diketahui
  if (message.author) {
    snipes.set(message.channel.id, {
      content: message.content || '',
      author: message.author,
      attachments: message.attachments ? message.attachments.map(a => a.url) : [],
      timestamp: Date.now()
    });
  }

  // Fitur Deteksi Ghost Ping Otomatis
  if (message.author && message.mentions && message.mentions.users.size > 0) {
    const validMentions = message.mentions.users.filter(u => u.id !== message.author.id && !u.bot);
    if (validMentions.size > 0) {
      const mentionList = validMentions.map(u => `<@${u.id}>`).join(', ');
      const ghostEmbed = new EmbedBuilder()
        .setTitle('👻 Deteksi Ghost Ping!')
        .setColor(0xED4245)
        .setDescription(`**${message.author.tag}** (<@${message.author.id}>) me-mention member lalu langsung menghapus pesannya!`)
        .addFields(
          { name: 'Member yang di-tag', value: mentionList, inline: true },
          { name: 'Channel', value: `${message.channel}`, inline: true },
          { name: 'Isi Pesan Terhapus', value: message.content || '*[Hanya media/kosong]*' }
        )
        .setTimestamp();

      await message.channel.send({ embeds: [ghostEmbed] }).catch(() => {});
      await sendAuditLog(message.guild, ghostEmbed);
    }
  }

  // Cek Audit Log jika pesan dihapus oleh Moderator
  let deleter = null;
  let auditAuthor = null;
  try {
    if (message.guild.members.me?.permissions.has(PermissionFlagsBits.ViewAuditLog)) {
      const fetchedLogs = await message.guild.fetchAuditLogs({
        limit: 1,
        type: AuditLogEvent.MessageDelete
      }).catch(() => null);

      if (fetchedLogs) {
        const logEntry = fetchedLogs.entries.first();
        if (logEntry && (Date.now() - logEntry.createdTimestamp < 4000)) {
          if (logEntry.extra?.channel?.id === message.channel.id) {
            if (logEntry.executor && logEntry.executor.id !== message.author?.id) {
              deleter = `${logEntry.executor.tag} (<@${logEntry.executor.id}>)`;
            }
            if (logEntry.target) {
              auditAuthor = `${logEntry.target.tag} (<@${logEntry.target.id}>)`;
            }
          }
        }
      }
    }
  } catch (err) {}

  let authorDisplay = message.author 
    ? `${message.author.tag} (<@${message.author.id}>)` 
    : (auditAuthor || '*Tidak diketahui (Pesan lama sebelum bot aktif)*');

  let content = message.content 
    ? (message.content.length > 1024 ? message.content.substring(0, 1020) + '...' : message.content)
    : null;

  if (!content) {
    if (message.attachments && message.attachments.size > 0) {
      content = '*[Pesan berupa gambar / lampiran berkas]*';
    } else {
      content = '*[Pesan dikirim sebelum bot aktif sehingga tidak ada teks di cache]*';
    }
  }

  const embed = new EmbedBuilder()
    .setTitle('🗑️ Pesan Dihapus')
    .setColor(0xED4245)
    .addFields(
      { name: 'Pengirim', value: authorDisplay, inline: true },
      { name: 'Channel', value: `${message.channel}`, inline: true }
    );

  if (deleter) {
    embed.addFields({ name: 'Dihapus Oleh (Mod)', value: deleter, inline: true });
  }

  embed.addFields({ name: 'Isi Pesan', value: content });

  if (message.attachments && message.attachments.size > 0) {
    const attachmentNames = message.attachments.map(a => a.name || 'File').join(', ');
    embed.addFields({ name: '📎 Lampiran', value: attachmentNames.substring(0, 1024) });
  }

  embed.setTimestamp();

  // Kirim log khusus ke #delete-message (fallback ke #admin-logs)
  await sendDeleteLog(message.guild, embed);
});

// Log: Pesan Diedit -> Dikirim ke #admin-logs + Simpan untuk .editsnipe
client.on('messageUpdate', async (oldMessage, newMessage) => {
  if (!newMessage.guild || newMessage.author?.bot) return;
  if (oldMessage.content === newMessage.content) return;

  // Simpan data edit untuk perintah .editsnipe
  editSnipes.set(newMessage.channel.id, {
    oldContent: oldMessage.content || '*[Pesan lama tidak tersimpan di cache]*',
    newContent: newMessage.content || '*[Pesan kosong]*',
    author: newMessage.author,
    timestamp: Date.now(),
    url: newMessage.url
  });

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

// Log: Member Baru Bergabung -> Dikirim ke #admin-logs
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

// Log: Member Keluar / Dikeluarkan -> Dikirim ke #admin-logs
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
// EVENT: DETEKSI JOIN VOICE (CABUT STATUS AFK OTOMATIS)
// ==========================================
client.on('voiceStateUpdate', async (oldState, newState) => {
  try {
    // Cek jika user baru saja masuk ke voice channel (bukan keluar atau sekadar mute)
    if (!oldState.channelId && newState.channelId) {
      const member = newState.member;
      if (member && afkUsers.has(member.id)) {
        await removeAfk(member);
        
        // Kirim notifikasi singkat di text channel voice tersebut jika ada
        if (newState.channel && newState.channel.isTextBased()) {
          newState.channel.send(`👋 Selamat datang kembali di voice, <@${member.id}>! Status AFK telah dicabut.`)
            .then(msg => setTimeout(() => msg.delete().catch(() => {}), 5000))
            .catch(() => {});
        }
      }
    }
  } catch (err) {
    console.error('Error di voiceStateUpdate AFK:', err);
  }
});

// ==========================================
// 2. MODERASI, AFK & PERINTAH BOT LENGKAP
// ==========================================
client.on('messageCreate', async (message) => {
  try {
    if (!message.guild || message.author.bot) return;

    const content = message.content;
    const member = message.member || await message.guild.members.fetch(message.author.id).catch(() => null);
    if (!member) return;

    // ------------------------------------------
    // SISTEM AFK (Auto-Responder & Auto-Remove)
    // ------------------------------------------
    // 1. Jika user yang sedang AFK mengirim chat (bukan command .afk atau !afk), cabut status AFK-nya
    if (afkUsers.has(message.author.id) && !content.toLowerCase().startsWith('.afk') && !content.toLowerCase().startsWith('!afk')) {
      await removeAfk(member, message);
      return;
    }

    // 2. Cek apakah ada user AFK yang di-mention oleh orang lain
    if (message.mentions && message.mentions.members && message.mentions.members.size > 0) {
      message.mentions.members.forEach((mentionedMember) => {
        if (afkUsers.has(mentionedMember.id) && mentionedMember.id !== message.author.id) {
          const afkData = afkUsers.get(mentionedMember.id);
          message.reply(`💤 **${mentionedMember.displayName}** sedang AFK: *${afkData.reason}* (<t:${Math.floor(afkData.time / 1000)}:R>)`).catch(() => {});
        }
      });
    }

    const isStaff = member.permissions.has(PermissionFlagsBits.ManageMessages) ||
                    member.permissions.has(PermissionFlagsBits.Administrator);

    // ------------------------------------------
    // AUTO-MOD: ANTI-INVITE & ANTI-PHISHING
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
    // AUTO-MOD: ANTI-SPAM MENTION
    // ------------------------------------------
    if (!isStaff) {
      const hasEveryoneTag = !member.permissions.has(PermissionFlagsBits.MentionEveryone) &&
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
    // AUTO-MOD: ANTI-CAPSLOCK BERLEBIHAN
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
    // AUTO-MOD: WORD BLACKLIST (KATA KASAR/SARA)
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

    // ------------------------------------------
    // PENGECEKAN PREFIX PERINTAH (. ATAU !)
    // ------------------------------------------
    let usedPrefix = null;
    if (content.startsWith(PREFIX)) {
      usedPrefix = PREFIX;
    } else if (content.startsWith('.')) {
      usedPrefix = '.';
    } else if (content.startsWith('!')) {
      usedPrefix = '!';
    }

    if (!usedPrefix) return;

    const args = content.slice(usedPrefix.length).trim().split(/\s+/);
    const command = args.shift().toLowerCase();

    // ==========================================
    // COMMAND KONTROL: .disable & .enable (Khusus Administrator)
    // ==========================================

    // 1. Matikan Perintah: .disable <nama_command>
    if (command === 'disable') {
      if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
        return message.reply('❌ Hanya Administrator yang dapat menonaktifkan perintah.');
      }

      const targetCmd = args[0]?.toLowerCase().replace(/^[.!\/]/, '');
      if (!targetCmd) {
        return message.reply(`Sebutkan nama perintah yang ingin dimatikan. Contoh: \`${PREFIX}disable preset\``);
      }

      // Hindari mematikan perintah kontrol itu sendiri
      if (['disable', 'enable', 'help'].includes(targetCmd)) {
        return message.reply('⚠️ Perintah `.disable`, `.enable`, dan `.help` tidak boleh dinonaktifkan.');
      }

      if (disabledCommands.has(targetCmd)) {
        return message.reply(`Perintah \`.${targetCmd}\` memang sudah dinonaktifkan sebelumnya.`);
      }

      disabledCommands.add(targetCmd);
      saveData('disabled_commands.json', Array.from(disabledCommands));
      return message.reply(`🚫 Perintah \`.${targetCmd}\` berhasil **dinonaktifkan** sementara.`);
    }

    // 2. Aktifkan Kembali Perintah: .enable <nama_command>
    if (command === 'enable') {
      if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
        return message.reply('❌ Hanya Administrator yang dapat mengaktifkan perintah.');
      }

      const targetCmd = args[0]?.toLowerCase().replace(/^[.!\/]/, '');
      if (!targetCmd) {
        return message.reply(`Sebutkan nama perintah yang ingin diaktifkan. Contoh: \`${PREFIX}enable preset\``);
      }

      if (!disabledCommands.has(targetCmd)) {
        return message.reply(`Perintah \`.${targetCmd}\` sedang aktif dan tidak dalam kondisi nonaktif.`);
      }

      disabledCommands.delete(targetCmd);
      saveData('disabled_commands.json', Array.from(disabledCommands));
      return message.reply(`✅ Perintah \`.${targetCmd}\` berhasil **diaktifkan kembali**.`);
    }

    // ==========================================
    // PERINTAH: .cekrenew (Tautan Perpanjangan Bot-Hosting)
    // ==========================================
    if (command === 'cekrenew') {
      const embed = new EmbedBuilder()
        .setTitle('🔗 Tautan Perpanjangan Bot-Hosting')
        .setDescription(
          'Pastikan untuk selalu memperpanjang masa aktif server sebelum timer 4 hari habis:\n\n' +
          '👉 [Buka Panel Bot-Hosting](https://bot-hosting.net)\n\n' +
          '*Tips: Masuk ke menu dashboard, pilih proyek Ambanime, lalu klik tombol **Renew / Extend**.*'
        )
        .setColor(0x5865F2)
        .setFooter({ text: 'Ambanime Bot • Bot-Hosting Reminder' })
        .setTimestamp();

      return message.reply({ embeds: [embed] });
    }

    // ==========================================
    // SECRET COMMAND: .testdm (Uji Coba Kirim DM Pengingat)
    // Perintah rahasia: Tidak dicatat di menu .help
    // ==========================================
    if (command === 'testdm') {
      const cleanOwnerId = (OWNER_USER_ID || '').trim().replace(/['"]/g, '');
      const isOwnerMatch = cleanOwnerId && cleanOwnerId === message.author.id;
      const isServerOwner = message.guild?.ownerId === message.author.id;
      const isStaffMember = member.permissions.has(PermissionFlagsBits.Administrator) ||
                            member.permissions.has(PermissionFlagsBits.ManageGuild) ||
                            member.permissions.has(PermissionFlagsBits.ManageMessages);

      // Hanya izinkan Owner terdaftar, Pemilik Server, atau Staf Pengurus
      if (!isOwnerMatch && !isServerOwner && !isStaffMember) {
        return; // Member biasa diabaikan agar tetap rahasia
      }

      try {
        const embedTest = new EmbedBuilder()
          .setTitle('🧪 UJI COBA: PENGINGAT RENEW BOT-HOSTING')
          .setDescription(
            `Halo **${message.author.username}**!\n\n` +
            'Ini adalah pesan uji coba manual untuk memastikan sistem pengiriman Direct Message (DM) bot bekerja normal.\n\n' +
            '⚠️ **Server gratis Bot-Hosting wajib di-renew setiap 4 hari sekali.**\n\n' +
            `🆔 **ID Akun Discord Anda:** \`${message.author.id}\``
          )
          .setColor(0x57F287) // Warna hijau tanda sukses
          .addFields(
            { name: '🌐 Link Dashboard', value: '[Buka Bot-Hosting.net](https://bot-hosting.net)' }
          )
          .setFooter({ text: 'Status Uji Coba: Berhasil • Ambanime Bot' })
          .setTimestamp();

        // Kirim DM langsung ke pengirim perintah
        await message.author.send({ embeds: [embedTest] });

        await message.react('✅').catch(() => {});
        const info = await message.reply(`📨 Pesan uji coba DM berhasil dikirim ke chat pribadi Anda! *(ID Akun Anda: \`${message.author.id}\`)*`);
        setTimeout(() => info.delete().catch(() => {}), 6000);

      } catch (err) {
        console.error('Gagal mengirim testdm ke user:', err);
        return message.reply('❌ Gagal mengirim DM! Pastikan opsi privasi akun Anda mengizinkan *Direct Messages from server members* (User Settings > Privacy & Safety).');
      }
      return;
    }

    // ==========================================
    // PENGECEKAN BLOKIR (GATEKEEPER)
    // ==========================================
    // Jika command yang diketik ada di daftar disabled, batalkan eksekusi
    if (disabledCommands.has(command)) {
      return message.reply(`⚠️ Perintah \`.${command}\` sedang dinonaktifkan sementara oleh administrator server.`);
    }

    // ------------------------------------------
    // PERINTAH: help [mod]
    // ------------------------------------------
    if (command === 'help') {
      const isModHelp = args[0]?.toLowerCase() === 'mod';

      if (isModHelp) {
        const modEmbed = new EmbedBuilder()
          .setTitle('🛡️ Panel Panduan Terpadu Staf & Moderator (Ambanime Bot)')
          .setColor(0xED4245)
          .setDescription(`Panduan referensi cepat seluruh wewenang & utilitas internal staf (Prefix: \`${PREFIX}\`):`)
          .addFields(
            {
              name: '🧹 1. Pembersihan Pesan (Chat Control)',
              value:
                `\`${PREFIX}delete [1-100]\` / \`${PREFIX}clear\` / \`${PREFIX}purge\` : Hapus pesan massal sekaligus di channel ini (Contoh: \`${PREFIX}delete 20\`).\n` +
                `\`${PREFIX}slowmode [detik]\` : Atur jeda kirim pesan channel (Contoh: \`${PREFIX}slowmode 5\` | \`${PREFIX}slowmode 0\` untuk off).`
            },
            {
              name: '🔍 2. Investigasi Pesan & Anti-Spam',
              value:
                `\`${PREFIX}snipe\` : Munculkan kembali pesan terakhir yang baru saja terhapus.\n` +
                `\`${PREFIX}editsnipe\` : Munculkan teks asli pesan sebelum diedit pengirimnya.\n` +
                `\`${PREFIX}checkalt [hari]\` : Pindai akun tuyul/mencurigakan berumur kurang dari N hari (default 7 hari).\n` +
                `*Anti-Ghostping aktif otomatis membongkar yang tag lalu hapus pesan.*`
            },
            {
              name: '⚖️ 3. Tindakan Disiplin Member',
              value:
                `\`${PREFIX}warn @user [alasan]\` : Tambah teguran (3x warn = timeout 1 jam, 5x warn = kick).\n` +
                `\`${PREFIX}checkwarn @user\` : Cek total peringatan & riwayat teguran member.\n` +
                `\`${PREFIX}clearwarn @user\` : Reset/hapus seluruh poin teguran member.\n` +
                `\`${PREFIX}timeout @user [waktu] [alasan]\` : Bisukan member (Contoh: \`${PREFIX}timeout @user 10m Spam\`).\n` +
                `\`${PREFIX}untimeout @user\` : Cabut status timeout member.\n` +
                `\`${PREFIX}softban @user [alasan]\` : Bersihkan riwayat chat 24 jam member lalu kick dari server.\n` +
                `\`${PREFIX}kick @user [alasan]\` : Keluarkan member dari server.\n` +
                `\`${PREFIX}ban @user [alasan]\` / \`${PREFIX}unban [id]\` : Ban / unban member.`
            },
            {
              name: '🚨 4. Panel Taktis & Ruang Sidang (Jail)',
              value:
                `\`${PREFIX}modpanel @user\` : Buka kartu aksi cepat tombol interaktif (Mute 10m, Warn, Kick, Ban).\n` +
                `\`${PREFIX}jail @user [alasan]\` : Cabut seluruh role & karantina member ke #ruang-sidang.\n` +
                `\`${PREFIX}unjail @user\` : Kembalikan seluruh role asli member setelah sidang usai.`
            },
            {
              name: '🎙️ 5. Manajemen Voice Staf & Ruang Tunggu',
              value:
                `\`${PREFIX}vckick @user\` : Putus koneksi (disconnect) paksa member dari voice.\n` +
                `\`${PREFIX}vcmute @user\` / \`${PREFIX}vcunmute @user\` : Server-mute / unmute mic member di voice.\n` +
                `\`${PREFIX}vcmove @user [nama/id channel]\` : Pindahkan member antar ruang suara.\n` +
                `\`${PREFIX}next\` : Tarik otomatis member antrean paling atas dari Ruang Tunggu ke AdminVoice.`
            },
            {
              name: '🚪 6. Gerbang Server & Layanan Tiket',
              value:
                `\`${PREFIX}setupticket\` : Buat panel tombol buka tiket bantuan staf di channel ini.\n` +
                `\`${PREFIX}setupverify\` : Buat panel tombol verifikasi rules (Role CLUB).\n` +
                `\`${PREFIX}lockdown\` / \`${PREFIX}unlockdown\` : Kunci / buka seluruh channel saat serangan raid darurat.\n` +
                `\`${PREFIX}lock\` / \`${PREFIX}unlock\` : Kunci / buka channel obrolan saat ini.\n` +
                `\`${PREFIX}syncperms [#channel]\` : Sinkronisasi izin channel ke kategori induknya.`
            },
            {
              name: '📢 7. Komunikasi & Evaluasi Staf',
              value:
                `\`${PREFIX}say [pesan]\` : Kirim pesan pengumuman atas nama bot di channel ini.\n` +
                `\`${PREFIX}dm @user [pesan]\` : Kirim teguran privat resmi via DM bot tanpa gaduh di publik.\n` +
                `\`${PREFIX}modstats [@user]\` : Rekap statistik keaktifan moderasi untuk evaluasi OWNER (KING'S).`
            },
            {
              name: '⚙️ 8. Kontrol Sistem Bot (Maintenance)',
              value:
                `\`${PREFIX}cekrenew\` : Cek status & tautan perpanjangan masa aktif server Bot-Hosting.\n` +
                `\`${PREFIX}disable <command>\` : Matikan perintah sementara (Contoh: \`${PREFIX}disable preset\`).\n` +
                `\`${PREFIX}enable <command>\` : Aktifkan kembali perintah yang dimatikan.`
            }
          )
          .setFooter({ text: 'Gunakan wewenang staf dengan bijak.' })
          .setTimestamp();

        return message.channel.send({ embeds: [modEmbed] }).catch(() => {});
      }

      const helpEmbed = new EmbedBuilder()
        .setTitle('🌟 Panduan Perintah Komunitas — AMBANIME BOT')
        .setColor(0x5865F2)
        .setDescription(`Gunakan prefix \`${PREFIX}\` sebelum mengetik perintah. Berikut daftar kategori perintah:`)
        .addFields(
          {
            name: '🎮 1. Gaming & Mabar',
            value:
              `\`${PREFIX}mabar [Game] [Slot]\` : Buat ajakan mabar interaktif dengan tombol join (Contoh: \`${PREFIX}mabar MLBB 5\`).\n` +
              `\`${PREFIX}afk [alasan]\` : Pasang status AFK & auto-ubah nickname. Auto-cabut saat chat/masuk voice.`
          },
          {
            name: '💬 2. Utilitas Chat & Pesan',
            value:
              `\`${PREFIX}snipe\` : Menampilkan pesan yang baru saja terhapus di channel ini.\n` +
              `\`${PREFIX}editsnipe\` : Menampilkan isi teks asli dari pesan sebelum diedit.`
          },
          {
            name: '⭐ 3. Reputasi & Apresiasi Anggota',
            value:
              `\`${PREFIX}rep @user [alasan]\` : Berikan +1 poin respect/reputasi ke member lain yang membantu.\n` +
              `\`${PREFIX}checkrep [@user]\` : Cek total poin reputasi kamu atau member lain.`
          },
          {
            name: '🎨 4. Konten Kreator & Editor AMV',
            value:
              `\`${PREFIX}preset\` / \`${PREFIX}assets\` : Dapatkan link resmi kumpulan font, SFX, dan preset video.\n` +
              `\`${PREFIX}rate\` : Buat thread polling rating untuk karya AMV / desain grafis kamu.`
          },
          {
            name: '🛡️ 5. Menu Terpadu Staf & Moderator',
            value:
              `Ketik **\`${PREFIX}help mod\`** untuk membuka seluruh 8 kategori perintah staf (ModPanel, Setup Ticket, Clear, Jail, Softban, Voice Control, Alt Detection, dll).`
          }
        )
        .setFooter({ text: 'Ambanime Official Bot' })
        .setTimestamp();

      return message.channel.send({ embeds: [helpEmbed] }).catch(() => {});
    }

    // ==========================================
    // KATEGORI 1: GERBANG SERVER & VERIFIKASI
    // ==========================================

    // .setupverify (Gatekeeper Panel)
    if (command === 'setupverify') {
      if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
        return message.reply('❌ Hanya Administrator yang dapat memunculkan panel verifikasi.');
      }

      const verifyEmbed = new EmbedBuilder()
        .setTitle('🃏 VERIFIKASI MEMBER AMBANIME (ROLE CLUB)')
        .setColor(0x2B2D31)
        .setDescription(
          'Selamat datang di server resmi **AMBANIME**!\n\n' +
          'Sebelum dapat mengakses seluruh channel obrolan, mabar, dan media di kategori **COMMUNITY**, Anda diwajibkan untuk menyetujui seluruh aturan server kami di channel rules.\n\n' +
          'Silakan klik tombol **Verifikasi (Ambil Role CLUB)** di bawah ini untuk membuka seluruh channel server secara otomatis! 🎉'
        )
        .setFooter({ text: 'Sistem Verifikasi Otomatis Gerbang Server' })
        .setTimestamp();

      const verifyRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('verify_member')
          .setLabel('Verifikasi (Ambil Role CLUB)')
          .setEmoji('♧')
          .setStyle(ButtonStyle.Success)
      );

      await message.channel.send({ embeds: [verifyEmbed], components: [verifyRow] }).catch(() => {});
      await message.delete().catch(() => {});
      return;
    }

    // .lockdown & .unlockdown (Kunci Darurat Server saat Raid)
    if (command === 'lockdown') {
      if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
        return message.reply('❌ Hanya Administrator yang dapat mengaktifkan Lockdown server.');
      }

      const statusMsg = await message.channel.send('🚨 **MEMULAI LOCKDOWN DARURAT SERVER...** Mengunci seluruh channel obrolan...');
      let lockedCount = 0;

      const channels = message.guild.channels.cache.filter(c => c.isTextBased() && c.type === ChannelType.GuildText);
      for (const [, ch] of channels) {
        await ch.permissionOverwrites.edit(message.guild.roles.everyone, {
          SendMessages: false
        }).catch(() => {});
        lockedCount++;
      }

      const lockEmbed = new EmbedBuilder()
        .setTitle('🚨 SERVER LOCKDOWN DIAKTIFKAN!')
        .setColor(0xED4245)
        .setDescription(
          `Seluruh channel obrolan (${lockedCount} channel) telah dikunci oleh <@${message.author.id}> untuk mengamankan server dari keributan/raid darurat.\n\n` +
          `Member biasa sementara waktu tidak dapat mengirim pesan sampai status lockdown dicabut oleh staf.`
        )
        .setTimestamp();

      await statusMsg.edit({ content: null, embeds: [lockEmbed] });
      await sendAuditLog(message.guild, lockEmbed);
      recordModStat(message.author.id, 'clear');
      return;
    }

    if (command === 'unlockdown') {
      if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
        return message.reply('❌ Hanya Administrator yang dapat mencabut Lockdown server.');
      }

      const statusMsg = await message.channel.send('🔓 **MENCABUT LOCKDOWN SERVER...** Membuka kembali channel obrolan...');
      let unlockedCount = 0;

      const channels = message.guild.channels.cache.filter(c => c.isTextBased() && c.type === ChannelType.GuildText);
      for (const [, ch] of channels) {
        await ch.permissionOverwrites.edit(message.guild.roles.everyone, {
          SendMessages: null
        }).catch(() => {});
        unlockedCount++;
      }

      const unlockEmbed = new EmbedBuilder()
        .setTitle('🔓 SERVER LOCKDOWN DICABUT')
        .setColor(0x57F287)
        .setDescription(`Status lockdown telah resmi dicabut oleh <@${message.author.id}>. Seluruh member dipersilakan mengobrol kembali seperti biasa.`)
        .setTimestamp();

      await statusMsg.edit({ content: null, embeds: [unlockEmbed] });
      await sendAuditLog(message.guild, unlockEmbed);
      return;
    }

    // .syncperms [#channel] (Sinkronkan izin channel ke kategori)
    if (command === 'syncperms') {
      if (!member.permissions.has(PermissionFlagsBits.ManageChannels)) {
        return message.reply('❌ Kamu tidak memiliki izin `Manage Channels`.');
      }

      const targetChannel = message.mentions.channels.first() || message.channel;
      if (!targetChannel.parent) {
        return message.reply(`⚠️ Channel <#${targetChannel.id}> tidak berada di dalam kategori apapun sehingga tidak dapat disinkronkan.`);
      }

      try {
        await targetChannel.lockPermissions();
        const embed = new EmbedBuilder()
          .setTitle('🔄 Izin Channel Disinkronkan')
          .setColor(0x57F287)
          .setDescription(`Izin untuk channel <#${targetChannel.id}> berhasil disinkronkan dengan kategori induknya (**${targetChannel.parent.name}**).`)
          .setFooter({ text: `Oleh: ${message.author.tag}` })
          .setTimestamp();

        await message.channel.send({ embeds: [embed] });
        await sendAuditLog(message.guild, embed);
      } catch (err) {
        console.error(err);
        message.reply('❌ Gagal menyinkronkan izin channel.');
      }
      return;
    }

    // ==========================================
    // KATEGORI 2: STAF & INVESTIGASI CEPAT
    // ==========================================

    // .snipe
    if (command === 'snipe') {
      const sniped = snipes.get(message.channel.id);
      if (!sniped) {
        return message.reply('🔍 Tidak ada pesan yang baru saja dihapus di channel ini.');
      }

      const snipeEmbed = new EmbedBuilder()
        .setAuthor({ 
          name: sniped.author ? `${sniped.author.tag}` : 'Pengguna Tidak Diketahui', 
          iconURL: sniped.author ? sniped.author.displayAvatarURL({ dynamic: true }) : undefined 
        })
        .setDescription(sniped.content || '*[Pesan tidak memiliki teks / hanya lampiran media]*')
        .setColor(0xED4245)
        .setFooter({ text: `Dihapus sekitar ${Math.round((Date.now() - sniped.timestamp) / 1000)} detik lalu` })
        .setTimestamp(sniped.timestamp);

      if (sniped.attachments && sniped.attachments.length > 0) {
        snipeEmbed.setImage(sniped.attachments[0]);
      }

      return message.channel.send({ embeds: [snipeEmbed] }).catch(() => {});
    }

    // .editsnipe
    if (command === 'editsnipe') {
      const edited = editSnipes.get(message.channel.id);
      if (!edited) {
        return message.reply('🔍 Tidak ada pesan yang baru saja diedit di channel ini.');
      }

      const editEmbed = new EmbedBuilder()
        .setAuthor({ 
          name: edited.author ? `${edited.author.tag}` : 'Pengguna Tidak Diketahui', 
          iconURL: edited.author ? edited.author.displayAvatarURL({ dynamic: true }) : undefined 
        })
        .setTitle('✏️ Isi Asli Pesan Sebelum Diedit')
        .setColor(0xFEE75C)
        .addFields(
          { name: 'Sebelum (Asli)', value: edited.oldContent.substring(0, 1024) },
          { name: 'Sesudah (Diedit)', value: edited.newContent.substring(0, 1024) },
          { name: 'Tautan Pesan', value: `[Lompat ke Pesan](${edited.url})` }
        )
        .setFooter({ text: `Diedit sekitar ${Math.round((Date.now() - edited.timestamp) / 1000)} detik lalu` })
        .setTimestamp(edited.timestamp);

      return message.channel.send({ embeds: [editEmbed] }).catch(() => {});
    }

    // .checkalt / .scanalt [hari]
    if (command === 'checkalt' || command === 'scanalt') {
      if (!member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
        return message.reply('❌ Kamu tidak memiliki izin `Moderate Members`.');
      }

      const days = parseInt(args[0], 10) || 7;
      const daysMs = days * 24 * 60 * 60 * 1000;
      const loadingMsg = await message.channel.send(`🔍 Sedang memindai member dengan umur akun di bawah **${days} hari**...`);

      try {
        await message.guild.members.fetch();
        const now = Date.now();
        const altMembers = message.guild.members.cache.filter(m => 
          !m.user.bot && (now - m.user.createdTimestamp) < daysMs
        );

        if (altMembers.size === 0) {
          return loadingMsg.edit(`✅ **Hasil Scan:** Tidak ditemukan member dengan umur akun di bawah ${days} hari.`);
        }

        const list = altMembers.map(m => {
          const createdUnix = Math.floor(m.user.createdTimestamp / 1000);
          return `• **${m.user.tag}** (<@${m.id}>)\n  ↳ Akun dibuat: <t:${createdUnix}:R> (<t:${createdUnix}:F>)`;
        }).slice(0, 15).join('\n\n');

        const embed = new EmbedBuilder()
          .setTitle(`🚨 Deteksi Akun Baru (< ${days} Hari) - Total: ${altMembers.size}`)
          .setColor(0xED4245)
          .setDescription(list)
          .setFooter({ text: altMembers.size > 15 ? 'Menampilkan 15 akun teratas' : 'Pindai selesai' })
          .setTimestamp();

        await loadingMsg.edit({ content: null, embeds: [embed] });
      } catch (err) {
        console.error(err);
        loadingMsg.edit('❌ Terjadi kesalahan saat memindai member.');
      }
      return;
    }

    // .slowmode [detik]
    if (command === 'slowmode') {
      if (!member.permissions.has(PermissionFlagsBits.ManageChannels)) {
        return message.reply('❌ Kamu tidak memiliki izin `Manage Channels`.');
      }

      const seconds = parseInt(args[0], 10);
      if (isNaN(seconds) || seconds < 0 || seconds > 21600) {
        return message.reply(`⚠️ Masukkan durasi slowmode antara **0 - 21600 detik** (0 untuk mematikan).\nContoh: \`${PREFIX}slowmode 10\` atau \`${PREFIX}slowmode 0\``);
      }

      try {
        await message.channel.setRateLimitPerUser(seconds, `Diatur oleh ${message.author.tag}`);
        const embed = new EmbedBuilder()
          .setTitle('⏱️ Pengaturan Slowmode')
          .setColor(seconds > 0 ? 0xFEE75C : 0x57F287)
          .setDescription(seconds > 0 
            ? `Slowmode di channel ini berhasil diatur ke **${seconds} detik** per pesan.` 
            : `Slowmode di channel ini telah **dinonaktifkan**.`
          )
          .setFooter({ text: `Diatur oleh ${message.author.tag}` })
          .setTimestamp();

        await message.channel.send({ embeds: [embed] }).catch(() => {});
        await sendAuditLog(message.guild, embed);
      } catch (err) {
        console.error(err);
        message.reply('❌ Gagal mengatur slowmode di channel ini.');
      }
      return;
    }

    // ==========================================
    // KATEGORI 3: DISIPLIN & KARANTINA LANJUTAN
    // ==========================================

    // .modpanel @user (Kartu Tindakan Cepat Smartphone/Desktop)
    if (command === 'modpanel') {
      if (!member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
        return message.reply('❌ Kamu tidak memiliki izin `Moderate Members`.');
      }

      const target = message.mentions.members.first();
      if (!target) return message.reply(`⚠️ Sebutkan member yang ingin dikelola.\nContoh: \`${PREFIX}modpanel @user\``);

      const panelEmbed = new EmbedBuilder()
        .setTitle(`🛡️ ModPanel Tindakan Cepat: ${target.user.tag}`)
        .setThumbnail(target.user.displayAvatarURL({ dynamic: true }))
        .setColor(0x5865F2)
        .addFields(
          { name: 'Target', value: `<@${target.id}>`, inline: true },
          { name: 'ID Pengguna', value: target.id, inline: true },
          { name: 'Bergabung Server', value: target.joinedAt ? `<t:${Math.floor(target.joinedTimestamp / 1000)}:R>` : 'Tidak diketahui', inline: true },
          { name: 'Role Tertinggi', value: `${target.roles.highest}`, inline: true },
          { name: 'Status Hukuman', value: target.isCommunicationDisabled() ? 'Sedang Di-timeout' : 'Normal / Bebas', inline: true }
        )
        .setFooter({ text: 'Tekan tombol di bawah untuk mengeksekusi tindakan langsung' })
        .setTimestamp();

      const actionRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`mp_mute10_${target.id}`)
          .setLabel('Mute 10m')
          .setEmoji('⏳')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`mp_warn_${target.id}`)
          .setLabel('Warn')
          .setEmoji('⚠️')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`mp_kick_${target.id}`)
          .setLabel('Kick')
          .setEmoji('👢')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId(`mp_ban_${target.id}`)
          .setLabel('Ban')
          .setEmoji('🔨')
          .setStyle(ButtonStyle.Danger)
      );

      return message.channel.send({ embeds: [panelEmbed], components: [actionRow] });
    }

    // .jail @user [alasan] & .unjail @user
    if (command === 'jail') {
      if (!member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
        return message.reply('❌ Kamu tidak memiliki izin `Moderate Members`.');
      }

      const target = message.mentions.members.first();
      if (!target) return message.reply(`⚠️ Format: \`${PREFIX}jail @user [alasan sidang]\``);

      if (target.id === message.author.id || target.id === client.user.id) {
        return message.reply('❌ Tidak dapat memenjarakan target tersebut.');
      }

      if (!target.moderatable) {
        return message.reply('❌ Posisi role target setara atau di atas bot.');
      }

      const reason = args.slice(1).join(' ') || 'Sidang investigasi moderator';

      // Cari atau buat role Jailed
      let jailRole = message.guild.roles.cache.find(r => r.name.toLowerCase() === 'jailed');
      if (!jailRole && message.guild.members.me.permissions.has(PermissionFlagsBits.ManageRoles)) {
        try {
          jailRole = await message.guild.roles.create({
            name: 'Jailed',
            color: 0x2B2D31,
            reason: 'Auto-create role untuk karantina sidang member'
          });
        } catch (e) {
          console.error(e);
        }
      }

      if (!jailRole) {
        return message.reply('⚠️ Role `Jailed` belum tersedia dan bot tidak bisa membuatnya.');
      }

      const jailedData = loadData('jailed.json', {});
      // Simpan role asli member
      const userRoles = target.roles.cache.filter(r => r.id !== message.guild.id && r.id !== jailRole.id).map(r => r.id);
      jailedData[target.id] = { roles: userRoles, reason, moderatorTag: message.author.tag, timestamp: Date.now() };
      saveData('jailed.json', jailedData);

      try {
        // Cabut role lama & pasang role Jailed
        await target.roles.remove(userRoles).catch(() => {});
        await target.roles.add(jailRole);

        const jailEmbed = new EmbedBuilder()
          .setTitle('⚖️ Member Dimasukkan ke Ruang Sidang (Jailed)')
          .setColor(0xED4245)
          .setDescription(`**${target.user.tag}** telah dikarantina ke role **@Jailed** untuk investigasi staf. Seluruh role aslinya telah disimpan sementara.`)
          .addFields(
            { name: 'Target', value: `<@${target.id}>`, inline: true },
            { name: 'Moderator', value: `<@${message.author.id}>`, inline: true },
            { name: 'Alasan Sidang', value: reason }
          )
          .setTimestamp();

        await message.channel.send({ embeds: [jailEmbed] });
        await sendAuditLog(message.guild, jailEmbed);
        recordModStat(message.author.id, 'warn');
      } catch (err) {
        console.error(err);
        message.reply('❌ Gagal memproses penahanan member.');
      }
      return;
    }

    if (command === 'unjail') {
      if (!member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
        return message.reply('❌ Kamu tidak memiliki izin `Moderate Members`.');
      }

      const target = message.mentions.members.first();
      if (!target) return message.reply(`⚠️ Format: \`${PREFIX}unjail @user\``);

      const jailedData = loadData('jailed.json', {});
      const jailRole = message.guild.roles.cache.find(r => r.name.toLowerCase() === 'jailed');

      try {
        if (jailRole && target.roles.cache.has(jailRole.id)) {
          await target.roles.remove(jailRole).catch(() => {});
        }

        if (jailedData[target.id] && jailedData[target.id].roles) {
          await target.roles.add(jailedData[target.id].roles).catch(() => {});
          delete jailedData[target.id];
          saveData('jailed.json', jailedData);
        }

        const unjailEmbed = new EmbedBuilder()
          .setTitle('🔓 Status Sidang Selesai (Unjailed)')
          .setColor(0x57F287)
          .setDescription(`Status karantina untuk **${target.user.tag}** telah dicabut oleh <@${message.author.id}>. Seluruh role lamanya telah dikembalikan.`)
          .setTimestamp();

        await message.channel.send({ embeds: [unjailEmbed] });
        await sendAuditLog(message.guild, unjailEmbed);
      } catch (err) {
        console.error(err);
        message.reply('❌ Gagal mencabut status jail member.');
      }
      return;
    }

    // .softban @user [alasan]
    if (command === 'softban') {
      if (!member.permissions.has(PermissionFlagsBits.BanMembers)) {
        return message.reply('❌ Kamu tidak memiliki izin `Ban Members`.');
      }

      const target = message.mentions.members.first();
      if (!target) return message.reply(`⚠️ Format: \`${PREFIX}softban @user [alasan]\``);

      if (target.id === message.author.id || !target.bannable) {
        return message.reply('❌ Bot tidak dapat melakukan softban pada member ini.');
      }

      const reason = args.slice(1).join(' ') || 'Softban: Pembersihan riwayat spam 24 jam';

      try {
        await message.guild.members.ban(target.id, {
          deleteMessageSeconds: 86400,
          reason: `Softban oleh ${message.author.tag}: ${reason}`
        });
        await message.guild.members.unban(target.id, 'Softban: Unban otomatis instan');

        const embed = new EmbedBuilder()
          .setTitle('🧹 Member Di-Softban')
          .setColor(0xED4245)
          .setDescription(`**${target.user.tag}** berhasil dikeluarkan dan seluruh chatnya dalam **24 jam terakhir** telah dibersihkan bersih.`)
          .addFields(
            { name: 'Target', value: `<@${target.id}>`, inline: true },
            { name: 'Moderator', value: `<@${message.author.id}>`, inline: true },
            { name: 'Alasan', value: reason }
          )
          .setTimestamp();

        await message.channel.send({ embeds: [embed] }).catch(() => {});
        await sendAuditLog(message.guild, embed);
        recordModStat(message.author.id, 'softban');
      } catch (err) {
        console.error(err);
        message.reply('❌ Gagal melakukan softban.');
      }
      return;
    }

    // .dm @user [pesan]
    if (command === 'dm') {
      if (!member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
        return message.reply('❌ Kamu tidak memiliki izin `Moderate Members`.');
      }

      const target = message.mentions.members.first();
      if (!target) return message.reply(`⚠️ Format: \`${PREFIX}dm @user [pesan resmi staf]\``);

      const dmText = args.slice(1).join(' ');
      if (!dmText) return message.reply('⚠️ Masukkan isi pesan yang ingin dikirimkan secara privat.');

      await message.delete().catch(() => {});

      const dmEmbed = new EmbedBuilder()
        .setTitle(`📩 Pesan Resmi Staf Server: ${message.guild.name}`)
        .setColor(0x5865F2)
        .setDescription(dmText)
        .setFooter({ text: `Pesan dikirimkan oleh Staf Server (${message.author.tag})` })
        .setTimestamp();

      try {
        await target.send({ embeds: [dmEmbed] });
        const confirmMsg = await message.channel.send(`✅ DM resmi berhasil dikirimkan ke **${target.user.tag}**.`);
        setTimeout(() => confirmMsg.delete().catch(() => {}), 4000);

        const logEmbed = new EmbedBuilder()
          .setTitle('✉️ DM Resmi Staf Terkirim')
          .setColor(0x57F287)
          .addFields(
            { name: 'Penerima', value: `${target.user.tag} (<@${target.id}>)`, inline: true },
            { name: 'Pengirim', value: `<@${message.author.id}>`, inline: true },
            { name: 'Isi Pesan', value: dmText.substring(0, 1024) }
          )
          .setTimestamp();

        await sendAuditLog(message.guild, logEmbed);
      } catch (err) {
        message.channel.send(`❌ Gagal mengirimkan DM ke **${target.user.tag}** (kemungkinan DM diblokir/dinonaktifkan oleh pengguna).`).catch(() => {});
      }
      return;
    }

    // ==========================================
    // KATEGORI 4: VOICE STAF & WAITING ROOM
    // ==========================================

    // .vckick @user
    if (command === 'vckick') {
      if (!member.permissions.has(PermissionFlagsBits.MoveMembers)) {
        return message.reply('❌ Kamu tidak memiliki izin `Move Members`.');
      }

      const target = message.mentions.members.first();
      if (!target) return message.reply(`⚠️ Format: \`${PREFIX}vckick @user\``);

      if (!target.voice.channel) {
        return message.reply('⚠️ Member tersebut tidak sedang berada di dalam voice channel manapun.');
      }

      try {
        const channelName = target.voice.channel.name;
        await target.voice.disconnect(`Diputus oleh ${message.author.tag}`);
        const embed = new EmbedBuilder()
          .setTitle('🔌 Voice Disconnect (VC-Kick)')
          .setColor(0xED4245)
          .setDescription(`**${target.user.tag}** berhasil diputus dari voice channel **${channelName}**.`)
          .addFields(
            { name: 'Target', value: `<@${target.id}>`, inline: true },
            { name: 'Moderator', value: `<@${message.author.id}>`, inline: true }
          )
          .setTimestamp();

        await message.channel.send({ embeds: [embed] }).catch(() => {});
        await sendAuditLog(message.guild, embed);
      } catch (err) {
        console.error(err);
        message.reply('❌ Gagal memutus koneksi voice member.');
      }
      return;
    }

    // .vcmute & .vcunmute @user
    if (command === 'vcmute') {
      if (!member.permissions.has(PermissionFlagsBits.MuteMembers)) {
        return message.reply('❌ Kamu tidak memiliki izin `Mute Members`.');
      }

      const target = message.mentions.members.first();
      if (!target) return message.reply(`⚠️ Sebutkan member yang ingin di-mute di voice channel.`);
      if (!target.voice.channel) return message.reply('⚠️ Member tidak berada di dalam voice channel.');

      try {
        await target.voice.setMute(true, `Server-mute oleh ${message.author.tag}`);
        const embed = new EmbedBuilder()
          .setTitle('🔇 Voice Server Mute')
          .setColor(0xFEE75C)
          .setDescription(`Mic **${target.user.tag}** berhasil dibisukan di voice channel oleh moderator.`)
          .addFields(
            { name: 'Target', value: `<@${target.id}>`, inline: true },
            { name: 'Moderator', value: `<@${message.author.id}>`, inline: true }
          )
          .setTimestamp();

        await message.channel.send({ embeds: [embed] }).catch(() => {});
        await sendAuditLog(message.guild, embed);
      } catch (err) {
        console.error(err);
        message.reply('❌ Gagal mem-mute member di voice channel.');
      }
      return;
    }

    if (command === 'vcunmute') {
      if (!member.permissions.has(PermissionFlagsBits.MuteMembers)) {
        return message.reply('❌ Kamu tidak memiliki izin `Mute Members`.');
      }

      const target = message.mentions.members.first();
      if (!target) return message.reply(`⚠️ Sebutkan member yang ingin di-unmute.`);
      if (!target.voice.channel) return message.reply('⚠️ Member tidak berada di dalam voice channel.');

      try {
        await target.voice.setMute(false, `Server-unmute oleh ${message.author.tag}`);
        const embed = new EmbedBuilder()
          .setTitle('🔊 Voice Server Unmute')
          .setColor(0x57F287)
          .setDescription(`Mic **${target.user.tag}** berhasil diaktifkan kembali oleh moderator.`)
          .addFields(
            { name: 'Target', value: `<@${target.id}>`, inline: true },
            { name: 'Moderator', value: `<@${message.author.id}>`, inline: true }
          )
          .setTimestamp();

        await message.channel.send({ embeds: [embed] }).catch(() => {});
        await sendAuditLog(message.guild, embed);
      } catch (err) {
        console.error(err);
        message.reply('❌ Gagal me-unmute member di voice channel.');
      }
      return;
    }

    // .vcmove @user [channel]
    if (command === 'vcmove') {
      if (!member.permissions.has(PermissionFlagsBits.MoveMembers)) {
        return message.reply('❌ Kamu tidak memiliki izin `Move Members`.');
      }

      const target = message.mentions.members.first();
      if (!target) return message.reply(`⚠️ Format: \`${PREFIX}vcmove @user [nama/ID channel voice]\``);
      if (!target.voice.channel) return message.reply('⚠️ Member tidak berada di dalam voice channel.');

      const targetChannelArg = args.slice(1).join(' ').replace(/[<#>]/g, '');
      const destChannel = message.guild.channels.cache.find(c => 
        c.isVoiceBased() && (c.id === targetChannelArg || c.name.toLowerCase() === targetChannelArg.toLowerCase())
      );

      if (!destChannel) {
        return message.reply('⚠️ Voice channel tujuan tidak ditemukan. Masukkan nama channel voice atau ID yang sesuai.');
      }

      try {
        const fromName = target.voice.channel.name;
        await target.voice.setChannel(destChannel, `Dipindahkan oleh ${message.author.tag}`);
        const embed = new EmbedBuilder()
          .setTitle('🔀 Member Dipindahkan (VC-Move)')
          .setColor(0x5865F2)
          .setDescription(`**${target.user.tag}** berhasil dipindahkan dari **${fromName}** ke **${destChannel.name}**.`)
          .addFields(
            { name: 'Target', value: `<@${target.id}>`, inline: true },
            { name: 'Moderator', value: `<@${message.author.id}>`, inline: true }
          )
          .setTimestamp();

        await message.channel.send({ embeds: [embed] }).catch(() => {});
        await sendAuditLog(message.guild, embed);
      } catch (err) {
        console.error(err);
        message.reply('❌ Gagal memindahkan member ke voice channel tujuan.');
      }
      return;
    }

    // .next (Tarik Member Pertama dari Ruang Tunggu ke Voice Moderator)
    if (command === 'next') {
      if (!member.permissions.has(PermissionFlagsBits.MoveMembers)) {
        return message.reply('❌ Kamu tidak memiliki izin `Move Members`.');
      }

      if (!member.voice.channel) {
        return message.reply('⚠️ Kamu harus masuk ke voice channel sidang/admin terlebih dahulu untuk menggunakan perintah `.next`.');
      }

      // Cari channel ruang tunggu / waiting room
      const waitingRoom = message.guild.channels.cache.find(c => 
        c.isVoiceBased() && (/waiting|tunggu|antre|antrian/i.test(c.name))
      );

      if (!waitingRoom) {
        return message.reply('⚠️ Channel voice Ruang Tunggu (nama mengandung kata `Waiting` atau `Tunggu`) tidak ditemukan di server.');
      }

      const nextMember = waitingRoom.members.filter(m => !m.user.bot).first();
      if (!nextMember) {
        return message.reply('ℹ️ Ruang tunggu sedang kosong, tidak ada member dalam antrean saat ini.');
      }

      try {
        await nextMember.voice.setChannel(member.voice.channel, `Dipanggil ke sidang oleh ${message.author.tag}`);
        const embed = new EmbedBuilder()
          .setTitle('📢 Antrean Berikutnya Dipanggil (.next)')
          .setColor(0x57F287)
          .setDescription(`**${nextMember.user.tag}** (<@${nextMember.id}>) berhasil ditarik dari **${waitingRoom.name}** masuk ke **${member.voice.channel.name}**!`)
          .setFooter({ text: `Dipanggil oleh: ${message.author.tag}` })
          .setTimestamp();

        await message.channel.send({ embeds: [embed] });
        await sendAuditLog(message.guild, embed);
      } catch (err) {
        console.error(err);
        message.reply('❌ Gagal memindahkan member antrean.');
      }
      return;
    }

    // ==========================================
    // KATEGORI 5: EVALUASI INTERNAL STAF
    // ==========================================

    // .modstats [@moderator]
    if (command === 'modstats') {
      const targetUser = message.mentions.users.first() || message.author;
      const stats = loadData('modstats.json', {});
      const userStat = stats[targetUser.id] || { timeout: 0, kick: 0, ban: 0, warn: 0, clear: 0, ticket: 0, softban: 0 };

      const totalActions = Object.values(userStat).reduce((a, b) => a + b, 0);

      const statsEmbed = new EmbedBuilder()
        .setTitle(`📊 Evaluasi Kinerja Staf: ${targetUser.tag}`)
        .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
        .setColor(0x5865F2)
        .addFields(
          { name: '⏳ Timeout Diberikan', value: `${userStat.timeout || 0} kali`, inline: true },
          { name: '⚠️ Peringatan (Warn)', value: `${userStat.warn || 0} kali`, inline: true },
          { name: '🧹 Pesan Massal (Clear)', value: `${userStat.clear || 0} kali`, inline: true },
          { name: '👢 Member Di-Kick', value: `${userStat.kick || 0} orang`, inline: true },
          { name: '🔨 Member Di-Ban', value: `${userStat.ban || 0} orang`, inline: true },
          { name: '💨 Softban Eksekusi', value: `${userStat.softban || 0} kali`, inline: true },
          { name: '🎫 Tiket Ditangani', value: `${userStat.ticket || 0} tiket`, inline: true },
          { name: '🏆 Total Aktivitas Staf', value: `**${totalActions} tindakan**`, inline: true }
        )
        .setFooter({ text: 'Laporan Evaluasi Berkala Staf Ambanime (KING\'S)' })
        .setTimestamp();

      return message.channel.send({ embeds: [statsEmbed] });
    }

    // ==========================================
    // KATEGORI 6: KOMUNITAS, GAMING & EDITOR
    // ==========================================

    // .mabar [Nama Game] [Slot]
    if (command === 'mabar') {
      const slotIndex = args.findIndex(a => /^\d+$/.test(a));
      let game = 'Game';
      let maxSlots = 5;

      if (slotIndex !== -1) {
        maxSlots = Math.min(Math.max(parseInt(args[slotIndex], 10), 2), 20);
        game = args.slice(0, slotIndex).join(' ') || 'Game';
      } else if (args.length > 0) {
        game = args.join(' ');
      }

      const mabarEmbed = new EmbedBuilder()
        .setTitle(`🎮 AJAKAN MABAR: ${game.toUpperCase()}`)
        .setColor(0x5865F2)
        .setDescription(
          `**Host:** <@${message.author.id}>\n` +
          `**Slot Pemain:** 1 / ${maxSlots}\n\n` +
          `**Daftar Peserta:**\n` +
          `1. <@${message.author.id}> *(Host)*\n\n` +
          `Klik tombol **Join** di bawah untuk bergabung mabar!`
        )
        .setFooter({ text: `Ambanime Mabar System • Kuota: ${maxSlots} Pemain` })
        .setTimestamp();

      const mabarRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('mabar_join')
          .setLabel('Join Mabar')
          .setEmoji('🟢')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('mabar_leave')
          .setLabel('Tinggalkan')
          .setEmoji('🔴')
          .setStyle(ButtonStyle.Secondary)
      );

      const mabarMsg = await message.channel.send({ embeds: [mabarEmbed], components: [mabarRow] });

      activeMabars.set(mabarMsg.id, {
        game,
        maxSlots,
        hostId: message.author.id,
        players: new Set([message.author.id]),
        channelId: message.channel.id
      });
      return;
    }

    // .rate / .feedback (Thread Diskusi & Rating AMV / Desain)
    if (command === 'rate' || command === 'feedback') {
      let targetMessage = null;
      if (message.reference && message.reference.messageId) {
        targetMessage = await message.channel.messages.fetch(message.reference.messageId).catch(() => null);
      }

      const hostMsg = targetMessage || message;

      try {
        const thread = await hostMsg.startThread({
          name: `Rating & Diskusi: Karya ${hostMsg.author.username}`,
          autoArchiveDuration: 1440
        });

        const rateEmbed = new EmbedBuilder()
          .setTitle('🌟 POLLING APRESIASI & RATING KARYA')
          .setColor(0xFEE75C)
          .setDescription(
            `Karya oleh: <@${hostMsg.author.id}>\n\n` +
            `Silakan berikan ulasan, kritik membangun, atau vote bintang menggunakan reaksi di bawah ini!\n\n` +
            `⭐ (1/5) • ⭐⭐ (2/5) • ⭐⭐⭐ (3/5) • ⭐⭐⭐⭐ (4/5) • ⭐⭐⭐⭐⭐ (5/5)`
          )
          .setTimestamp();

        const pollMsg = await thread.send({ embeds: [rateEmbed] });
        await pollMsg.react('1️⃣').catch(() => {});
        await pollMsg.react('2️⃣').catch(() => {});
        await pollMsg.react('3️⃣').catch(() => {});
        await pollMsg.react('4️⃣').catch(() => {});
        await pollMsg.react('5️⃣').catch(() => {});

        if (targetMessage) {
          message.delete().catch(() => {});
        }
      } catch (err) {
        console.error(err);
        message.reply('❌ Gagal membuat thread rating. Pastikan bot memiliki izin `Create Public Threads` dan `Add Reactions`.');
      }
      return;
    }

    // .preset / .assets (Kumpulan Bahan Editing Resmi)
    if (command === 'preset' || command === 'assets') {
      const assetEmbed = new EmbedBuilder()
        .setTitle('🎬 AMBANIME OFFICIAL EDITING ASSETS & PRESETS')
        .setColor(0xED4245)
        .setDescription(
          'Kumpulan folder Google Drive bahan editing resmi untuk para Video Editor & Content Creator komunitas Ambanime:\n\n' +
          '🔤 **[Font Pack Aesthetic & Typo](https://drive.google.com)**\n' +
          '↳ Ratusan font aesthetic, bold, sans, dan jepang siap pakai.\n\n' +
          '🎵 **[Sound Effects (SFX) & Anime BGM](https://drive.google.com)**\n' +
          '↳ Whoosh, impact, glitches, gun sounds, anime voicelines HD.\n\n' +
          '🎞️ **[Overlays, Particles & Transitions](https://drive.google.com)**\n' +
          '↳ Light leaks, dust particles, film burns, chromakey green screen.\n\n' +
          '🎨 **[Presets AM / AE / Premiere](https://drive.google.com)**\n' +
          '↳ Preset shaking, smooth zoom, CC (Color Grading), velocity curve.\n\n' +
          '*Gunakan bahan-bahan ini untuk berkarya dan jangan lupa tag role @Video Editor!*'
        )
        .setFooter({ text: 'Ambanime Editor Vault' })
        .setTimestamp();

      return message.channel.send({ embeds: [assetEmbed] });
    }

    // .afk [alasan]
    if (command === 'afk') {
      const reason = args.join(' ') || 'Tanpa alasan';
      const originalName = member.nickname || member.user.globalName || member.user.username;

      // Simpan data AFK
      afkUsers.set(member.id, {
        reason: reason,
        time: Date.now(),
        originalNickname: member.nickname || null // null jika tidak punya nickname server
      });

      // Ubah nama menjadi [AFK] Nama
      if (member.manageable) {
        // Batasi panjang nickname maksimal 32 karakter sesuai limit Discord
        const newNickname = `[AFK] ${originalName}`.substring(0, 32);
        await member.setNickname(newNickname).catch(() => {});
      } else if (message.guild.ownerId === member.id) {
        message.channel.send('ℹ️ *Catatan: Server Owner tidak dapat diubah nicknamenya oleh bot karena batasan hierarki Discord, tetapi status AFK tetap aktif.*').catch(() => {});
      }

      return message.reply(`💤 <@${member.id}>, kamu sekarang AFK: **${reason}**.`);
    }

    // .rep @user [alasan] & .checkrep @user
    if (command === 'rep') {
      const target = message.mentions.users.first();
      if (!target) return message.reply(`⚠️ Format: \`${PREFIX}rep @user [alasan pujian/terima kasih]\``);

      if (target.id === message.author.id) return message.reply('❌ Kamu tidak bisa memberikan reputasi pada diri sendiri.');
      if (target.bot) return message.reply('❌ Kamu tidak bisa memberikan reputasi pada bot.');

      const reason = args.slice(1).join(' ') || 'Membantu member komunitas';
      const repData = loadData('reputation.json', {});

      if (!repData[target.id]) {
        repData[target.id] = { points: 0, history: [] };
      }

      repData[target.id].points += 1;
      repData[target.id].history.push({
        fromTag: message.author.tag,
        fromId: message.author.id,
        reason,
        timestamp: Date.now()
      });

      saveData('reputation.json', repData);

      const embed = new EmbedBuilder()
        .setTitle('⭐ Reputasi Diberikan (+1 Respect)')
        .setColor(0xFEE75C)
        .setDescription(`<@${message.author.id}> memberikan **+1 Reputasi** kepada <@${target.id}>!`)
        .addFields(
          { name: 'Alasan', value: reason },
          { name: 'Total Reputasi Saat Ini', value: `⭐ **${repData[target.id].points}** poin` }
        )
        .setTimestamp();

      return message.channel.send({ embeds: [embed] });
    }

    if (command === 'checkrep') {
      const target = message.mentions.users.first() || message.author;
      const repData = loadData('reputation.json', {});
      const data = repData[target.id] || { points: 0, history: [] };

      const historyText = data.history.slice(-5).map((h, i) => {
        return `**${i + 1}.** [${new Date(h.timestamp).toLocaleDateString('id-ID')}] *"${h.reason}"* — dari ${h.fromTag}`;
      }).join('\n') || 'Belum ada riwayat reputasi.';

      const embed = new EmbedBuilder()
        .setTitle(`⭐ Poin Reputasi: ${target.tag}`)
        .setThumbnail(target.displayAvatarURL({ dynamic: true }))
        .setColor(0xFEE75C)
        .addFields(
          { name: 'Total Poin', value: `⭐ **${data.points}** Respect Poin`, inline: true },
          { name: '5 Pujian Terakhir', value: historyText }
        )
        .setTimestamp();

      return message.channel.send({ embeds: [embed] });
    }

    // ==========================================
    // PERINTAH DASAR MODERASI & ROLE TERDAHULU
    // ==========================================

    // .warn, .checkwarn, .clearwarn
    if (command === 'warn') {
      if (!member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
        return message.reply('❌ Kamu tidak memiliki izin `Moderate Members`.');
      }

      const target = message.mentions.members.first();
      if (!target) return message.reply(`⚠️ Format: \`${PREFIX}warn @user [alasan]\``);
      if (target.id === message.author.id || target.id === client.user.id) return message.reply('❌ Target tidak valid.');

      const reason = args.slice(1).join(' ') || 'Melanggar aturan komunitas';
      const key = `${message.guild.id}_${target.id}`;
      const allWarnings = loadData('warnings.json', {});

      if (!allWarnings[key]) allWarnings[key] = { count: 0, records: [] };
      allWarnings[key].count += 1;
      allWarnings[key].records.push({
        reason,
        moderatorTag: message.author.tag,
        moderatorId: message.author.id,
        timestamp: Date.now()
      });

      const currentCount = allWarnings[key].count;
      saveData('warnings.json', allWarnings);
      recordModStat(message.author.id, 'warn');

      const warnEmbed = new EmbedBuilder()
        .setTitle('⚠️ Peringatan Diberikan (Warn)')
        .setColor(0xFEE75C)
        .setDescription(`**${target.user.tag}** menerima peringatan ke-**${currentCount}**.`)
        .addFields(
          { name: 'Target', value: `<@${target.id}>`, inline: true },
          { name: 'Moderator', value: `<@${message.author.id}>`, inline: true },
          { name: 'Total Peringatan', value: `**${currentCount}** kali`, inline: true },
          { name: 'Alasan', value: reason }
        )
        .setTimestamp();

      await message.channel.send({ embeds: [warnEmbed] });
      await sendAuditLog(message.guild, warnEmbed);

      if (currentCount >= 5 && target.bannable) {
        await target.ban({ reason: `Mencapai 5 kali peringatan bertingkat` }).catch(() => {});
        recordModStat(message.author.id, 'ban');
      } else if (currentCount === 3 && target.moderatable) {
        await target.timeout(60 * 60 * 1000, 'Mencapai 3 kali peringatan bertingkat').catch(() => {});
        recordModStat(message.author.id, 'timeout');
      }
      return;
    }

    if (command === 'checkwarn' || command === 'warns') {
      const target = message.mentions.members.first() || member;
      const key = `${message.guild.id}_${target.id}`;
      const allWarnings = loadData('warnings.json', {});
      const data = allWarnings[key];

      if (!data || data.count === 0) {
        return message.channel.send(`✅ **${target.user.tag}** memiliki catatan bersih (0 peringatan).`);
      }

      const history = data.records.map((r, i) => {
        return `**${i + 1}.** [${new Date(r.timestamp).toLocaleDateString('id-ID')}] *${r.reason}* (Oleh: ${r.moderatorTag})`;
      }).slice(-10).join('\n');

      const embed = new EmbedBuilder()
        .setTitle(`📋 Catatan Peringatan: ${target.user.tag}`)
        .setColor(0xFEE75C)
        .addFields(
          { name: 'Total Peringatan', value: `**${data.count}** kali`, inline: true },
          { name: 'Riwayat Terakhir', value: history || 'Tidak ada catatan.' }
        )
        .setTimestamp();

      return message.channel.send({ embeds: [embed] });
    }

    if (command === 'clearwarn') {
      if (!member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
        return message.reply('❌ Kamu tidak memiliki izin `Moderate Members`.');
      }
      const target = message.mentions.members.first();
      if (!target) return message.reply(`⚠️ Sebutkan member yang ingin dihapus peringatannya.`);

      const key = `${message.guild.id}_${target.id}`;
      const allWarnings = loadData('warnings.json', {});
      delete allWarnings[key];
      saveData('warnings.json', allWarnings);

      return message.channel.send(`✨ Seluruh peringatan untuk **${target.user.tag}** berhasil dihapus.`);
    }

    // .lock, .unlock, .say, .clear, .timeout, .untimeout, .kick, .ban, .unban
    if (command === 'lock') {
      if (!member.permissions.has(PermissionFlagsBits.ManageChannels)) return message.reply('❌ Izin ditolak.');
      await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: false }).catch(() => {});
      return message.channel.send('🔒 Channel ini telah dikunci sementara oleh staf.');
    }

    if (command === 'unlock') {
      if (!member.permissions.has(PermissionFlagsBits.ManageChannels)) return message.reply('❌ Izin ditolak.');
      await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: null }).catch(() => {});
      return message.channel.send('🔓 Channel ini telah dibuka kembali.');
    }

    if (command === 'say') {
      if (!member.permissions.has(PermissionFlagsBits.ManageMessages)) return;
      const text = args.join(' ');
      if (text) {
        await message.delete().catch(() => {});
        await message.channel.send(text).catch(() => {});
      }
      return;
    }

    if (command === 'clear' || command === 'purge' || command === 'delete' || command === 'hapus') {
      if (!member.permissions.has(PermissionFlagsBits.ManageMessages)) {
        return message.reply('❌ Anda tidak memiliki izin **Manage Messages**.');
      }
      if (!message.guild.members.me.permissionsIn(message.channel).has(PermissionFlagsBits.ManageMessages)) {
        return message.reply('❌ Bot kekurangan izin **Manage Messages** di channel ini.');
      }
      const amount = parseInt(args[0], 10);
      if (isNaN(amount) || amount < 1 || amount > 100) {
        return message.reply(`⚠️ Masukkan jumlah pesan yang valid (1 - 100). Contoh: \`${PREFIX}delete 10\` atau \`${PREFIX}clear 25\``);
      }

      await message.delete().catch(() => {});
      try {
        const deleted = await message.channel.bulkDelete(amount, true);
        recordModStat(message.author.id, 'clear');
        const notif = await message.channel.send(`✅ Berhasil menghapus **${deleted.size}** pesan.`);
        setTimeout(() => notif.delete().catch(() => {}), 4000);
      } catch (err) {
        console.error('Error saat bulkDelete:', err);
        const failMsg = await message.channel.send('⚠️ Gagal menghapus pesan. Catatan: Discord membatasi bot hanya dapat menghapus massal pesan yang usianya kurang dari 14 hari.');
        setTimeout(() => failMsg.delete().catch(() => {}), 6000);
      }
      return;
    }

    if (command === 'timeout' || command === 'mute') {
      if (!member.permissions.has(PermissionFlagsBits.ModerateMembers)) return message.reply('❌ Izin ditolak.');
      const target = message.mentions.members.first();
      if (!target || !target.moderatable) return message.reply('⚠️ Member tidak valid atau tidak bisa di-timeout.');

      let durationMs = 10 * 60 * 1000;
      let reasonIndex = 1;
      const parsed = parseDuration(args[1]);
      if (parsed) { durationMs = parsed; reasonIndex = 2; }
      const reason = args.slice(reasonIndex).join(' ') || 'Melanggar aturan komunitas';

      await target.timeout(durationMs, `${message.author.tag}: ${reason}`).catch(() => {});
      recordModStat(message.author.id, 'timeout');
      return message.channel.send(`⏳ **${target.user.tag}** berhasil di-timeout selama **${formatDuration(durationMs)}**.`);
    }

    if (command === 'untimeout' || command === 'unmute') {
      if (!member.permissions.has(PermissionFlagsBits.ModerateMembers)) return message.reply('❌ Izin ditolak.');
      const target = message.mentions.members.first();
      if (!target || !target.moderatable) return message.reply('⚠️ Member tidak valid.');
      await target.timeout(null, `Dicabut oleh ${message.author.tag}`).catch(() => {});
      return message.channel.send(`🔊 Timeout untuk **${target.user.tag}** telah dicabut.`);
    }

    if (command === 'kick') {
      if (!member.permissions.has(PermissionFlagsBits.KickMembers)) return message.reply('❌ Izin ditolak.');
      const target = message.mentions.members.first();
      if (!target || !target.kickable) return message.reply('⚠️ Member tidak valid.');
      const reason = args.slice(1).join(' ') || 'Dikeluarkan oleh staf';
      await target.kick(`${message.author.tag}: ${reason}`).catch(() => {});
      recordModStat(message.author.id, 'kick');
      return message.channel.send(`👢 **${target.user.tag}** berhasil dikeluarkan dari server.`);
    }

    if (command === 'ban') {
      if (!member.permissions.has(PermissionFlagsBits.BanMembers)) return message.reply('❌ Izin ditolak.');
      const target = message.mentions.members.first();
      const targetId = target ? target.id : args[0]?.replace(/[<@!>]/g, '');
      if (!targetId) return message.reply('⚠️ Masukkan target.');
      const reason = args.slice(1).join(' ') || 'Pelanggaran fatal';
      await message.guild.members.ban(targetId, { deleteMessageSeconds: 86400, reason: `${message.author.tag}: ${reason}` }).catch(() => {});
      recordModStat(message.author.id, 'ban');
      return message.channel.send(`🔨 Pengguna dengan ID **${targetId}** berhasil di-ban permanen.`);
    }

    if (command === 'unban') {
      if (!member.permissions.has(PermissionFlagsBits.BanMembers)) return message.reply('❌ Izin ditolak.');
      const userId = args[0]?.replace(/[<@!>]/g, '');
      if (!userId) return message.reply('⚠️ Masukkan ID pengguna.');
      await message.guild.members.unban(userId, `Unban oleh ${message.author.tag}`).catch(() => {});
      return message.channel.send(`🔓 Status ban untuk ID **${userId}** telah dicabut.`);
    }

    // .setupticket

    if (command === 'setupticket' || command === 'ticketpanel') {
      if (!member.permissions.has(PermissionFlagsBits.Administrator)) return message.reply('❌ Izin ditolak.');
      const ticketEmbed = new EmbedBuilder()
        .setTitle('🎫 PUSAT BANTUAN & TIKET STAF')
        .setDescription('Butuh bantuan atau ingin melaporkan sesuatu secara privat?\nKlik tombol **Buka Tiket** di bawah ini.')
        .setColor(0x5865F2)
        .setTimestamp();

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ticket_create').setLabel('Buka Tiket').setEmoji('📩').setStyle(ButtonStyle.Primary)
      );
      await message.channel.send({ embeds: [ticketEmbed], components: [row] });
      await message.delete().catch(() => {});
      return;
    }
  } catch (globalErr) {
    console.error('Error saat memproses pesan:', globalErr);
  }
});

// ==========================================
// 3. INTERAKSI TOMBOL (VERIFIKASI, MODPANEL, MABAR, ROLES, TIKET)
// ==========================================
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;

  const guild = interaction.guild;
  const member = interaction.member;

  // ------------------------------------------
  // A. TOMBOL VERIFIKASI MEMBER (verify_member -> Role CLUB)
  // ------------------------------------------
  if (interaction.customId === 'verify_member') {
    if (interaction.replied || interaction.deferred) return;

    try {
      let clubRole = guild.roles.cache.find(r => r.name.toUpperCase().includes('CLUB'));
      if (!clubRole && guild.members.me.permissions.has(PermissionFlagsBits.ManageRoles)) {
        clubRole = await guild.roles.create({
          name: 'CLUB',
          reason: 'Auto-create role CLUB untuk verifikasi gerbang server'
        }).catch(() => null);
      }

      if (!clubRole) {
        return interaction.reply({
          content: '⚠️ Role **CLUB** belum tersedia di server. Harap hubungi Admin.',
          ephemeral: true
        });
      }

      if (member.roles.cache.has(clubRole.id)) {
        return interaction.reply({
          content: 'ℹ️ Akun Anda sudah terverifikasi dengan role **CLUB** sebelumnya.',
          ephemeral: true
        });
      }

      await member.roles.add(clubRole);
      await interaction.reply({
        content: `✅ **Selamat!** Anda telah berhasil diverifikasi dan mendapatkan role **${clubRole.name}**! Seluruh channel komunitas kini terbuka untuk Anda.`,
        ephemeral: true
      });

      const logEmbed = new EmbedBuilder()
        .setTitle('✅ Member Terverifikasi (Gatekeeper)')
        .setColor(0x57F287)
        .setDescription(`**${interaction.user.tag}** (<@${interaction.user.id}>) berhasil melakukan verifikasi rules dan mendapatkan role **${clubRole.name}**.`)
        .setTimestamp();

      await sendAuditLog(guild, logEmbed);
    } catch (err) {
      console.error(err);
      interaction.reply({ content: '❌ Terjadi kesalahan saat verifikasi.', ephemeral: true }).catch(() => {});
    }
    return;
  }

  // ------------------------------------------
  // B. TOMBOL MODPANEL AKSI CEPAT (mp_mute10, mp_warn, mp_kick, mp_ban)
  // ------------------------------------------
  if (interaction.customId.startsWith('mp_')) {
    if (!member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      return interaction.reply({ content: '❌ Anda tidak memiliki wewenang staf.', ephemeral: true });
    }

    const parts = interaction.customId.split('_');
    const action = parts[1];
    const targetId = parts[2];

    const targetMember = await guild.members.fetch(targetId).catch(() => null);
    if (!targetMember) {
      return interaction.reply({ content: '⚠️ Member tidak ditemukan di server.', ephemeral: true });
    }

    try {
      if (action === 'mute10') {
        await targetMember.timeout(10 * 60 * 1000, `ModPanel oleh ${interaction.user.tag}`);
        recordModStat(interaction.user.id, 'timeout');
        await interaction.reply({ content: `✅ **${targetMember.user.tag}** berhasil di-timeout selama **10 menit**.`, ephemeral: true });
      } else if (action === 'warn') {
        const key = `${guild.id}_${targetId}`;
        const allWarnings = loadData('warnings.json', {});
        if (!allWarnings[key]) allWarnings[key] = { count: 0, records: [] };
        allWarnings[key].count += 1;
        allWarnings[key].records.push({ reason: 'Ditegur via ModPanel', moderatorTag: interaction.user.tag, timestamp: Date.now() });
        saveData('warnings.json', allWarnings);
        recordModStat(interaction.user.id, 'warn');
        await interaction.reply({ content: `✅ **${targetMember.user.tag}** menerima +1 peringatan (Total: ${allWarnings[key].count}).`, ephemeral: true });
      } else if (action === 'kick') {
        if (!targetMember.kickable) return interaction.reply({ content: '❌ Member ini tidak bisa di-kick.', ephemeral: true });
        await targetMember.kick(`ModPanel oleh ${interaction.user.tag}`);
        recordModStat(interaction.user.id, 'kick');
        await interaction.reply({ content: `👢 **${targetMember.user.tag}** berhasil di-kick dari server.`, ephemeral: true });
      } else if (action === 'ban') {
        if (!targetMember.bannable) return interaction.reply({ content: '❌ Member ini tidak bisa di-ban.', ephemeral: true });
        await guild.members.ban(targetId, { reason: `ModPanel oleh ${interaction.user.tag}`, deleteMessageSeconds: 86400 });
        recordModStat(interaction.user.id, 'ban');
        await interaction.reply({ content: `🔨 **${targetMember.user.tag}** berhasil di-ban permanen.`, ephemeral: true });
      }
    } catch (e) {
      console.error(e);
      interaction.reply({ content: '❌ Gagal mengeksekusi aksi ModPanel.', ephemeral: true }).catch(() => {});
    }
    return;
  }

  // ------------------------------------------
  // C. TOMBOL AJAKAN MABAR (mabar_join & mabar_leave)
  // ------------------------------------------
  if (interaction.customId === 'mabar_join' || interaction.customId === 'mabar_leave') {
    const session = activeMabars.get(interaction.message.id);
    if (!session) {
      return interaction.reply({ content: '⚠️ Sesi mabar ini sudah berakhir atau telah kedaluwarsa.', ephemeral: true });
    }

    const userId = interaction.user.id;

    if (interaction.customId === 'mabar_join') {
      if (session.players.has(userId)) {
        return interaction.reply({ content: 'ℹ️ Kamu sudah terdaftar dalam tim mabar ini.', ephemeral: true });
      }
      if (session.players.size >= session.maxSlots) {
        return interaction.reply({ content: '⚠️ Kuota pemain tim mabar ini sudah penuh!', ephemeral: true });
      }

      session.players.add(userId);
      await interaction.reply({ content: `✅ Kamu berhasil bergabung ke tim mabar **${session.game}**!`, ephemeral: true });

      // Jika kuota penuh, umumkan di chat
      if (session.players.size === session.maxSlots) {
        const mentionAll = Array.from(session.players).map(id => `<@${id}>`).join(' ');
        interaction.channel.send(`📢 **KUOTA TIM MABAR LENGKAP!**\nGame: **${session.game}**\nPeserta: ${mentionAll}\nSemua pemain sudah siap, selamat bermain! 🎉`).catch(() => {});
      }
    } else {
      if (!session.players.has(userId)) {
        return interaction.reply({ content: 'ℹ️ Kamu belum bergabung di tim mabar ini.', ephemeral: true });
      }
      if (userId === session.hostId) {
        return interaction.reply({ content: '⚠️ Kamu adalah Host mabar ini, tidak bisa keluar dari tim.', ephemeral: true });
      }

      session.players.delete(userId);
      await interaction.reply({ content: `🔴 Kamu telah keluar dari tim mabar **${session.game}**.`, ephemeral: true });
    }

    // Perbarui embed pesan mabar
    const playerList = Array.from(session.players).map((id, idx) => {
      return `${idx + 1}. <@${id}> ${id === session.hostId ? '*(Host)*' : ''}`;
    }).join('\n');

    const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
      .setDescription(
        `**Host:** <@${session.hostId}>\n` +
        `**Slot Pemain:** ${session.players.size} / ${session.maxSlots}\n\n` +
        `**Daftar Peserta:**\n${playerList}\n\n` +
        `Klik tombol **Join** di bawah untuk bergabung mabar!`
      );

    await interaction.message.edit({ embeds: [updatedEmbed] }).catch(() => {});
    return;
  }

  // ------------------------------------------
  // D. SISTEM BUKA & TUTUP TIKET
  // ------------------------------------------
  if (interaction.customId === 'ticket_create') {
    if (interaction.replied || interaction.deferred) return;

    try {
      const cleanUsername = interaction.user.username.toLowerCase().replace(/[^a-z0-9]/g, '') || interaction.user.id;
      const channelName = `ticket-${cleanUsername}`;

      const existingTicket = guild.channels.cache.find(c => c.name === channelName);
      if (existingTicket) {
        return interaction.reply({
          content: `⚠️ Kamu sudah memiliki tiket yang masih aktif di <#${existingTicket.id}>!`,
          ephemeral: true
        });
      }

      // Cari kategori khusus tiket yang sudah ada di server (misal: "REQUEST TICKET")
      const ticketCategory = guild.channels.cache.find(c => 
        c.type === ChannelType.GuildCategory && 
        (c.name.toLowerCase().includes('request ticket') || c.name.toLowerCase().includes('ticket'))
      );

      // Cari seluruh role staf di server (KING'S, QUEEN'S, JACK, Admin, Moderator, Staff)
      const staffRoles = guild.roles.cache.filter(r => {
        const n = r.name.toLowerCase();
        return n.includes("king's") || n.includes("queen's") || n === 'jack' || 
               n.includes('staff') || n.includes('admin') || n.includes('moderator') || n.includes('mod');
      });

      const overwrites = [
        { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
        { 
          id: member.id, 
          allow: [
            PermissionFlagsBits.ViewChannel, 
            PermissionFlagsBits.SendMessages, 
            PermissionFlagsBits.ReadMessageHistory, 
            PermissionFlagsBits.AttachFiles,
            PermissionFlagsBits.EmbedLinks
          ] 
        },
        { 
          id: guild.members.me.id, 
          allow: [
            PermissionFlagsBits.ViewChannel, 
            PermissionFlagsBits.SendMessages, 
            PermissionFlagsBits.ManageChannels, 
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.ManageMessages
          ] 
        }
      ];

      for (const [, role] of staffRoles) {
        overwrites.push({
          id: role.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.ManageMessages,
            PermissionFlagsBits.AttachFiles
          ]
        });
      }

      const channelOptions = {
        name: channelName,
        type: ChannelType.GuildText,
        topic: `Pembuat Tiket: ${member.id} | Dibuat: ${new Date().toISOString()}`,
        permissionOverwrites: overwrites,
        reason: `Tiket bantuan untuk ${interaction.user.tag}`
      };

      // Arahkan ke kategori REQUEST TICKET yang sudah ada di server
      if (ticketCategory) {
        channelOptions.parent = ticketCategory.id;
      } else if (interaction.channel.parent) {
        channelOptions.parent = interaction.channel.parent.id;
      }

      const ticketChannel = await guild.channels.create(channelOptions);
      const ticketEmbed = new EmbedBuilder()
        .setTitle('🎫 Tiket Bantuan Resmi Staf')
        .setColor(0x5865F2)
        .setDescription(`Halo <@${member.id}>! Jelaskan kendala Anda secara rinci di sini. Staf kami akan segera menanggapi.\n\n📌 *Klik tombol Tutup Tiket di bawah jika masalah sudah selesai.*`)
        .setTimestamp();

      const closeRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ticket_close').setLabel('Tutup Tiket').setEmoji('🔒').setStyle(ButtonStyle.Danger)
      );

      await ticketChannel.send({ content: `<@${member.id}>`, embeds: [ticketEmbed], components: [closeRow] });
      await interaction.reply({ content: `✅ Tiket berhasil dibuat: <#${ticketChannel.id}>`, ephemeral: true });

      const logEmbed = new EmbedBuilder()
        .setTitle('🎫 Tiket Bantuan Dibuka')
        .setColor(0x57F287)
        .addFields(
          { name: 'Pembuat', value: `${interaction.user.tag} (<@${interaction.user.id}>)`, inline: true },
          { name: 'Channel', value: `<#${ticketChannel.id}>`, inline: true }
        )
        .setTimestamp();

      await sendAuditLog(guild, logEmbed);
    } catch (err) {
      console.error(err);
      interaction.reply({ content: '❌ Gagal membuat channel tiket.', ephemeral: true }).catch(() => {});
    }
    return;
  }

  if (interaction.customId === 'ticket_close') {
    if (interaction.replied || interaction.deferred) return;
    try {
      await interaction.reply({ content: '🔒 Menyimpan transkrip dan menutup tiket dalam **5 detik**...' });
      const channel = interaction.channel;
      const channelName = channel?.name || 'ticket';

      // Ambil seluruh pesan dalam channel tiket (sampai 100 pesan terakhir)
      let fetchedMessages = [];
      try {
        const msgs = await channel.messages.fetch({ limit: 100 });
        fetchedMessages = Array.from(msgs.values()).reverse(); // Urutkan secara kronologis
      } catch (fetchErr) {
        console.error('Gagal fetch pesan tiket:', fetchErr);
      }

      // Deteksi ID pembuat tiket dari topic channel atau nama channel
      const topicMatch = channel?.topic?.match(/Pembuat Tiket:\s*(\d+)/);
      const ticketOwnerId = topicMatch ? topicMatch[1] : null;
      const ownerDisplay = ticketOwnerId ? `<@${ticketOwnerId}>` : channelName.replace(/^ticket-/, '@');

      // Daftar partisipan obrolan
      const participantSet = new Set(fetchedMessages.map(m => `<@${m.author.id}>`));
      const participants = Array.from(participantSet).slice(0, 10).join(', ') || `<@${interaction.user.id}>`;

      // 1. Buat file transkrip HTML modern (bisa dibuka di browser)
      const htmlContent = generateHtmlTranscript(
        channelName,
        guild.name,
        fetchedMessages,
        interaction.user.tag,
        ticketOwnerId ? `<@${ticketOwnerId}>` : channelName
      );
      const transcriptFile = new AttachmentBuilder(Buffer.from(htmlContent, 'utf-8'), {
        name: `transcript-${channelName}.html`
      });

      // 2. Buat file transkrip TXT bersih (bisa langsung dibuka di dalam aplikasi Discord tanpa download)
      const textContent = generateTextTranscript(
        channelName,
        guild.name,
        fetchedMessages,
        interaction.user.tag,
        ownerDisplay
      );
      const transcriptTextFile = new AttachmentBuilder(Buffer.from(textContent, 'utf-8'), {
        name: `transcript-${channelName}.txt`
      });

      // 3. Ringkasan obrolan langsung (preview di chat agar tidak perlu klik apa-apa untuk membaca)
      let chatPreview = '';
      const previewSlice = fetchedMessages.filter(m => m.content && !m.author?.bot).slice(-6);
      if (previewSlice.length > 0) {
        chatPreview = previewSlice.map(m => {
          const time = new Date(m.createdTimestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });
          const name = m.author?.username || 'User';
          const cleanContent = m.content.length > 60 ? m.content.substring(0, 57) + '...' : m.content;
          return `\`[${time}]\` **${name}**: ${cleanContent}`;
        }).join('\n');
      }

      const transcriptEmbed = new EmbedBuilder()
        .setTitle('📑 Transkrip Tiket Bantuan Ditutup')
        .setColor(0x5865F2)
        .addFields(
          { name: 'Nama Tiket', value: `\`${channelName}\``, inline: true },
          { name: 'Pembuat Tiket', value: ownerDisplay, inline: true },
          { name: 'Ditutup Oleh', value: `${interaction.user.tag} (<@${interaction.user.id}>)`, inline: true },
          { name: 'Total Pesan', value: `**${fetchedMessages.length}** pesan`, inline: true },
          { name: 'Partisipan', value: participants, inline: true },
          { name: 'Direct Transcript', value: 'Klik tombol **Buka Transkrip** di bawah untuk membaca langsung.' }
        );

      if (chatPreview) {
        transcriptEmbed.addFields({ name: '💬 Intisari Obrolan (Preview Langsung)', value: chatPreview });
      }

      transcriptEmbed
        .setFooter({ text: 'Ambanime Ticket System • Transkrip Tersimpan' })
        .setTimestamp();

      // Cari channel #transcript-log yang ada di server
      const transcriptLogChannel = guild.channels.cache.find(c => 
        c.isTextBased() && (c.name.toLowerCase().includes('transcript-log') || c.name.toLowerCase().includes('transcript'))
      ) || guild.channels.cache.find(c => c.isTextBased() && c.name.toLowerCase() === LOG_CHANNEL_NAME);

      if (transcriptLogChannel) {
        const sentLogMsg = await transcriptLogChannel.send({
          embeds: [transcriptEmbed],
          files: [transcriptFile, transcriptTextFile]
        }).catch(e => {
          console.error('Gagal kirim transkrip ke transcript-log:', e);
          return null;
        });

        if (sentLogMsg) {
          const directHtmlUrl = sentLogMsg.attachments.find(a => a.name.endsWith('.html'))?.url;
          const directTxtUrl = sentLogMsg.attachments.find(a => a.name.endsWith('.txt'))?.url;

          const actionRow = new ActionRowBuilder();
          if (directHtmlUrl) {
            actionRow.addComponents(
              new ButtonBuilder()
                .setLabel('Buka Transkrip (Direct Link)')
                .setEmoji('🌐')
                .setStyle(ButtonStyle.Link)
                .setURL(directHtmlUrl)
            );
          }
          if (directTxtUrl) {
            actionRow.addComponents(
              new ButtonBuilder()
                .setLabel('Buka Teks Langsung')
                .setEmoji('📄')
                .setStyle(ButtonStyle.Link)
                .setURL(directTxtUrl)
            );
          }

          if (actionRow.components.length > 0) {
            await sentLogMsg.edit({ components: [actionRow] }).catch(() => {});
          }

          // Kirim salinan transkrip ke DM pembuat tiket beserta tombol Direct Link
          if (ticketOwnerId) {
            try {
              const ownerUser = await client.users.fetch(ticketOwnerId).catch(() => null);
              if (ownerUser) {
                await ownerUser.send({
                  content: `Halo <@${ticketOwnerId}>! Tiket bantuan Anda (**#${channelName}**) telah selesai dan ditutup oleh staf. Berikut adalah salinan berkas transkrip obrolan Anda yang bisa langsung dibuka:`,
                  embeds: [transcriptEmbed],
                  files: [transcriptFile, transcriptTextFile],
                  components: actionRow.components.length > 0 ? [actionRow] : []
                }).catch(() => {});
              }
            } catch (e) {}
          }
        }
      }

      recordModStat(interaction.user.id, 'ticket');

      setTimeout(() => {
        if (interaction.channel) interaction.channel.delete().catch(() => {});
      }, 5000);
    } catch (err) {
      console.error('Error saat menutup tiket:', err);
    }
    return;
  }


});

// Penanganan Error Global
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception thrown:', err);
});

// Login Bot
client.login(process.env.DISCORD_TOKEN);
