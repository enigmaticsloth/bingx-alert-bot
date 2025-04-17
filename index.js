// index.js
import axios from 'axios';
import TelegramBot from 'node-telegram-bot-api';

const TELEGRAM_TOKEN = '7880585497:AAGlD5lHgBwM6pqNaY7uoMt0UQE6Kp3CfAc';
const CHAT_ID        = '7180557399';
const API_KEY        = 'kv4s3SmPOifDNnHpMPjQlppQ4ebsSIFmeKh39AzrHHmgx6Cmy9bBWm77w7s0YFLlW0gWBA7iYsDGF50osEWtA';

const bot      = new TelegramBot(TELEGRAM_TOKEN);
const PRICE_HISTORY = {};
let   RANK_HISTORY  = [];

const CHECK_INTERVAL = 5000;
const CONTRACTS_URL  = 'https://open-api.bingx.com/openApi/swap/v2/quote/contracts';
const PRICE_URL      = 'https://open-api.bingx.com/openApi/swap/v2/quote/price';

// 全域最後通知時間
let lastNotifyTime = 0;

let cachedContracts = null;
async function fetchContracts() {
  if (cachedContracts) return cachedContracts;
  const res = await axios.get(CONTRACTS_URL, {
    headers: { 'X-BX-APIKEY': API_KEY }
  });
  return (cachedContracts = res.data?.data || []);
}

async function fetchAllPrices() {
  let delay = 1000;
  while (true) {
    try {
      const res = await axios.get(PRICE_URL, {
        headers: { 'X-BX-APIKEY': API_KEY }
      });
      return res.data?.data || [];
    } catch (err) {
      if (err.response?.status === 429) {
        console.log(`429 限流，等待 ${delay} ms 再試`);
        await new Promise(r => setTimeout(r, delay));
        delay = Math.min(delay * 2, 300_000);
      } else {
        throw err;
      }
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
  return h.length ? h[0].price : null;
}

function calcRankChange(prevList, currList) {
  const prevRank = {};
  prevList.forEach((item, i) => prevRank[item.symbol] = i + 1);
  return currList.map((item, i) => {
    const prev = prevRank[item.symbol] || (currList.length + 1);
    return { ...item, rankChange: prev - (i + 1) };
  });
}

async function run() {
  const now = Date.now();
  const contracts = await fetchContracts();
  const prices    = await fetchAllPrices();

  // 只保留合約內並且 price 有效的
  const tickers = prices
    .filter(t => contracts.some(c => c.symbol === t.symbol))
    .map(t => ({ symbol: t.symbol, price: parseFloat(t.price) }))
    .filter(t => !isNaN(t.price));

  tickers.forEach(t => updatePriceHistory(t.symbol, t.price));

  const result = tickers.map(t => {
    const prev   = getPrice1MinAgo(t.symbol);
    const change = prev ? ((t.price - prev) / prev * 100) : 0;
    return { ...t, change };
  }).sort((a, b) => b.change - a.change);

  const ranked = calcRankChange(RANK_HISTORY, result);
  RANK_HISTORY = result;

  // 全域冷卻檢查
  if (now - lastNotifyTime < 30_000) {
    return;  // 還在冷卻中，不發任何訊息
  }

  // 找出第一個符合條件的幣種
  const top = ranked.find(t => t.change >= 1);
  if (top) {
    const arrow = top.rankChange > 0 ? '↑' : (top.rankChange < 0 ? '↓' : '→');
    const msg = `⚡ ${top.symbol}\n` +
                `價格：${top.price.toFixed(6)}\n` +
                `漲幅：${top.change.toFixed(2)}%\n` +
                `排名變化：${arrow}${Math.abs(top.rankChange)}`;
    await bot.sendMessage(CHAT_ID, msg);
    lastNotifyTime = now;
  }
}

async function bootstrap() {
  await bot.sendMessage(CHAT_ID,
    '🟢 EnigmaticSloth Bot 上線成功！開始監控幣種價格，每 5 秒計算漲幅，超過 1% 通知（全域 30 秒冷卻）');
  const contracts = await fetchContracts();
  const prices    = await fetchAllPrices();
  const tickers   = prices
    .filter(t => contracts.some(c => c.symbol === t.symbol))
    .map(t => ({ symbol: t.symbol, price: parseFloat(t.price) }))
    .filter(t => !isNaN(t.price))
    .sort((a, b) => b.price - a.price)
    .slice(0, 3);

  console.log(`🔥 初始前三名： ${tickers.map(t => `${t.symbol}:${t.price}`).join(' | ')}`);
  setInterval(run, CHECK_INTERVAL);
}

bootstrap().catch(console.error);
