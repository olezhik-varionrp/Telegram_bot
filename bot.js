require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');

const TOKEN = process.env.BOT_TOKEN;
const ADMIN_ID = Number(process.env.ADMIN_ID);

if (!TOKEN || !ADMIN_ID) {
  console.error('Ошибка: BOT_TOKEN и ADMIN_ID должны быть в .env файле!');
  process.exit(1);
}

const bot = new TelegramBot(TOKEN, { polling: true });

// Хранение состояний пользователей
const userStates = {};

// Файл для хранения заявок
const APPLICATIONS_FILE = path.join(__dirname, 'applications.json');

function loadApplications() {
  if (!fs.existsSync(APPLICATIONS_FILE)) return [];
  return JSON.parse(fs.readFileSync(APPLICATIONS_FILE, 'utf8'));
}

function saveApplication(app) {
  const apps = loadApplications();
  apps.push(app);
  fs.writeFileSync(APPLICATIONS_FILE, JSON.stringify(apps, null, 2));
}

// Шаги заявки
const STEPS = [
  { key: 'channelName',    question: '📺 Укажи название своего канала:' },
  { key: 'channelLink',    question: '🔗 Укажи ссылку на канал (например https://t.me/mychannel):' },
  { key: 'realName',       question: '👤 Как тебя зовут (реальное имя/никнейм ИРЛ)?:' },
  { key: 'age',            question: '🎂 Сколько тебе лет?' },
  { key: 'playTime',       question: '🎮 Сколько времени ты уже играешь на проекте?' },
  { key: 'about',          question: '📝 Расскажи немного о себе и своём канале:' },
  { key: 'discord',        question: '💬 Укажи свой Discord (например user#1234 или просто username):' },
  { key: 'telegram',       question: '📱 Укажи свой Telegram username (например @username):' },
];

// /start
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
console.log('Chat ID:', msg.chat.id, 'User ID:', msg.from.id);
  bot.sendMessage(chatId,
    `👋 Привет! Я бот для подачи заявок.\n\n` +
    `Нажми кнопку ниже чтобы начать заполнение заявки.`,
    {
      reply_markup: {
        keyboard: [['📋 Подать заявку']],
        resize_keyboard: true
      }
    }
  );
});

// Кнопка подать заявку
bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (!text) return;

  // Начало заявки
  if (text === '📋 Подать заявку') {
    userStates[chatId] = { step: 0, data: {} };
    bot.sendMessage(chatId,
      `📋 Отлично! Начинаем заполнение заявки.\nОтвечай на вопросы по очереди.\n\n` +
      STEPS[0].question,
      { reply_markup: { remove_keyboard: true } }
    );
    return;
  }

  // Отмена
  if (text === '/cancel') {
    delete userStates[chatId];
    bot.sendMessage(chatId, '❌ Заявка отменена.', {
      reply_markup: {
        keyboard: [['📋 Подать заявку']],
        resize_keyboard: true
      }
    });
    return;
  }

  // Процесс заполнения
  if (userStates[chatId] !== undefined) {
    const state = userStates[chatId];
    const currentStep = STEPS[state.step];

    // Сохраняем ответ
    state.data[currentStep.key] = text;
    state.step++;

    // Следующий шаг или завершение
    if (state.step < STEPS.length) {
      bot.sendMessage(chatId, STEPS[state.step].question);
    } else {
      // Заявка завершена
      const app = {
        id: Date.now(),
        userId: msg.from.id,
        username: msg.from.username || 'нет username',
        date: new Date().toLocaleString('ru-RU'),
        ...state.data
      };

      saveApplication(app);

      // Сообщение пользователю
      bot.sendMessage(chatId,
        `✅ Заявка успешно отправлена!\n\nМы рассмотрим её и свяжемся с тобой.\nСпасибо!`,
        {
          reply_markup: {
            keyboard: [['📋 Подать заявку']],
            resize_keyboard: true
          }
        }
      );

      // Уведомление админу
      const adminMsg =
        `🆕 *Новая заявка #${app.id}*\n\n` +
        `👤 От: @${app.username} (ID: ${app.userId})\n` +
        `📅 Дата: ${app.date}\n\n` +
        `📺 *Канал:* ${app.channelName}\n` +
        `🔗 *Ссылка:* ${app.channelLink}\n\n` +
        `👤 *Имя ИРЛ:* ${app.realName}\n` +
        `🎂 *Возраст:* ${app.age}\n` +
        `🎮 *Стаж на проекте:* ${app.playTime}\n\n` +
        `📝 *О себе:*\n${app.about}\n\n` +
        `💬 *Discord:* ${app.discord}\n` +
        `📱 *Telegram:* ${app.telegram}`;

console.log('Отправляю админу ID:', ADMIN_ID, typeof ADMIN_ID);     
 bot.sendMessage(ADMIN_ID, adminMsg, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '✅ Принять', callback_data: `accept_${app.id}` },
              { text: '❌ Отклонить', callback_data: `reject_${app.id}` }
            ]
          ]
        }
      });

      delete userStates[chatId];
    }
  }
});

// Обработка кнопок принять/отклонить (для админа)
bot.on('callback_query', (query) => {
  const adminChatId = query.message.chat.id;
  if (String(adminChatId) !== String(ADMIN_ID)) return;

  const [action, appId] = query.data.split('_');
  const apps = loadApplications();
  const app = apps.find(a => String(a.id) === appId);

  if (!app) {
    bot.answerCallbackQuery(query.id, { text: 'Заявка не найдена' });
    return;
  }

  if (action === 'accept') {
    bot.sendMessage(app.userId,
      `✅ Поздравляем! Твоя заявка была *принята*! 🎉\n\nС тобой скоро свяжутся.`,
      { parse_mode: 'Markdown' }
    );
    bot.answerCallbackQuery(query.id, { text: '✅ Заявка принята' });
    bot.editMessageReplyMarkup({ inline_keyboard: [] }, {
      chat_id: adminChatId,
      message_id: query.message.message_id
    });
    bot.sendMessage(adminChatId, `✅ Заявка #${appId} принята. Пользователь уведомлён.`);
  } else if (action === 'reject') {
    bot.sendMessage(app.userId,
      `❌ К сожалению, твоя заявка была *отклонена*.\n\nТы можешь подать новую заявку позже.`,
      { parse_mode: 'Markdown' }
    );
    bot.answerCallbackQuery(query.id, { text: '❌ Заявка отклонена' });
    bot.editMessageReplyMarkup({ inline_keyboard: [] }, {
      chat_id: adminChatId,
      message_id: query.message.message_id
    });
    bot.sendMessage(adminChatId, `❌ Заявка #${appId} отклонена. Пользователь уведомлён.`);
  }
});

// Команда /applications для админа — список всех заявок
bot.onText(/\/applications/, (msg) => {
  if (String(msg.chat.id) !== String(ADMIN_ID)) return;
  const apps = loadApplications();
  if (apps.length === 0) {
    bot.sendMessage(msg.chat.id, '📭 Заявок пока нет.');
    return;
  }
  bot.sendMessage(msg.chat.id, `📋 Всего заявок: *${apps.length}*\n\nПоследние 5:`, { parse_mode: 'Markdown' });
  apps.slice(-5).forEach(app => {
    bot.sendMessage(msg.chat.id,
      `#${app.id} — @${app.username}\n📺 ${app.channelName}\n📅 ${app.date}`,
    );
  });
});

console.log('🤖 Бот запущен!');
