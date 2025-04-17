const axios = require("axios");
const TelegramBot = require("node-telegram-bot-api");

// === Telegram 設定 ===
const TELEGRAM_TOKEN = "7880585497:AAGlD5lHgBwM6pqNaY7uoMt0UQE6Kp3CfAc";
const CHAT_ID = "7180557399";
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: false });

// === 價格記錄用 ===
let lastPrices = {};

// === 開始就發測試訊息 ===
bot.sendMessage(CHAT_ID, "✅ Bot 啟動成功，測試訊息").then(() => {
  console.log("🟢 測試訊息已送出");
});

// === 每 5 秒執行一次 ===
async function fetchAndCheck() {
  try {
    console.log("📡 Fetching data...");
    const res = await axios.get("https://open-api.bingx.com/openApi/swap/v2/quote/contracts");
    const tickers = res.data?.data;

    if (!tickers || !Array.isArray(tickers)) {
      console.error("❌ Unexpected response format");
      return;
    }

    for (const t of tickers) {
      const symbol = t.symbol;
      const price = parseFloat(t.lastPrice);

      if (isNaN(price)) continue;

      if (!lastPrices[symbol]) {
        lastPrices[symbol] = [];
      }

      const now = Date.now();
      lastPrices[symbol].push({ time: now, price });

      // 留下最近 60 秒內的紀錄
      lastPrices[symbol] = lastPrices[symbol].filter(p => now - p.time <= 60000);

      if (lastPrices[symbol].length > 1) {
        const old = lastPrices[symbol][0].price;
        const pct = ((price - old) / old) * 100;

        console.log(`🪙 ${symbol}: ${pct.toFixed(4)}%`);

        // ✅ 若超過門檻就通知（暫設 0.001%）
        if (pct >= 0.001) {
          const msg = `⚡️ ${symbol} moved +${pct.toFixed(4)}% in 1 min\nCurrent: ${price}`;
          console.log("📤 Sending alert:", msg);
          await bot.sendMessage(CHAT_ID, msg);
          lastPrices[symbol] = []; // 清掉避免重複發送
        }
      }
    }
  } catch (err) {
    console.error("🔥 Fetch error:", err.message);
  }
}

// 定時執行
setInterval(fetchAndCheck, 5000);
