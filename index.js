// index.js
import axios from 'axios';
import TelegramBot from 'node-telegram-bot-api';

const TELEGRAM_TOKEN = '7880585497:AAGlD5lHgBwM6pqNaY7uoMt0UQE6Kp3CfAc';
const CHAT_ID        = '7180557399';
const API_KEY        = 'kv4s3SmPOifDNnHpMPjQlppQ4ebsSIFmeKh39AzrHHmgx6Cmy9bBWm77w7s0YFLlW0gWBA7iYsDGF50osEWtA';

const bot            = new TelegramBot(TELEGRAM_TOKEN);
const PRICE_HISTORY  = {};
let   RANK_HISTORY   = [];

const CHECK_INTERVAL = 10_000;  // 👉 10 秒檢查一次
const CONTRACTS_URL  = 'https://open-api.bingx.com/openApi/swap/v2/quote/contracts';
const PRICE_URL      = 'https://open-api.bingx.com/openApi/swap/v2/quote/price';
const KLINES_URL     = 'https://open-api.bingx.com/openApi/swap/v3/quote/klines';

let lastNotifyTime   = 0;
let cachedContracts  = null;

// 取得合約列表並快取
async function fetchContracts() {
  if (cachedContracts) return cachedContracts;
  const res = await axios.get(CONTRACTS_URL, {
    headers: { 'X-BX-APIKEY': API_KEY }
  });
  return (cachedContracts = res.data?.data || []);
}

// 取得全行情，遇 429 尊重 Retry‑After & 重試次數
async function fetchAllPrices(retries = 3) {
  try {
    const res = await axios.get(PRICE_URL, {
      headers: { 'X-BX-APIKEY': API_KEY }
    });
    return res.data?.data || [];
  } catch (err) {
    const status = err.response?.status;
    if (status === 429 && retries > 0) {
      const ra = parseInt(err.response.headers['retry-after'] || '1', 10);
      console.warn(`⚠️ fetchAllPrices 429，等 ${ra}s 再重試 (${retries} 次)`);
      await new Promise(r => setTimeout(r, ra * 1000));
      return fetchAllPrices(retries - 1);
    }
    throw err;
  }
}

// 取得最近 120 根 1 分鐘 K 線
async function fetchKlines(symbol, retries = 2) {
  try {
    const res = await axios.get(KLINES_URL, {
      params: { symbol, interval: '1m', limit: 120 },
      headers: { 'X-BX-APIKEY': API_KEY }
    });
    return res.data?.data || [];
  } catch (err) {
    const status = err.response?.status;
    if (status === 429 && retries > 0) {
      const ra = parseInt(err.response.headers['retry-after'] || '60', 10);
      console.warn(`⚠️ fetchKlines(${symbol}) 429，等 ${ra}s 再試`);
      await new Promise(r => setTimeout(r, ra * 1000));
      return fetchKlines(symbol, retries - 1);
    }
    throw err;
  }
}

// 更新 1 分鐘的價格歷史
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

// 計算排名變化
function calcRankChange(prevList, currList) {
  const prevRank = {};
  prevList.forEach((item, i) => prevRank[item.symbol] = i + 1);
  return currList.map((item, i) => {
    const prev = prevRank[item.symbol] || (currList.length + 1);
    return { ...item, rankChange: prev - (i + 1) };
  });
}

// 核心執行函式，每 10 秒跑一次
async function run() {
  const now = Date.now();
  try {
    const contracts = await fetchContracts();
    const prices    = await fetchAllPrices();

    // 過濾合約內 & 有效價格
    const tickers = prices
      .filter(t => contracts.some(c => c.symbol === t.symbol))
      .map(t => ({ symbol: t.symbol, price: parseFloat(t.price) }))
      .filter(t => !isNaN(t.price));

    tickers.forEach(t => updatePriceHistory(t.symbol, t.price));

    // 計算漲幅 & 排序
    const enriched = [];
    for (const t of tickers) {
      const prev = getPrice1MinAgo(t.symbol);
      const change = prev ? ((t.price - prev) / prev * 100) : 0;
      enriched.push({ ...t, change });
    }
    enriched.sort((a, b) => b.change - a.change);

    const ranked = calcRankChange(RANK_HISTORY, enriched);
    RANK_HISTORY = enriched;

    // 全域 30 秒冷卻
    if (now - lastNotifyTime < 30_000) return;

    // 找第一個漲幅超 1% 且 突破前 120 根最高收盤
    for (const t of ranked) {
      if (t.change >= 1) {
        const klines = await fetchKlines(t.symbol);
        const closes = klines.map(k => parseFloat(k.close));
        const highest = Math.max(...closes);
        if (t.price > highest) {
          const arrow = t.rankChange > 0 ? '↑' : (t.rankChange < 0 ? '↓' : '→');
          const msg = `⚡ ${t.symbol}\n` +
                      `價格：${t.price.toFixed(6)}\n` +
                      `1 分鐘漲幅：${t.change.toFixed(2)}%\n` +
                      `突破 120 根最高收盤：${highest}\n` +
                      `排名變化：${arrow}${Math.abs(t.rankChange)}`;
          await bot.sendMessage(CHAT_ID, msg);
          lastNotifyTime = now;
          break;
        }
      }
    }
  } catch (err) {
    console.error('執行 run() 時發生錯誤：', err.message);
  }
}

// 啟動
(async () => {
  await bot.sendMessage(
    CHAT_ID,
    '🟢 EnigmaticSloth Bot 上線成功！開始監控幣種，每 10 秒計算漲幅，超過 1% 且突破前 120 根最高收盤即通知（全域 30 秒冷卻）'
  );

  // 初始前三名列出
  try {
    const contracts = await fetchContracts();
    const prices    = await fetchAllPrices();
    const top3 = prices
      .filter(t => contracts.some(c => c.symbol === t.symbol))
      .map(t => ({ symbol: t.symbol, price: parseFloat(t.price) }))
      .filter(t => !isNaN(t.price))
      .sort((a, b) => b.price - a.price)
      .slice(0, 3);
    console.log(`🔥 初始前三名： ${top3.map(t => `${t.symbol}:${t.price}`).join(' | ')}`);
  } catch (err) {
    console.error('❌ 初始資料取得失敗：', err.message);
  }

  setInterval(run, CHECK_INTERVAL);
})();
