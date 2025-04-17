const TelegramBot = require("node-telegram-bot-api");

const TELEGRAM_TOKEN = "7880585497:AAGlD5lHgBwM6pqNaY7uoMt0UQE6Kp3CfAc";
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

bot.on("message", (msg) => {
  console.log("Your Chat ID is:", msg.chat.id);
});