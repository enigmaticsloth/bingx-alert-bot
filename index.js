const axios = require("axios");
const TelegramBot = require("node-telegram-bot-api");

const TELEGRAM_TOKEN = "7880585497:AAGlD5lHgBwM6pqNaY7uoMt0UQE6Kp3CfAc";
const CHAT_ID = "7180557399";
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: false });

// 一開機先送一則測試訊息
bot.sendMessage(CHAT_ID, "✅ Bot 啟動成功，測試訊息").then(() => {
  console.log("🟢 測試訊息已送出");
});

let lastPrices = {};

async function fetchAndCheck() {
  try {
    const { data } = await axios.get("https://open-api.bingx.com/openApi/swap/v2/quote/contracts");
    const tickers = data.data;
    console.log(`✅ 獲取 ${tickers.length} 個交易對`);

    for (const t of tickers) {
      const symbol = t.symbol;
      const price = parseFloat(t.lastPrice);

      if (!lastPrices[symbol]) {
        lastPrices[symbol] = [];
      }

      const now = Date.now();
      lastPrices[symbol].push({ time: now, price });

      // 保留最近 60 秒資料
      lastPrices[symbol] = lastPrices[symbol].filter(p => now - p.time <= 60 * 1000);

      if (lastPrices[symbol].length >= 2) {
        const old = lastPrices[symbol][0].price;
        const pct = ((price - old) / old) * 100;

        // 打印每個交易對的漲跌幅
        console.log(`🪙 ${symbol}: ${pct.toFixed(4)}%`);

        if (pct >= 0.001) {
          const msg = `⚡️ ${symbol} moved +${pct.toFixed(4)}% in 1 min\nCurrent: ${price}`;
          console.log("📤 Sending alert:", msg);
          await bot.sendMessage(CHAT_ID, msg);
          lastPrices[symbol] = []; // 清空避免連發
        }
      }
    }
  } catch (err) {
    console.error("❌ Fetch error:", err.message);
  }
}

setInterval(fetchAndCheck, 5000);
