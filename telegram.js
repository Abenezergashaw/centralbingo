const TelegramBot = require("node-telegram-bot-api");

// const token = "8040306937:AAHCiJk7zvP7jxJHLmknpkY6Hdcnu0rwdTE";
const token = "7948093928:AAFXrGGZbkeUmrOzZM6NudfJ0-qP4gItPOQ";

const bot = new TelegramBot(token, { polling: true });

module.exports = bot;
