require('dotenv').config();
const { 
  Client, 
  GatewayIntentBits, 
  PermissionFlagsBits, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  EmbedBuilder 
} = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

// Nama channel log untuk mencatat aktivitas server
const LOG_CHANNEL_NAME = 'admin-logs';

client.once('ready', () => {
  console.log(`Bot berhasil online sebagai: ${client.user.tag}`);
});

// ==========================================
// 1. SISTEM LOGGING (CATAT PESAN DIHAPUS)
// ==========================================
client.on('messageDelete', async (message) => {
  if (message.partial || message.author?.bot || !message.guild) return;

  const logChannel = message.guild.channels.cache.find(c => c.name === LOG_CHANNEL_NAME);
  if (!logChannel) return;

  const embed = new EmbedBuilder()
    .setTitle('🗑️ Pesan Dihapus')
    .setColor(0xED4245)
    .addFields(
      { name: 'Pengirim', value: `${message.author.tag} (${message.author.id})`, inline: true },
      { name: 'Channel', value: `${message.channel}`, inline: true },
      { name: 'Isi Pesan', value: message.content || '*[Pesan tidak berupa teks/hanya media]*' }
    )
    .setTimestamp();

  logChannel.send({ embeds: [embed] }).catch(() => {});
});

// ==========================================
// 2. COMMAND MODERASI & ANTI-INVITE
// ==========================================
client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;

  // --- ANTI-INVITE FILTER ---
  const inviteRegex = /(https?:\/\/)?(www\.)?(discord\.(gg|io|me|li)|discordapp\.com\/invite)\/[a-zA-Z0-9]+/gi;
  if (inviteRegex.test(message.content)) {
    // Abaikan jika yang mengirim adalah Admin/Moderator (Manage Messages)
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
      await message.delete().catch(() => {});
      const warn = await message.channel.send(`⚠️ ${message.author}, dilarang membagikan link invite server lain di sini!`);
      setTimeout(() => warn.delete().catch(() => {}), 4000);
      return;
    }
  }

  const content = message.content.trim();
  if (!content.startsWith('!')) return;

  const args = content.slice(1).split(/\s+/);
  const command = args[0].toLowerCase();

  // COMMAND 1: !clear [jumlah]
  if (command === 'clear') {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
      return message.reply('❌ Kamu tidak punya izin untuk menghapus pesan!');
    }

    const amount = parseInt(args[1]);
    if (isNaN(amount) || amount < 1 || amount > 100) {
      return message.reply('Masukkan jumlah pesan antara 1 - 100. Contoh: `!clear 10`');
    }

    try {
      await message.channel.bulkDelete(amount + 1, true);
      const notif = await message.channel.send(`✅ Berhasil menghapus ${amount} pesan.`);
      setTimeout(() => notif.delete().catch(() => {}), 3000);
    } catch (err) {
      message.reply('Gagal menghapus pesan (pesan lebih dari 14 hari tidak bisa dihapus massal).');
    }
  }

  // COMMAND 2: !timeout @user [menit] [alasan]
  if (command === 'timeout') {
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      return message.reply('❌ Kamu tidak punya izin untuk memberi timeout!');
    }

    const target = message.mentions.members.first();
    const minutes = parseInt(args[2]);
    const reason = args.slice(3).join(' ') || 'Tidak ada alasan';

    if (!target) return message.reply('Format salah. Contoh: `!timeout @user 10 Toxic saat mabar`');
    if (isNaN(minutes) || minutes <= 0) return message.reply('Masukkan durasi menit yang valid.');

    try {
      await target.timeout(minutes * 60 * 1000, reason);
      message.channel.send(`⏳ **${target.user.tag}** telah di-timeout selama **${minutes} menit**.`);
    } catch (err) {
      message.reply('Gagal timeout. Pastikan posisi role bot berada di atas member tersebut.');
    }
  }

  // COMMAND 3: !kick @user [alasan]
  if (command === 'kick') {
    if (!message.member.permissions.has(PermissionFlagsBits.KickMembers)) {
      return message.reply('❌ Kamu tidak punya izin untuk melakukan kick!');
    }

    const target = message.mentions.members.first();
    const reason = args.slice(2).join(' ') || 'Melanggar aturan komunitas';

    if (!target) return message.reply('Sebutkan member yang ingin di-kick. Contoh: `!kick @user Spam`');
    if (!target.kickable) return message.reply('Bot tidak bisa meng-kick member ini (posisi role terlalu tinggi).');

    try {
      await target.kick(reason);
      message.channel.send(`👢 **${target.user.tag}** berhasil dikeluarkan.`);
    } catch (err) {
      message.reply('Gagal mengeluarkan member.');
    }
  }

  // COMMAND 4: !ban @user [alasan]
  if (command === 'ban') {
    if (!message.member.permissions.has(PermissionFlagsBits.BanMembers)) {
      return message.reply('❌ Kamu tidak punya izin untuk mem-ban member!');
    }

    const target = message.mentions.members.first();
    const reason = args.slice(2).join(' ') || 'Pelanggaran fatal';

    if (!target) return message.reply('Sebutkan member yang ingin di-ban. Contoh: `!ban @user Rusuh`');
    if (!target.bannable) return message.reply('Bot tidak bisa mem-ban member ini.');

    try {
      await target.ban({ reason });
      message.channel.send(`🔨 **${target.user.tag}** berhasil di-ban permanen.`);
    } catch (err) {
      message.reply('Gagal mem-ban member.');
    }
  }

  // COMMAND 5: !setuproles (Menampilkan panel tombol ambil role)
  if (command === 'setuproles') {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply('❌ Hanya Administrator yang bisa menggunakan perintah ini.');
    }

    const embed = new EmbedBuilder()
      .setTitle('🎭 Pilih Peran Komunitas Anda')
      .setDescription('Klik tombol di bawah ini untuk mengambil atau melepas role minat Anda. Anda akan mendapatkan tag/notifikasi sesuai kategori yang dipilih!')
      .setColor(0x5865F2);

    const buttons = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('role_gamer')
        .setLabel('Gamer')
        .setEmoji('🎮')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('role_anime')
        .setLabel('Wibu / Anime')
        .setEmoji('🍿')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('role_editor')
        .setLabel('Editor')
        .setEmoji('🎬')
        .setStyle(ButtonStyle.Danger)
    );

    await message.channel.send({ embeds: [embed], components: [buttons] });
    message.delete().catch(() => {});
  }
});

// ==========================================
// 3. INTERAKSI TOMBOL AUTO-ROLE (TOGGLE)
// ==========================================
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;

  const roleMap = {
    'role_gamer': 'Gamer',
    'role_anime': 'Anime',
    'role_editor': 'Editor'
  };

  const roleName = roleMap[interaction.customId];
  if (!roleName) return;

  const role = interaction.guild.roles.cache.find(r => r.name.toLowerCase() === roleName.toLowerCase());

  if (!role) {
    return interaction.reply({ 
      content: `⚠️ Role bernama **${roleName}** belum dibuat di Server Settings Discord. Minta admin membuatnya terlebih dahulu.`, 
      ephemeral: true 
    });
  }

  const member = interaction.member;

  // Toggle role: Jika sudah punya maka dihapus, jika belum punya maka ditambahkan
  if (member.roles.cache.has(role.id)) {
    await member.roles.remove(role);
    return interaction.reply({ content: `Role **${role.name}** telah dihapus dari profilmu.`, ephemeral: true });
  } else {
    await member.roles.add(role);
    return interaction.reply({ content: `Role **${role.name}** berhasil ditambahkan ke profilmu!`, ephemeral: true });
  }
});

client.login(process.env.DISCORD_TOKEN);