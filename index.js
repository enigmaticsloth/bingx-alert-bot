// index.js
import axios from 'axios';
import TelegramBot from 'node-telegram-bot-api';

const TELEGRAM_TOKEN = '7880585497:AAGlD5lHgBwM6pqNaY7uoMt0UQE6Kp3CfAc';
const CHAT_ID       = '7180557399';
const API_KEY       = 'kv4s3SmPOifDNnHpMPjQlppQ4ebsSIFmeKh39AzrHHmgx6Cmy9bBWm77w7s0YFLlW0gWBA7iYsDGF50osEWtA';

const bot = new TelegramBot(TELEGRAM_TOKEN);
const PRICE_HISTORY = {};
let   RANK_HISTORY  = [];

const CHECK_INTERVAL_MS = 5000;
const CONTRACTS_URL     = 'https://open-api.bingx.com/openApi/swap/v2/quote/contracts';
const PRICE_URL         = 'https://open-api.bingx.com/openApi/swap/v2/quote/price';
const AXIOS_CONFIG      = {
  headers: { 'X-BX-APIKEY': API_KEY }
};

function updatePriceHistory(symbol, price) {
  if (!PRICE_HISTORY[symbol]) PRICE_HISTORY[symbol] = [];
  PRICE_HISTORY[symbol].push({ ts: Date.now(), price });
  // 只保留一分钟内的数据
  PRICE_HISTORY[symbol] = PRICE_HISTORY[symbol].filter(p => Date.now() - p.ts <= 60_000);
}

function getPrice1MinAgo(symbol) {
  const h = PRICE_HISTORY[symbol] || [];
  return h.length ? h[0].price : null;
}

function calcRankChange(prevList, currList) {
  const prevRank = new Map(prevList.map((it, i) => [it.symbol, i + 1]));
  return currList.map((it, i) => {
    const old = prevRank.get(it.symbol) || (currList.length + 1);
    return { ...it, rankChange: old - (i + 1) };
  });
}

async function fetchContracts() {
  const { data } = await axios.get(CONTRACTS_URL, AXIOS_CONFIG);
  return data.data || [];
}

async function fetchPrice(symbol) {
  // 注意对 symbol 做 URI 编码以避免 ERR_UNESCAPED_CHARACTERS
  const url = `${PRICE_URL}?symbol=${encodeURIComponent(symbol)}`;
  const { data } = await axios.get(url, AXIOS_CONFIG);
  return parseFloat(data?.data?.price);
}

async function runOnce() {
  const contracts = await fetchContracts();
  const tickers = [];

  // 分批抓价格，每批 5 个，批间隔 200ms
  for (let i = 0; i < contracts.length; i += 5) {
    const batch = contracts.slice(i, i + 5);
    const ps = batch.map(c =>
      fetchPrice(c.symbol)
        .then(price => ({ symbol: c.symbol, price }))
        .catch(() => null)
    );
    const res = await Promise.all(ps);
    for (const r of res) {
      if (r && Number.isFinite(r.price)) {
        tickers.push(r);
        updatePriceHistory(r.symbol, r.price);
      }
    }
    await new Promise(r => setTimeout(r, 200));
  }

  // 计算涨幅并排名
  const enriched = tickers.map(t => {
    const prev = getPrice1MinAgo(t.symbol);
    const change = prev ? ((t.price - prev) / prev) * 100 : 0;
    return { ...t, change };
  }).sort((a, b) => b.change - a.change);

  const ranked = calcRankChange(RANK_HISTORY, enriched);
  RANK_HISTORY = enriched;

  // 只通知涨幅 >= 1% 的
  for (const t of ranked) {
    if (Math.abs(t.change) >= 1) {
      const arrow = t.rankChange > 0 ? '↑' : t.rankChange < 0 ? '↓' : '→';
      const msg = `⚡ ${t.symbol}
價格：${t.price.toFixed(6)}
漲幅：${t.change.toFixed(2)}%
排名變化：${arrow}${Math.abs(t.rankChange)}`;
      await bot.sendMessage(CHAT_ID, msg);
    }
  }
}

async function bootstrap() {
  // 只在启动时发一次
  await bot.sendMessage(CHAT_ID, '🟢 EnigmaticSloth Bot 上線成功！每 5 秒監控一次 🚀');

  // 启动时打印初始前三名
  const contracts = await fetchContracts();
  const top3 = [];
  for (const c of contracts) {
    if (top3.length >= 3) break;
    try {
      const price = await fetchPrice(c.symbol);
      if (Number.isFinite(price)) top3.push({ symbol: c.symbol, price });
    } catch { }
  }
  console.log('🔥 上線初始前三名：', top3.map(t => `${t.symbol}:${t.price}`).join(' | '));

  // 立刻跑一次，然后每 5 秒跑一次
  await runOnce();
  setInterval(runOnce, CHECK_INTERVAL_MS);
}

bootstrap().catch(console.error);
