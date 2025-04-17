// index.js
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
const PRICE_URL = 'https://open-api.bingx.com/openApi/swap/v2/quote/price';

// 只發一次
let booted = false;

const axiosHeaders = {
  headers: {
    'X-BX-APIKEY': API_KEY
  }
};

async function fetchContracts() {
  const res = await axios.get(CONTRACTS_URL, axiosHeaders);
  return res.data?.data || [];
}

async function fetchPrice(symbol) {
  try {
    const res = await axios.get(`${PRICE_URL}?symbol=${symbol}`, axiosHeaders);
    return parseFloat(res.data?.data?.price || 'NaN');
  } catch {
    return NaN;
  }
}

function updatePriceHistory(symbol, price) {
  if (!PRICE_HISTORY[symbol]) PRICE_HISTORY[symbol] = [];
  PRICE_HISTORY[symbol].push({ time: Date.now(), price });
  PRICE_HISTORY[symbol] = PRICE_HISTORY[symbol].filter(p => Date.now() - p.time <= 60000);
}

function getPrice1MinAgo(symbol) {
  const history = PRICE_HISTORY[symbol] || [];
  return history.length > 0 ? history[0].price : null;
}

function calcRankChange(prevList, currList) {
  const prevRank = {};
  prevList.forEach((item, i) => { prevRank[item.symbol] = i + 1; });
  return currList.map((item, i) => {
    const prev = prevRank[item.symbol] || (currList.length + 1);
    return { ...item, rankChange: prev - (i + 1) };
  });
}

async function run() {
  const contracts = await fetchContracts();
  const tickers = [];

  for (const c of contracts) {
    const price = await fetchPrice(c.symbol);
    if (!isNaN(price)) {
      tickers.push({ symbol: c.symbol, price });
      updatePriceHistory(c.symbol, price);
    }
  }

  const result = tickers.map(t => {
    const prev = getPrice1MinAgo(t.symbol);
    const change = prev ? ((t.price - prev) / prev * 100) : 0;
    return { ...t, change };
  }).sort((a, b) => b.change - a.change);

  const ranked = calcRankChange(RANK_HISTORY, result);
  RANK_HISTORY.length = 0;
  RANK_HISTORY.push(...result);

  for (const t of ranked) {
    if (Math.abs(t.change) >= 1.0) { // 超過 1% 才發訊息
      const msg = `⚡ ${t.symbol}\n價格：${t.price.toFixed(6)}\n漲幅：${t.change.toFixed(2)}%\n排名變化：${t.rankChange > 0 ? '↑' : (t.rankChange < 0 ? '↓' : '→')} ${Math.abs(t.rankChange)}`;
      await bot.sendMessage(CHAT_ID, msg);
    }
  }
}

async function bootstrap() {
  if (!booted) {
    await bot.sendMessage(CHAT_ID, '🟢 EnigmaticSloth Bot 上線成功！開始監控幣種價格變化，每 5 秒刷新一次 🚀');
    booted = true;
  }

  const contracts = await fetchContracts();
  const top = [];

  for (const c of contracts) {
    const price = await fetchPrice(c.symbol);
    if (!isNaN(price)) top.push({ symbol: c.symbol, price });
    if (top.length >= 3) break;
  }

  console.log('🔥 上線初始前三名：');
  for (const t of top) {
    console.log(`${t.symbol}: ${t.price}`);
  }

  setInterval(run, CHECK_INTERVAL);
}

bootstrap();
