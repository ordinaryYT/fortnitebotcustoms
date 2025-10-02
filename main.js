const { Client } = require('discord.js');
const { Fortnite } = require('epicgames-fortnite-client');
const fs = require('fs');
const request = require('request');

const client = new Client();

const MIN_PLAYERS = 2;
const PUBLIC_CHANNEL_ID = '617341908884389908';  // change to your Discord channel IDs
const ADMIN_CHANNEL_ID = '650615163283570689';

let players = [];
let itemList = '';

const fortnite = new Fortnite({
  debugger: () => {},
  credentials: {
    deviceAuth: {
      device_id: process.env.FN_DEVICE_ID,
      account_id: process.env.FN_ACCOUNT_ID,
      secret: process.env.FN_SECRET
    }
  },
  settings: {
    platform: "WIN",
  }
});

// --- Discord Bot ---
client.on('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`);
  client.user.setActivity("FNTR Queue", { type: "PLAYING" });
});

// Get new cosmetics list
request('https://benbotfn.tk/api/v1/newCosmetics', { json: true }, (err, res, body) => {
  if (err) return;
  let newItems = body.items || [];
  for (const item of newItems) {
    if (item.backendType === "AthenaDance" || item.backendType === "AthenaCharacter") {
      itemList += `**${item.name}:** ${item.id}\n`;
    }
  }
});

// --- Fortnite Bot ---
(async () => {
  await fortnite.login();
  await fortnite.party.setPlaylist("playlist_respawn_24"); // default Team Rumble
  await fortnite.me.setCharacter("CID_754_Athena_Commando_F_RaveNinja");
  await fortnite.me.setBanner("OtherBanner28", "DefaultColor1", 1000);
  await fortnite.party.sendPartyPresence("Lobby bot for FNTR Official\n 24/7 Lobbies\n Join at discord.gg/fntr");
  await fortnite.me.setReadiness("SittingOut");

  // Auto-accept friend requests
  fortnite.stream.on('friend:request', async req => {
    await req.accept();
  });

  // Member joined
  fortnite.stream.on('party:member:joined', async (member) => {
    try {
      const account = await fortnite.account.fetch(member.id);
      console.log(`${account.displayName} joined (${account.id})`);
      players.push(account.id);

      // blacklist check
      fs.readFile('./blacklist.json', 'utf8', (err, data) => {
        if (err) return;
        const banned = JSON.parse(data);
        if (banned.users.includes(account.id)) {
          fortnite.party.kick(account.id);
        }
      });

      if (players.length >= MIN_PLAYERS) {
        setTimeout(() => {
          fortnite.party.leave(true);
          players = [];
        }, 5000);
      }
    } catch (err) {
      console.error("Error handling join:", err);
    }
  });

  // Member left
  fortnite.stream.on('party:member:left', async (member) => {
    await fortnite.party.sendPartyPresence("Lobby bot for FNTR Official\n 24/7 Lobbies\n Join at discord.gg/fntr");
    players = players.filter(p => p !== member.id);
  });

  // Whisper / DM commands
  fortnite.stream.on('friend:message', async (msg) => {
    const args = msg.body.split(" ");
    switch (args[0]) {
      case "!skin":
        await fortnite.me.setCharacter(args[1]);
        msg.reply("Skin set to " + args[1]);
        break;
      case "!emote":
        await fortnite.me.setEmote(args[1]);
        msg.reply("Emote set to " + args[1]);
        break;
      case "!discord":
        msg.reply("Join the discord at discord.gg/fntr");
        break;
    }
  });
})();

// --- Discord message commands ---
client.on('message', async (message) => {
  if (message.author.bot) return;
  const args = message.content.split(" ");

  // Staff-only commands
  if (
    (message.member.roles.cache.some(r => r.id === '614174010204225716') ||
     message.member.roles.cache.some(r => r.id === '642737555728629772')) &&
    message.channel.id === ADMIN_CHANNEL_ID
  ) {
    switch (args[0]) {
      case "+listplayers":
        let dPlayers = '';
        for (const pid of players) {
          try {
            const profile = await fortnite.account.fetch(pid);
            dPlayers += `${profile.displayName}: ${pid}\n`;
          } catch {
            dPlayers += `${pid}\n`;
          }
        }
        message.channel.send({ embed: { color: 3066993, title: "Users in the lobby", description: dPlayers, timestamp: new Date() } });
        break;

      case "+kick":
        fortnite.party.kick(args[1]);
        break;

      case "+ban":
        fortnite.party.kick(args[1]);
        fs.readFile('./blacklist.json', 'utf8', (err, data) => {
          if (err) return;
          const list = JSON.parse(data);
          list.users.push(args[1]);
          fs.writeFile('./blacklist.json', JSON.stringify(list), () => {});
        });
        break;

      case "+unban":
        fs.readFile('./blacklist.json', 'utf8', (err, data) => {
          if (err) return;
          const list = JSON.parse(data);
          list.users = list.users.filter(u => u !== args[1]);
          fs.writeFile('./blacklist.json', JSON.stringify(list), () => {});
        });
        break;

      // ✅ NEW COMMAND: Change playlist/mode
      case "+mode":
        if (!args[1]) {
          return message.channel.send("Usage: +mode <solos|duos|squads|rumble>");
        }
        let playlistId;
        switch (args[1].toLowerCase()) {
          case "solos":
            playlistId = "playlist_defaultsolo"; break;
          case "duos":
            playlistId = "playlist_defaultduo"; break;
          case "squads":
            playlistId = "playlist_defaultsquad"; break;
          case "rumble":
            playlistId = "playlist_respawn_24"; break;
          default:
            return message.channel.send("Unknown mode. Options: solos, duos, squads, rumble.");
        }
        try {
          await fortnite.party.setPlaylist(playlistId);
          message.channel.send(`✅ Playlist set to **${args[1]}**`);
        } catch (err) {
          console.error("Failed to set playlist:", err);
          message.channel.send("❌ Could not change playlist.");
        }
        break;
    }
  }

  // Public commands
  else if (message.channel.id === PUBLIC_CHANNEL_ID) {
    switch (args[0]) {
      case "+newitems":
        message.channel.send({ embed: { color: 3066993, title: "New Item IDs", description: itemList, timestamp: new Date() } });
        break;
      case "+whatis":
        message.channel.send({ embed: { color: 3066993, title: "What is this bot?", description: "FNTR Official is a Fortnite lobby bot...", timestamp: new Date() } });
        break;
      case "+items":
        message.channel.send({ embed: { color: 3066993, title: "All Fortnite item IDs", description: "Spreadsheet: https://docs.google.com/spreadsheets/d/1gVDgnzNyMCafIWa-dBO3mgNUHmHzgA9O5sWbfQy2Yfg/", timestamp: new Date() } });
        break;
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
