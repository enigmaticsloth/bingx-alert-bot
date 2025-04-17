import axios from 'axios';
import TelegramBot from 'node-telegram-bot-api';

const TELEGRAM_TOKEN = '7880585497:AAGlD5lHgBwM6pqNaY7uoMt0UQE6Kp3CfAc';
const CHAT_ID = '7180557399';
const API_KEY = '填上你的API KEY';
const bot = new TelegramBot(TELEGRAM_TOKEN);

const PRICE_HISTORY = {};
const RANK_HISTORY = [];
const CHECK_INTERVAL = 5000;

const CONTRACTS_URL = 'https://open-api.bingx.com/openApi/swap/v2/quote/contracts';
const PRICE_URL     = 'https://open-api.bingx.com/openApi/swap/v2/quote/price';

// Axios 全局 Header（速率限制用你的 API_KEY）
const axiosHeaders = {
  headers: { 'X-BX-APIKEY': API_KEY }
};

// —— 启动时只发一次 —— 
(async () => {
  await bot.sendMessage(CHAT_ID,
    '🟢 EnigmaticSloth Bot 上線成功！開始監控幣種價格變化，每 5 秒刷新一次 🚀'
  );

  // 启动时抓一次前三名打印到 console
  const contracts = await axios.get(CONTRACTS_URL, axiosHeaders).then(r => r.data.data || []);
  const top3 = [];
  for (const c of contracts) {
    const price = await axios.get(`${PRICE_URL}?symbol=${c.symbol}`, axiosHeaders)
                           .then(r => parseFloat(r.data.data.price || 'NaN'))
                           .catch(() => NaN);
    if (!isNaN(price)) top3.push({ symbol: c.symbol, price });
    if (top3.length === 3) break;
  }
  console.log('🔥 上線初始前三名：');
  top3.forEach(t => console.log(`${t.symbol}: ${t.price}`));

  // 启动定时轮询
  setInterval(run, CHECK_INTERVAL);
})();

async function run() {
  // 抓合约列表
  const contracts = await axios.get(CONTRACTS_URL, axiosHeaders)
                               .then(r => r.data.data || []);
  const tickers = [];

  // 一次性按列表循环拿价格
  for (const c of contracts) {
    const price = await axios.get(`${PRICE_URL}?symbol=${c.symbol}`, axiosHeaders)
                             .then(r => parseFloat(r.data.data.price || 'NaN'))
                             .catch(() => NaN);
    if (isNaN(price)) continue;
    tickers.push({ symbol: c.symbol, price });
    updatePriceHistory(c.symbol, price);
  }

  // 计算一分钟前的价格和涨幅
  const rankedList = tickers
    .map(t => {
      const prev = getPrice1MinAgo(t.symbol);
      const change = prev ? (t.price - prev) / prev * 100 : 0;
      return { ...t, change };
    })
    .sort((a, b) => b.change - a.change);

  // 排名变化
  const withRank = calcRankChange(RANK_HISTORY, rankedList);
  RANK_HISTORY.length = 0;
  RANK_HISTORY.push(...rankedList);

  // 仅通知 |涨幅| ≥ 1%
  for (const t of withRank) {
    if (Math.abs(t.change) >= 1.0) {
      const arrow = t.rankChange > 0 ? '↑' : t.rankChange < 0 ? '↓' : '→';
      const msg = `⚡ ${t.symbol}
價格：${t.price.toFixed(6)}
漲幅：${t.change.toFixed(2)}%
排名變化：${arrow} ${Math.abs(t.rankChange)}`;
      await bot.sendMessage(CHAT_ID, msg);
    }
  }
}

function updatePriceHistory(symbol, price) {
  if (!PRICE_HISTORY[symbol]) PRICE_HISTORY[symbol] = [];
  PRICE_HISTORY[symbol].push({ time: Date.now(), price });
  PRICE_HISTORY[symbol] = PRICE_HISTORY[symbol]
    .filter(p => Date.now() - p.time <= 60_000);
}

function getPrice1MinAgo(symbol) {
  const h = PRICE_HISTORY[symbol] || [];
  return h.length > 0 ? h[0].price : null;
}

function calcRankChange(prevList, currList) {
  const prevRank = {};
  prevList.forEach((it, i) => prevRank[it.symbol] = i + 1);
  return currList.map((it, i) => {
    const pr = prevRank[it.symbol] || (currList.length + 1);
    return { ...it, rankChange: pr - (i + 1) };
  });
}
