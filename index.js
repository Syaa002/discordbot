require('dotenv').config();
const { 
  Client, 
  GatewayIntentBits, 
  ActivityType,
  EmbedBuilder 
} = require('discord.js');

// Inisialisasi Discord Client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// Konfigurasi Prefix dari .env (default: .)
const PREFIX = process.env.PREFIX || '.';

client.once('ready', () => {
  console.log(`🤖 Bot berhasil online sebagai: ${client.user.tag}`);
  
  // Set status aktivitas bot
  if (client.user) {
    client.user.setActivity(`${PREFIX}ping`, { type: ActivityType.Listening });
  }
});

client.on('messageCreate', async (message) => {
  // Abaikan pesan dari sesama bot atau pesan non-guild (DM)
  if (message.author.bot || !message.guild) return;

  const content = message.content.trim();

  // Mendukung prefix utama (.) dan prefix awal saat bot dibuat (!)
  let usedPrefix = null;
  if (content.startsWith(PREFIX)) {
    usedPrefix = PREFIX;
  } else if (content.startsWith('!')) {
    usedPrefix = '!';
  }

  if (!usedPrefix) return;

  const args = content.slice(usedPrefix.length).trim().split(/\s+/);
  const command = args.shift().toLowerCase();

  // ==========================================
  // PERINTAH AWAL: PING
  // ==========================================
  if (command === 'ping') {
    try {
      const sent = await message.reply('🏓 Mengukur latensi...');
      const messageLatency = sent.createdTimestamp - message.createdTimestamp;
      const apiLatency = Math.round(client.ws.ping);

      await sent.edit(
        `🏓 **Pong! Bot aktif.**\n` +
        `⏱️ **Latensi Pesan:** \`${messageLatency}ms\`\n` +
        `🌐 **Latensi API:** \`${apiLatency}ms\``
      );
    } catch (err) {
      console.error('Gagal merespons perintah ping:', err);
    }
    return;
  }

  // ==========================================
  // PERINTAH AWAL: STATUS / INFO
  // ==========================================
  if (command === 'status' || command === 'info') {
    try {
      const uptime = process.uptime();
      const hours = Math.floor(uptime / 3600);
      const minutes = Math.floor((uptime % 3600) / 60);
      const seconds = Math.floor(uptime % 60);

      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('ℹ️ Status Bot Ambanime')
        .setDescription('Bot dasar aktif dan siap menerima perintah.')
        .addFields(
          { name: '🤖 Tag Bot', value: `\`${client.user.tag}\``, inline: true },
          { name: '⚡ Prefix', value: `\`${PREFIX}\` / \`!\``, inline: true },
          { name: '⏱️ Uptime', value: `\`${hours}j ${minutes}m ${seconds}d\``, inline: true },
          { name: '🌐 Latensi API', value: `\`${Math.round(client.ws.ping)}ms\``, inline: true }
        )
        .setTimestamp();

      await message.reply({ embeds: [embed] });
    } catch (err) {
      console.error('Gagal merespons status:', err);
    }
    return;
  }
});

// Penanganan error runtime agar bot stabil
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

// Login ke Discord
client.login(process.env.DISCORD_TOKEN);
