// Минимальный бот: одна кнопка, открывающая каталог.
// Запуск: node bot/bot.mjs (нужны BOT_TOKEN и PUBLIC_URL в .env)
import { Bot, InlineKeyboard } from 'grammy';

const token = process.env.BOT_TOKEN;
const url = process.env.PUBLIC_URL;

if (!token || !url) {
  console.error('Укажите BOT_TOKEN и PUBLIC_URL в .env');
  process.exit(1);
}

const bot = new Bot(token);

bot.command('start', (ctx) =>
  ctx.reply('Каталог квартир и товаров', {
    reply_markup: new InlineKeyboard().webApp('Открыть каталог', url),
  }),
);

bot.catch((error) => console.error('Ошибка бота:', error.message));

// Long polling: не нужен ни домен с сертификатом, ни настройка вебхука
bot.start({ onStart: (info) => console.log(`Бот @${info.username} запущен`) });
