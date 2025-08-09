const TelegramBot = require("node-telegram-bot-api");

// const token = "8040306937:AAHCiJk7zvP7jxJHLmknpkY6Hdcnu0rwdTE";
const token = "8390620795:AAFp-NNOGaVMhgbc-rNx-zRS2ow_0qmsxjQ";

const bot = new TelegramBot(token, { polling: true });

module.exports = bot;
