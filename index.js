const axios = require("axios");
const TelegramBot = require("node-telegram-bot-api");

const TELEGRAM_TOKEN = "7880585497:AAGlD5lHgBwM6pqNaY7uoMt0UQE6Kp3CfAc";
const CHAT_ID = "7180557399";
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: false });

let lastPrices = {};

// 上線通知
bot.sendMessage(CHAT_ID, "✅ Bot 啟動成功，測試訊息").then(() => {
  console.log("🟢 測試訊息已送出");
});

async function fetchAndCheck() {
  console.log("📡 抓幣種中...");
  try {
    const { data } = await axios.get("https://open-api.bingx.com/openApi/swap/v2/quote/contracts");
    const tickers = data.data;

    console.log(`✅ 共 ${tickers.length} 幣`);

    const now = Date.now();

    for (const t of tickers) {
      const symbol = t.symbol;
      const price = parseFloat(t.lastPrice);

      // 跳過 NaN 價格
      if (!symbol || isNaN(price)) {
        console.log(`⚠️ 略過 ${symbol}：無效價格 (${t.lastPrice})`);
        continue;
      }

      if (!lastPrices[symbol]) {
        lastPrices[symbol] = [];
      }

      lastPrices[symbol].push({ time: now, price });

      // 保留最近 60 秒
      lastPrices[symbol] = lastPrices[symbol].filter(p => now - p.time <= 60 * 1000);

      const old = lastPrices[symbol][0].price;
      const pct = ((price - old) / old) * 100;

      console.log(`🪙 ${symbol}: ${pct.toFixed(4)}%`);

      // 測試階段：漲跌超過 0.001% 就通知
      if (Math.abs(pct) >= 0.001) {
        await bot.sendMessage(
          CHAT_ID,
          `⚡️ ${symbol} moved ${pct.toFixed(4)}% in 1 min\nCurrent: ${price}`
        );

        // 避免一直通知
        lastPrices[symbol] = [];
      }
    }
  } catch (err) {
    console.error("❌ 錯誤：", err.message);
  }
}

setInterval(fetchAndCheck, 5000);
