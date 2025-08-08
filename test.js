console.log("Starting bot...");

const {
  Client,
  GatewayIntentBits,
  Partials,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionsBitField,
  ActivityType,
  Collection,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} = require("discord.js");
const fs = require('fs');
const { spawn } = require('child_process');
const { createCanvas, loadImage } = require("canvas");
const express = require("express");
require("dotenv").config();

const trackedUsers = new Set();
const OWNER_ID = process.env.OWNER_ID;

// Basic feeds (keep existing functionality)
const feeds = new Map();
const intervals = new Map();
const FEEDS_FILE = './feeds.json';

// Enhanced feeds
const enhancedFeeds = new Map();
const enhancedIntervals = new Map();
const ENHANCED_FEEDS_FILE = './enhanced-feeds.json';

// Temporary storage for modal data
const tempModalData = new Map();

// Load basic feeds
if (fs.existsSync(FEEDS_FILE)) {
  const data = JSON.parse(fs.readFileSync(FEEDS_FILE));
  for (const feed of data) feeds.set(feed.name, feed);
}

// Load enhanced feeds
if (fs.existsSync(ENHANCED_FEEDS_FILE)) {
  try {
    const data = JSON.parse(fs.readFileSync(ENHANCED_FEEDS_FILE, 'utf8'));
    data.forEach(feed => {
      enhancedFeeds.set(feed.id, feed);
    });
    console.log(`📡 Loaded ${enhancedFeeds.size} enhanced autofeeds`);
  } catch (error) {
    console.error('Error loading enhanced feeds:', error);
  }
}

const saveFeeds = () => {
  fs.writeFileSync(FEEDS_FILE, JSON.stringify(Array.from(feeds.entries()), null, 2));
};

const saveEnhancedFeeds = () => {
  try {
    const feedsArray = Array.from(enhancedFeeds.values());
    fs.writeFileSync(ENHANCED_FEEDS_FILE, JSON.stringify(feedsArray, null, 2));
  } catch (error) {
    console.error('Error saving enhanced feeds:', error);
  }
};

// Basic feed functions (keep existing)
const startFeed = (feed) => {
  if (intervals.has(feed.name)) clearInterval(intervals.get(feed.name));
  const interval = setInterval(() => {
    const channel = client.channels.cache.get(feed.channelId);
    if (channel) channel.send(feed.content);
  }, feed.interval * 60 * 1000);
  intervals.set(feed.name, interval);
};

const stopFeed = (name) => {
  if (intervals.has(name)) {
    clearInterval(intervals.get(name));
    intervals.delete(name);
  }
};

// Enhanced feed functions
const createEnhancedFeed = (config) => {
  const feedId = Date.now().toString();
  const feedConfig = {
    id: feedId,
    name: config.name,
    interval: config.interval,
    serverId: config.serverId,
    channelId: config.channelId,
    embed: {
      title: config.title || null,
      titleUrl: config.titleUrl || null,
      description: config.description || null,
      color: config.color || '#3b82f6',
      thumbnail: config.thumbnail || null,
      footer: config.footer || null
    },
    active: true,
    createdAt: new Date().toISOString(),
    lastPosted: null
  };

  enhancedFeeds.set(feedId, feedConfig);
  saveEnhancedFeeds();
  
  if (feedConfig.active) {
    startEnhancedFeed(feedId);
  }
  
  return feedConfig;
};

const startEnhancedFeed = (id) => {
  const feed = enhancedFeeds.get(id);
  if (!feed) return false;

  if (enhancedIntervals.has(id)) {
    clearInterval(enhancedIntervals.get(id));
  }

  const interval = setInterval(async () => {
    await postEnhancedFeed(id);
  }, feed.interval * 60 * 1000);

  enhancedIntervals.set(id, interval);
  console.log(`▶️ Started enhanced feed: ${feed.name} (every ${feed.interval} minutes)`);
  return true;
};

const stopEnhancedFeed = (id) => {
  if (enhancedIntervals.has(id)) {
    clearInterval(enhancedIntervals.get(id));
    enhancedIntervals.delete(id);
    
    const feed = enhancedFeeds.get(id);
    if (feed) {
      console.log(`⏹️ Stopped enhanced feed: ${feed.name}`);
    }
    return true;
  }
  return false;
};

const postEnhancedFeed = async (id) => {
  const feed = enhancedFeeds.get(id);
  if (!feed || !feed.active) return;

  try {
    const channel = client.channels.cache.get(feed.channelId);
    if (!channel) {
      console.error(`Channel ${feed.channelId} not found for feed ${feed.name}`);
      return;
    }

    const embed = new EmbedBuilder();

    if (feed.embed.title) {
      embed.setTitle(feed.embed.title);
      if (feed.embed.titleUrl) {
        embed.setURL(feed.embed.titleUrl);
      }
    }
    if (feed.embed.description) embed.setDescription(feed.embed.description);
    if (feed.embed.color) {
      const colorNumber = parseInt(feed.embed.color.replace('#', ''), 16);
      embed.setColor(colorNumber);
    }
    if (feed.embed.thumbnail) embed.setThumbnail(feed.embed.thumbnail);
    if (feed.embed.footer) embed.setFooter({ text: feed.embed.footer });
    
    embed.setTimestamp();

    await channel.send({ embeds: [embed] });

    feed.lastPosted = new Date().toISOString();
    saveEnhancedFeeds();

    console.log(`📤 Posted enhanced feed: ${feed.name} to #${channel.name}`);
  } catch (error) {
    console.error(`Error posting enhanced feed ${feed.name}:`, error);
  }
};

// Initialize client with necessary intents and partials
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

client.once("ready", () => {
  const app = express();
  app.use(express.json());
  const path = require("path");

  app.use(express.static("public"));

  app.get("/feeds", (req, res) => {
    const allFeeds = Array.from(feeds.entries()).map(([name, feed]) => ({
      name,
      interval: feed.interval,
      content: feed.content,
      channelId: feed.channelId,
      title: feed.title,
      footer: feed.footer,
      url: feed.url,
    }));
    res.json(allFeeds);
  });

  app.get("/enhanced-feeds", (req, res) => {
    const allEnhancedFeeds = Array.from(enhancedFeeds.values());
    res.json(allEnhancedFeeds);
  });

  // Fixed API endpoint for creating enhanced autofeeds
  app.post('/api/autofeed', (req, res) => {
    try {
      const { serverId, channelId, intervalMinutes, title, description, color, thumbnailUrl, footerText } = req.body;
      
      // Validate required fields
      if (!channelId || !intervalMinutes) {
        return res.status(400).json({ error: 'Missing required fields: channelId, intervalMinutes' });
      }

      // Create the enhanced autofeed
      const feedConfig = createEnhancedFeed({
        name: `Web Feed ${Date.now()}`,
        interval: intervalMinutes,
        serverId: serverId || 'unknown',
        channelId: channelId,
        title: title || 'Autofeed Message',
        description: description || 'This is an automated message',
        color: color || '#3b82f6',
        thumbnail: thumbnailUrl,
        footer: footerText
      });
      
      res.json({ success: true, feedId: feedConfig.id, feedName: feedConfig.name });
    } catch (error) {
      console.error('Error creating autofeed:', error);
      res.status(500).json({ error: 'Failed to create autofeed', details: error.message });
    }
  });

  const PORT = process.env.PORT || 8080;
  app.listen(PORT, () => console.log(`🌐 Web UI running at http://localhost:${PORT}`));

  console.log(`🤖 Bot logged in as ${client.user.tag}`);
  
  // Log guild information for debugging
  console.log(`📊 Bot is in ${client.guilds.cache.size} guild(s):`);
  client.guilds.cache.forEach(guild => {
    console.log(`  - ${guild.name} (ID: ${guild.id}) - ${guild.memberCount} members`);
  });
  
  if (client.guilds.cache.size === 0) {
    console.log(`⚠️  Bot is not in any guilds! Check your bot invite link and permissions.`);
    console.log(`📋 Invite URL: https://discord.com/api/oauth2/authorize?client_id=${process.env.CLIENT_ID}&permissions=8&scope=bot%20applications.commands`);
  }
  
  client.user.setPresence({
    activities: [{ name: "$AMD", type: ActivityType.Watching }],
    status: "online",
  });

  // Start basic feeds
  for (const feed of feeds.values()) startFeed(feed);
  
  // Start enhanced feeds
  for (const [id, feed] of enhancedFeeds) {
    if (feed.active) {
      startEnhancedFeed(id);
    }
  }
});

// Map of lowercase trigger words to emoji IDs or unicode
const reactionsMap = {
  prescient: ["👋", "😄"],
  meta: ["1396180069247877140"],
  amazon: ["1396990904413458442"],
  amzn: ["1396990904413458442"],
  w: ["1396180077892473003"],
  apple: ["1396189085193863208"],
  appl: ["1396988469020069888"],
  nvda: ["1396990046824829008"],
  nvidia: ["1396990046824829008"],
  msft: ["1396990986999304333"],
  microsoft: ["1396990986999304333"],
  tesla: ["1396991046738509977"],
  tsla: ["1396991046738509977"],
  bitcoin: ["1396990947409137725"],
  btc: ["1396990947409137725"],
  google: ["1396990972583350383"],
  googl: ["1396990972583350383"],
  rip: ["1388735693072891994"],
  gamestop: ["1396994350155694170"],
  gme: ["1396994350155694170"],
  amd: ["1400596424227557467"],
  qqq: ["1400503221386219694"],
  spy: ["1400507113532297236"],
  spx: ["1400507113532297236"],
  affrm: ["1402008230955192525"],
  affirm: ["1402008230955192525"],
  afrm: ["1402008230955192525"],
  nike: ["1402316087596548156"],
  nke: ["1402316087596548156"]
};

// Map of phrases/sentences to emoji reactions
const phrasesMap = {
  "to the moon": ["🚀", "🌙"],
  "diamond hands": ["💎", "🙌"],
  "paper hands": ["📄", "🙌"],
  "stonks": ["📈", "💰"],
  "this is the way": ["✅", "🔥"],
  "wen lambo": ["🏎️", "💰"],
  "buy the dip": ["📉", "💰"],
  "hodl": ["💎", "🤝"],
  "good morning": ["☀️", "👋"],
  "good night": ["🌙", "😴"],
  "lets go": ["🚀", "💪"],
  "bullish": ["🐂", "📈"],
  "bearish": ["🐻", "📉"],
  "just do it": ["1402316087596548156"]
};

client.on("messageCreate", async (message) => {
  if (message.author.bot || !message.content) return;
  const msgLower = message.content.toLowerCase().trim();

  // !restart — only owner or users with Admin role
  if (message.content === '!restart') {
    const isOwner = message.author.id === OWNER_ID;
    const isAdmin = message.member.roles.cache.some(r => r.name === 'Admin');

    if (!isOwner && !isAdmin) {
      return message.reply('You need to be the bot owner or have the Admin role to do that.');
    }

    try {
      await message.reply('Bot successfully restarted!');

      // re-launch the same script with the same args
      const args = process.argv.slice(1);
      const subprocess = spawn(process.execPath, args, {
        detached: true,
        stdio: 'inherit'
      });
      subprocess.unref();

      process.exit(0);
    } catch (err) {
      console.error('Restart failed:', err);
      message.reply('Check the panel for bug');
    }
    return;
  }

  // !howgay — random rainbow percent
  if (msgLower.startsWith('!howgay')) {
    const target = message.mentions.users.first() || message.author;
    const percent = Math.floor(Math.random() * 101);
    const replies = [
      `🌈 ${target} is **${percent}%** gay today! 💅`,
      `💖 ${target} is radiating ${percent}% rainbow energy.`,
      `🏳️‍🌈 Scan complete... ${target} is ${percent}% gaeeee.`,
      `✨ ${target} is officially ${percent}% sparkling-gay.`
    ];
    return message.channel.send(replies[Math.floor(Math.random() * replies.length)]);
  }

  // !clown — start auto-clowning
  if (msgLower.startsWith('!clown')) {
    const user = message.mentions.users.first();
    if (!user) return message.reply('❌ Tag someone to clown!');
    trackedUsers.add(user.id);
    return message.channel.send(`🤡 Now clowning <@${user.id}>`);
  }

  // !stopclown — stop auto-clowning
  if (msgLower.startsWith('!stopclown')) {
    const user = message.mentions.users.first();
    if (!user) return message.reply('❌ Tag someone to stop clowning!');
    trackedUsers.delete(user.id);
    return message.channel.send(`🛑 Stopped clowning <@${user.id}>`);
  }

  // Auto-react 🤡 to tracked users
  if (trackedUsers.has(message.author.id)) {
    try { await message.react('🤡'); } catch (err) { console.error(err); }
    return;
  }

  // Check for phrase/sentence triggers first
  for (const [phrase, emojis] of Object.entries(phrasesMap)) {
    if (msgLower.includes(phrase)) {
      for (const emoji of emojis) {
        try { await message.react(emoji); } catch (err) { console.error(err); }
      }
      break;
    }
  }

  // Auto-react to any message containing trigger words (whole word match)
  for (const [trigger, emojis] of Object.entries(reactionsMap)) {
    const pattern = new RegExp(`\\b${trigger}\\b`, 'i');
    if (pattern.test(message.content)) {
      for (const emoji of emojis) {
        try { await message.react(emoji); } catch (err) { console.error(err); }
      }
      break;
    }
  }
});

// Quote image on reaction
client.on("messageReactionAdd", async (reaction, user) => {
  if (user.bot) return;
  if (reaction.partial) {
    try { await reaction.fetch(); } catch { return; }
  }
  if (reaction.emoji.name !== "💵") return;
  const message = reaction.message;
  if (message.partial) {
    try { await message.fetch(); } catch { return; }
  }
  const author = message.author;
  if (!author || !message.content) return;

  const canvas = createCanvas(1000, 500);
  const ctx = canvas.getContext("2d");

  // Background
  ctx.fillStyle = "#2C2F33";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Avatar
  const avatarURL = author.displayAvatarURL({ extension: "png", size: 128 });
  const avatar = await loadImage(avatarURL);
  ctx.drawImage(avatar, 20, 20, 64, 64);

  // Username label
  ctx.fillStyle = "#fff";
  ctx.font = "20px sans-serif";
  ctx.fillText(`${author.username}:`, 100, 40);

  // Quote text
  const quote = message.content.length > 100
    ? message.content.slice(0, 97) + "..."
    : message.content;
  ctx.font = "18px sans-serif";
  ctx.fillText(`"${quote}"`, 100, 80);

  // Send image
  await message.channel.send({
    content: `📌 Quote from ${author}`,
    files: [{ attachment: canvas.toBuffer(), name: "quote.png" }],
  });
});

// Handle all interactions (commands and modals)
client.on("interactionCreate", async (interaction) => {
  // Handle modal submissions
  if (interaction.isModalSubmit()) {
    if (interaction.customId === 'enhanced_autofeed_modal') {
      if (interaction.user.id !== OWNER_ID) {
        return interaction.reply({ content: '❌ Only the bot owner can use this command.', ephemeral: true });
      }

      try {
        // Parse combined fields
        const colorNameInput = interaction.fields.getTextInputValue('feed_color_name');
        const intervalChannelInput = interaction.fields.getTextInputValue('feed_interval_channel');
        const titleUrlInput = interaction.fields.getTextInputValue('feed_title_url') || '';
        const description = interaction.fields.getTextInputValue('feed_description') || 'This is an automated message';
        const footer = interaction.fields.getTextInputValue('feed_footer') || null;

        // Parse color and name
        const [colorStr, name] = colorNameInput.split('|').map(s => s.trim());
        if (!name) {
          return interaction.reply({ content: '❌ Please provide both color and name separated by |', ephemeral: true });
        }

        // Parse interval and channel
        const [intervalStr, channelId] = intervalChannelInput.split('|').map(s => s.trim());
        if (!intervalStr || !channelId) {
          return interaction.reply({ content: '❌ Please provide both interval and channel ID separated by |', ephemeral: true });
        }

        // Parse title and title URL
        const [title, titleUrl] = titleUrlInput.split('|').map(s => s.trim());

        const interval = parseInt(intervalStr);
        if (isNaN(interval) || interval < 1) {
          return interaction.reply({ content: '❌ Interval must be a positive number.', ephemeral: true });
        }

        // Check if channel exists
        const channel = client.channels.cache.get(channelId);
        if (!channel) {
          return interaction.reply({ content: '❌ Channel not found. Make sure the channel ID is correct.', ephemeral: true });
        }

        const finalColor = colorStr || '#3b82f6';
        
        const feedConfig = createEnhancedFeed({
          name,
          interval,
          serverId: interaction.guild?.id || 'unknown',
          channelId,
          title: title || 'Autofeed Message',
          titleUrl: titleUrl || null,
          description,
          color: finalColor,
          footer: footer
        });

        await interaction.reply({
          content: `✅ Enhanced autofeed **${feedConfig.name}** created and started! Posting every ${interval} minutes in ${channel}.`,
          ephemeral: true
        });
      } catch (error) {
        console.error('Enhanced autofeed creation error:', error);
        await interaction.reply({
          content: '❌ Error creating enhanced autofeed: ' + error.message,
          ephemeral: true
        });
      }
    }
    return;
  }

  // Handle slash commands
  if (!interaction.isChatInputCommand()) return;
  const cmd = interaction.commandName;

  if (cmd === "clown") {
    const target = interaction.options.getUser("target");
    trackedUsers.add(target.id);
    return interaction.reply(`🤡 Now clowning <@${target.id}>`);
  }
  
  if (cmd === "stopclown") {
    const target = interaction.options.getUser("target");
    trackedUsers.delete(target.id);
    return interaction.reply(`🛑 Stopped clowning <@${target.id}>`);
  }
  
  if (cmd === "howgay") {
    const target = interaction.options.getUser("target");
    const user = target || interaction.user;
    const percent = Math.floor(Math.random() * 101);
    const replies = [
      `🌈 ${user} is feeling **${percent}%** gay today! 💅`,
      `💖 ${user} is radiating ${percent}% rainbow energy.`,
      `🏳️‍🌈 Scan complete... ${user} is ${percent}% gaeeee.`,
      `${user} is officially ${percent}% sparkling-gayyy.✨`,
    ];
    return interaction.reply(replies[Math.floor(Math.random() * replies.length)]);
  }
  
  if (cmd === "whoasked") {
    const target = interaction.options.getUser("target");
    await interaction.deferReply();
    const memes = [
      "https://cdn.discordapp.com/attachments/1372246994193748161/1396267361857966232/bmc.png?ex=687d76d0&is=687c2550&hm=f4b2f826aef9e88aa3a44271e0bfc18223571a72c7209804401ef3f46d131bb8&",
      "https://cdn.discordapp.com/attachments/1372246994193748161/1396267953254695076/LmpwZw.png?ex=687d775d&is=687c25dd&hm=a9d42886385242336afab9ada6a53ea0ac035d58b5af5b3f3fbf6fd524c5f883&",
      "https://cdn.discordapp.com/attachments/1372246994193748161/1396268158796431410/LmpwZw.png?ex=687d778e&is=687c260e&hm=d876cd453b37c7baf977af404379418cfb2e69c49125a387e927aa1600e70322&",
      "https://cdn.discordapp.com/attachments/1372246994193748161/1396271428759851179/LmpwZWc.png?ex=687d7a9a&is=687c291a&hm=c3764ffd1921c0bf248248e478fb6b43637da76be8aee128ab2b4892cfb8c086&",
      "https://cdn.discordapp.com/attachments/1372246994193748161/1396273925691801691/ZWQuZ2lm.png?ex=687d7ced&is=687c2b6d&hm=f6077e1a9cb17b7610e45da89b6f4e6e3a32e83cd7989eef833cf112e45d411c&"
    ];
    const meme = memes[Math.floor(Math.random() * memes.length)];
    return interaction.editReply({
      embeds: [{
        title: "🔍 No one asked",
        description: `❌ <@${target.id}>, nobody asked.`,
        image: { url: meme },
        color: 0xff0000,
      }],
    });
  }
  
  // /say
  if (cmd === "say") {
    const txt = interaction.options.getString("message");
    if (txt.includes("@everyone") || txt.includes("@here"))
      return interaction.reply({ content: "❌ No mass pings.", ephemeral: true });
    await interaction.reply({ content: "✅ Sent.", ephemeral: true });
    return interaction.channel.send(txt);
  }

  // /dm - Send direct message to user
  if (cmd === "dm") {
    const targetUser = interaction.options.getUser("user");
    const message = interaction.options.getString("message");
    
    try {
      await targetUser.send(message);
      return interaction.reply({ content: `✅ DM sent to ${targetUser.username}`, ephemeral: true });
    } catch (error) {
      return interaction.reply({ content: `❌ Couldn't send DM to ${targetUser.username}. They might have DMs disabled.`, ephemeral: true });
    }
  }

  // Enhanced autofeed commands
  if (cmd === "enhanced-create") {
    if (interaction.user.id !== OWNER_ID) {
      return interaction.reply({ content: '❌ Only the bot owner can use this command.', ephemeral: true });
    }

    try {
      console.log('Creating enhanced autofeed modal...');
      
      // Get options from slash command
      const colorOption = interaction.options.getString('color');
      const thumbnailOption = interaction.options.getString('thumbnail');
      const titleOption = interaction.options.getString('title');
      
      // Store these options temporarily (you might want to use a better storage method)
      interaction.tempOptions = {
        color: colorOption,
        thumbnail: thumbnailOption,
        title: titleOption
      };
      
      // Create modal for enhanced autofeed creation
      const modal = new ModalBuilder()
        .setCustomId('enhanced_autofeed_modal')
        .setTitle('Create Enhanced Autofeed');

      // Row 1: Color and Name (combined in one row for efficiency)
      const colorAndNameInput = new TextInputBuilder()
        .setCustomId('feed_color_name')
        .setLabel('Color (hex) | Name (separated by |)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('#ff0000|My Autofeed Name')
        .setRequired(true);

      // Row 2: Interval and Channel ID
      const intervalAndChannelInput = new TextInputBuilder()
        .setCustomId('feed_interval_channel')
        .setLabel('Interval (min) | Channel ID (separated by |)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('60|1234567890123456789')
        .setRequired(true);

      // Row 3: Title and Title URL
      const titleAndUrlInput = new TextInputBuilder()
        .setCustomId('feed_title_url')
        .setLabel('Title | Title URL (separated by |)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('My Title|https://example.com (URL optional)')
        .setRequired(false);

      // Row 4: Description
      const descriptionInput = new TextInputBuilder()
        .setCustomId('feed_description')
        .setLabel('Description')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Description for the embed')
        .setRequired(true);

      // Row 5: Footer
      const footerInput = new TextInputBuilder()
        .setCustomId('feed_footer')
        .setLabel('Footer Text (optional)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Footer text for the embed')
        .setRequired(false);

      const row1 = new ActionRowBuilder().addComponents(colorAndNameInput);
      const row2 = new ActionRowBuilder().addComponents(intervalAndChannelInput);
      const row3 = new ActionRowBuilder().addComponents(titleAndUrlInput);
      const row4 = new ActionRowBuilder().addComponents(descriptionInput);
      const row5 = new ActionRowBuilder().addComponents(footerInput);

      modal.addComponents(row1, row2, row3, row4, row5);

      console.log('Showing modal to user...');
      await interaction.showModal(modal);
      console.log('Modal shown successfully');
    } catch (error) {
      console.error('Error showing modal:', error);
      await interaction.reply({ 
        content: '❌ Error showing modal: ' + error.message, 
        ephemeral: true 
      });
    }
    return;
  }

  if (cmd === "enhanced-list") {
    const feedsArray = Array.from(enhancedFeeds.values());
    if (feedsArray.length === 0) {
      return interaction.reply('📭 No enhanced autofeeds configured.');
    }

    const feedList = feedsArray.map(feed => {
      const status = feed.active ? '🟢' : '🔴';
      const channel = client.channels.cache.get(feed.channelId);
      const channelName = channel ? `#${channel.name}` : 'Unknown Channel';
      return `${status} **${feed.name}** - Every ${feed.interval}m in ${channelName}`;
    }).join('\n');

    return interaction.reply(`📡 **Enhanced Autofeeds:**\n${feedList}`);
  }

  if (cmd === "enhanced-delete") {
    if (interaction.user.id !== OWNER_ID) {
      return interaction.reply({ content: '❌ Only the bot owner can use this command.', ephemeral: true });
    }

    try {
      const name = interaction.options.getString('name');
      const feedsArray = Array.from(enhancedFeeds.values());
      const feed = feedsArray.find(f => f.name.toLowerCase() === name.toLowerCase());
      
      if (!feed) {
        return interaction.reply({ content: `❌ Autofeed "${name}" not found.`, ephemeral: true });
      }

      stopEnhancedFeed(feed.id);
      enhancedFeeds.delete(feed.id);
      saveEnhancedFeeds();
      return interaction.reply(`🗑️ Enhanced autofeed "${name}" deleted.`);
    } catch (error) {
      console.error('Enhanced delete error:', error);
      return interaction.reply({ content: `❌ Error: ${error.message}`, ephemeral: true });
    }
  }

  if (cmd === "enhanced-toggle") {
    if (interaction.user.id !== OWNER_ID) {
      return interaction.reply({ content: '❌ Only the bot owner can use this command.', ephemeral: true });
    }

    try {
      const name = interaction.options.getString('name');
      const feedsArray = Array.from(enhancedFeeds.values());
      const feed = feedsArray.find(f => f.name.toLowerCase() === name.toLowerCase());
      
      if (!feed) {
        return interaction.reply({ content: `❌ Autofeed "${name}" not found.`, ephemeral: true });
      }

      feed.active = !feed.active;
      saveEnhancedFeeds();

      if (feed.active) {
        startEnhancedFeed(feed.id);
      } else {
        stopEnhancedFeed(feed.id);
      }

      const status = feed.active ? 'enabled' : 'disabled';
      return interaction.reply(`🔄 Autofeed "${name}" ${status}.`);
    } catch (error) {
      console.error('Enhanced toggle error:', error);
      return interaction.reply({ content: `❌ Error: ${error.message}`, ephemeral: true });
    }
  }

  if (cmd === "enhanced-status") {
    const feedsArray = Array.from(enhancedFeeds.values());
    if (feedsArray.length === 0) {
      return interaction.reply('📭 No enhanced autofeeds configured.');
    }

    const embed = {
      title: '📡 Enhanced Autofeed Status',
      fields: feedsArray.map(feed => {
        const channel = client.channels.cache.get(feed.channelId);
        const channelName = channel ? `#${channel.name}` : 'Unknown Channel';
        const status = feed.active ? '🟢 Active' : '🔴 Inactive';
        const lastPosted = feed.lastPosted ? 
          `<t:${Math.floor(new Date(feed.lastPosted).getTime() / 1000)}:R>` : 
          'Never';
        
        return {
          name: feed.name,
          value: `${status}\n**Channel:** ${channelName}\n**Interval:** ${feed.interval} minutes\n**Last Posted:** ${lastPosted}`,
          inline: true
        };
      }),
      color: 0x3b82f6,
      timestamp: new Date()
    };

    return interaction.reply({ embeds: [embed] });
  }
});

// Register slash commands
const commands = [
  new SlashCommandBuilder()
    .setName("clown")
    .setDescription("Start clowning a user")
    .addUserOption((option) =>
      option.setName("target").setDescription("User to clown").setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName("stopclown")
    .setDescription("Stop clowning a user")
    .addUserOption((option) =>
      option.setName("target").setDescription("User to stop clowning").setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName("howgay")
    .setDescription("Check how gay someone is")
    .addUserOption((option) =>
      option.setName("target").setDescription("User to scan (optional)").setRequired(false)
    ),
  new SlashCommandBuilder()
    .setName("whoasked")
    .setDescription("Politely reminds someone nobody asked")
    .addUserOption((option) =>
      option.setName("target").setDescription("User to call out").setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName("say")
    .setDescription("Make the bot say something")
    .addStringOption((option) =>
      option.setName("message")
        .setDescription("The message to send")
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName("dm")
    .setDescription("Send a direct message to a user")
    .addUserOption((option) =>
      option.setName("user")
        .setDescription("User to send DM to")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option.setName("message")
        .setDescription("Message to send")
        .setRequired(true)
    ),

  // Enhanced autofeed commands
  new SlashCommandBuilder()
    .setName('enhanced-create')
    .setDescription('Create an enhanced autofeed (opens modal form)'),

  new SlashCommandBuilder()
    .setName('enhanced-list')
    .setDescription('List all enhanced autofeeds'),

  new SlashCommandBuilder()
    .setName('enhanced-delete')
    .setDescription('Delete an enhanced autofeed')
    .addStringOption(option =>
      option.setName('name')
        .setDescription('Name of the autofeed to delete')
        .setRequired(true)),

  new SlashCommandBuilder()
    .setName('enhanced-toggle')
    .setDescription('Toggle an autofeed on/off')
    .addStringOption(option =>
      option.setName('name')
        .setDescription('Name of the autofeed to toggle')
        .setRequired(true)),

  new SlashCommandBuilder()
    .setName('enhanced-status')
    .setDescription('Show detailed status of autofeeds')

].map(cmd => cmd.toJSON());

const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

(async () => {
  try {
    console.log("🔁 Registering slash commands...");
    
    // Try guild-specific registration first (instant) if GUILD_ID is provided
    if (process.env.GUILD_ID) {
      console.log(`📍 Registering to guild: ${process.env.GUILD_ID}`);
      await rest.put(
        Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
        { body: commands }
      );
      console.log("✅ Guild slash commands registered instantly!");
    } else {
      // Fall back to global registration (takes up to 1 hour)
      console.log("🌍 Registering global commands (may take up to 1 hour)...");
      await rest.put(
        Routes.applicationCommands(process.env.CLIENT_ID),
        { body: commands }
      );
      console.log("✅ Global slash commands registered!");
    }
  } catch (err) {
    console.error("❌ Slash command registration failed:", err);
    console.error("Make sure CLIENT_ID, TOKEN, and optionally GUILD_ID are set in your .env file");
  }
})();

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('🛑 Shutting down...');
  for (const id of enhancedIntervals.keys()) {
    stopEnhancedFeed(id);
  }
  process.exit(0);
});

client.login(process.env.TOKEN);







