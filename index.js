const axios = require("axios");
const TelegramBot = require("node-telegram-bot-api");

const TELEGRAM_TOKEN = "7880585497:AAGlD5lHgBwM6pqNaY7uoMt0UQE6Kp3CfAc";
const CHAT_ID = "7180557399";
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: false });

let lastPrices = {};

async function fetchAndCheck() {
  try {
    const { data } = await axios.get("https://open-api.bingx.com/openApi/swap/v2/quote/contracts");
    const tickers = data.data;

    for (const t of tickers) {
      const symbol = t.symbol;
      const price = parseFloat(t.lastPrice);

      if (!lastPrices[symbol]) {
        lastPrices[symbol] = [];
      }

      const now = Date.now();
      lastPrices[symbol].push({ time: now, price });

      // 保留最近 60 秒內資料
      lastPrices[symbol] = lastPrices[symbol].filter(p => now - p.time <= 60 * 1000);

      if (lastPrices[symbol].length < 2) continue; // 沒有舊資料就跳過

      const old = lastPrices[symbol][0].price;
      const pct = ((price - old) / old) * 100;

      // Log: 漲跌幅即時顯示
      console.log(`[${symbol}] ${pct.toFixed(2)}% in 1 min`);

      // 通知條件：上漲 0.1% 以上
      if (pct >= 0.1) {
        await bot.sendMessage(
          CHAT_ID,
          `⚡️ ${symbol} +${pct.toFixed(2)}% in 1 min\nCurrent: ${price}`
        );
        lastPrices[symbol] = []; // 清空避免連發
      }
    }
  } catch (err) {
    console.error("Fetch error:", err.message);
  }
}

setInterval(fetchAndCheck, 5000);
