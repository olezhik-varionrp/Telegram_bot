require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');

const TOKEN = process.env.BOT_TOKEN;
const ADMIN_ID = Number(process.env.ADMIN_ID);
const WEBAPP_URL = process.env.WEBAPP_URL || 'https://olezhik-varionrp.github.io/Telegram_bot';

if (!TOKEN || !ADMIN_ID) {
  console.error('Ошибка: BOT_TOKEN и ADMIN_ID должны быть в .env файле!');
  process.exit(1);
}

const bot = new TelegramBot(TOKEN, { polling: true });

const APPLICATIONS_FILE = path.join(__dirname, 'applications.json');

function loadApplications() {
  if (!fs.existsSync(APPLICATIONS_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(APPLICATIONS_FILE, 'utf8')); }
  catch { return []; }
}

function saveApplication(app) {
  const apps = loadApplications();
  apps.push(app);
  fs.writeFileSync(APPLICATIONS_FILE, JSON.stringify(apps, null, 2));
}

function updateApplicationStatus(id, status) {
  const apps = loadApplications();
  const app = apps.find(a => String(a.id) === String(id));
  if (app) {
    app.status = status;
    fs.writeFileSync(APPLICATIONS_FILE, JSON.stringify(apps, null, 2));
  }
  return app;
}

// /start — показываем кнопку открытия приложения
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId,
    `👋 Привет, ${msg.from.first_name}!\n\n` +
    `Добро пожаловать в систему заявок *VarionRP Media*.\n\n` +
    `Нажми кнопку ниже чтобы открыть приложение и подать заявку.`,
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[
          {
            text: '📋 Открыть приложение',
            web_app: { url: WEBAPP_URL }
          }
        ]]
      }
    }
  );
});

// Обработка данных из WebApp
bot.on('web_app_data', (msg) => {
  const chatId = msg.chat.id;
  try {
    const data = JSON.parse(msg.web_app_data.data);

    if (data.type === 'new_application') {
      const app = {
        id: data.id || Date.now(),
        userId: msg.from.id,
        username: msg.from.username || 'нет username',
        firstName: msg.from.first_name || '',
        date: new Date().toLocaleString('ru-RU'),
        channelName: data.channelName,
        channelLink: data.channelLink,
        realName: data.realName,
        age: data.age,
        playTime: data.playTime,
        about: data.about,
        discord: data.discord,
        telegram: data.telegram,
        status: 'pending'
      };

      saveApplication(app);

      // Сообщение пользователю
      bot.sendMessage(chatId,
        `✅ *Заявка успешно отправлена!*\n\n` +
        `Мы рассмотрим её и свяжемся с тобой.\n` +
        `Следи за статусом в приложении.`,
        { parse_mode: 'Markdown' }
      );

      // Уведомление админу
      const adminMsg =
        `🆕 *Новая заявка #${app.id}*\n\n` +
        `👤 От: @${app.username} (ID: \`${app.userId}\`)\n` +
        `📅 Дата: ${app.date}\n\n` +
        `📺 *Канал:* ${app.channelName}\n` +
        `🔗 *Ссылка:* ${app.channelLink}\n\n` +
        `👤 *Имя ИРЛ:* ${app.realName}\n` +
        `🎂 *Возраст:* ${app.age}\n` +
        `🎮 *Стаж:* ${app.playTime}\n\n` +
        `📝 *О себе:*\n${app.about}\n\n` +
        `💬 *Discord:* ${app.discord}\n` +
        `📱 *Telegram:* ${app.telegram}`;

      console.log('Отправляю админу ID:', ADMIN_ID, typeof ADMIN_ID);

      bot.sendMessage(ADMIN_ID, adminMsg, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[
            { text: '✅ Принять', callback_data: `accept_${app.id}_${app.userId}` },
            { text: '❌ Отклонить', callback_data: `reject_${app.id}_${app.userId}` }
          ]]
        }
      });
    }
  } catch(e) {
    console.error('Ошибка обработки webapp data:', e);
  }
});

// Кнопки принять/отклонить
bot.on('callback_query', (query) => {
  const adminChatId = query.message.chat.id;
  if (String(adminChatId) !== String(ADMIN_ID)) return;

  const parts = query.data.split('_');
  const action = parts[0];
  const appId = parts[1];
  const userChatId = parts[2];

  const app = updateApplicationStatus(appId, action === 'accept' ? 'accepted' : 'rejected');

  if (action === 'accept') {
    bot.sendMessage(userChatId,
      `✅ *Поздравляем!* Твоя заявка была *принята*! 🎉\n\nС тобой скоро свяжутся.`,
      { parse_mode: 'Markdown' }
    );
    bot.answerCallbackQuery(query.id, { text: '✅ Заявка принята' });
    bot.editMessageReplyMarkup({ inline_keyboard: [[{ text: '✅ Принята', callback_data: 'done' }]] }, {
      chat_id: adminChatId,
      message_id: query.message.message_id
    });
  } else {
    bot.sendMessage(userChatId,
      `❌ К сожалению, твоя заявка была *отклонена*.\n\nТы можешь подать новую заявку позже через приложение.`,
      { parse_mode: 'Markdown' }
    );
    bot.answerCallbackQuery(query.id, { text: '❌ Заявка отклонена' });
    bot.editMessageReplyMarkup({ inline_keyboard: [[{ text: '❌ Отклонена', callback_data: 'done' }]] }, {
      chat_id: adminChatId,
      message_id: query.message.message_id
    });
  }
});

// /applications для админа
bot.onText(/\/applications/, (msg) => {
  if (String(msg.chat.id) !== String(ADMIN_ID)) return;
  const apps = loadApplications();
  if (apps.length === 0) {
    bot.sendMessage(msg.chat.id, '📭 Заявок пока нет.');
    return;
  }
  bot.sendMessage(msg.chat.id, `📋 Всего заявок: *${apps.length}*`, { parse_mode: 'Markdown' });
  apps.slice(-5).reverse().forEach(app => {
    const status = app.status === 'accepted' ? '✅' : app.status === 'rejected' ? '❌' : '⏳';
    bot.sendMessage(msg.chat.id,
      `${status} #${app.id}\n@${app.username} — ${app.channelName}\n📅 ${app.date}`,
    );
  });
});

// /status для пользователя
bot.onText(/\/status/, (msg) => {
  const chatId = msg.chat.id;
  const apps = loadApplications().filter(a => String(a.userId) === String(msg.from.id));
  if (apps.length === 0) {
    bot.sendMessage(chatId, '📭 У тебя нет заявок.\n\nПодай заявку через приложение!', {
      reply_markup: {
        inline_keyboard: [[{ text: '📋 Открыть приложение', web_app: { url: WEBAPP_URL } }]]
      }
    });
    return;
  }
  const last = apps[apps.length - 1];
  const status = last.status === 'accepted' ? '✅ Принята' : last.status === 'rejected' ? '❌ Отклонена' : '⏳ На рассмотрении';
  bot.sendMessage(chatId,
    `📋 *Последняя заявка:*\n\n` +
    `📺 Канал: ${last.channelName}\n` +
    `📅 Дата: ${last.date}\n` +
    `Статус: ${status}`,
    { parse_mode: 'Markdown' }
  );
});

console.log('🤖 Бот запущен!');
