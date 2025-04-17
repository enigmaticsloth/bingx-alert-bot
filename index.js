const axios = require("axios");
const TelegramBot = require("node-telegram-bot-api");

// === 設定 ===
const TELEGRAM_TOKEN = "7880585497:AAGlD5lHgBwM6pqNaY7uoMt0UQE6Kp3CfAc";
const CHAT_ID = "7180557399"; // ← 你剛查到的 chat_id

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: false });
let lastPrices = {}; // 每個 symbol 的最近 60 秒價格資料

// === 主功能 ===
async function fetchAndCheck() {
  try {
    const { data } = await axios.get("https://open-api.bingx.com/openApi/swap/v2/quote/contracts");
    const tickers = data.data;

    for (const t of tickers) {
      const symbol = t.symbol;
      const price = parseFloat(t.lastPrice);
      if (!price || isNaN(price)) continue;

      // 建立 symbol 的價格歷史
      if (!lastPrices[symbol]) {
        lastPrices[symbol] = [];
      }

      const now = Date.now();
      lastPrices[symbol].push({ time: now, price });

      // 只保留 60 秒內的價格
      lastPrices[symbol] = lastPrices[symbol].filter(p => now - p.time <= 60 * 1000);
      if (lastPrices[symbol].length < 2) continue;

      const old = lastPrices[symbol][0].price;
      const pct = ((price - old) / old) * 100;

      if (Math.abs(pct) >= 1) { // ← 改這裡：只要漲跌「大於等於 1%」
        await bot.sendMessage(
          CHAT_ID,
          `⚡️ ${symbol} moved ${pct.toFixed(2)}% in 1 min\nCurrent: ${price}`
        );

        // 清掉這次以免短時間重複發送
        lastPrices[symbol] = [];
      }
    }
  } catch (err) {
    console.error("Fetch error:", err.message);
  }
}

// === 每 5 秒執行一次 ===
setInterval(fetchAndCheck, 5000);
