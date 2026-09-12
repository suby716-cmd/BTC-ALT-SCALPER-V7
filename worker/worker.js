const VERSION = 'v8.0.3';
const STRATEGY_VERSION = 'krw-5m-v8';
const COINS = ['ETH','SOL','XRP','HBAR','ONDO','LINK','AVAX','DOGE','SUI','TAO','UNI','AAVE'];
const UPBIT_CANDLE_BASE = 'https://api.upbit.com/v1/candles/minutes';
const POS_KEY = 'positions';
const TRADE_HISTORY_KEY = 'trade-history:v1';
const MAX_TRADE_HISTORY = 300;
const LAST_RESULT_KEY = 'runtime:last-result';
const LAST_ERROR_KEY = 'runtime:last-error';
const FIVE_MIN = 5 * 60 * 1000;
const FIFTEEN_MIN = 15 * 60 * 1000;

export default {
  async fetch(req, env) {
    try {
      const u = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response('', { status: 204, headers: cors() });

    if (req.method === 'GET' && u.pathname === '/health') {
      return json({
        ok: true,
        version: VERSION,
        strategyVersion: STRATEGY_VERSION,
        market: 'UPBIT_KRW',
        timeframe: '5m',
        cron: '*/5 * * * *',
        kv: !!env.SCALPER_KV,
        telegramConfigured: !!(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID),
        pinConfigured: !!env.SCALPER_PIN,
        strategy: strategyConfig(env),
        coins: COINS,
        note: 'Telegram 자동 신호는 Cron에서만 발송됩니다. /scan은 조회 전용입니다.'
      });
    }

    if (!auth(req, env)) return json({ ok: false, error: 'unauthorized' }, 401);

    if (req.method === 'POST' && u.pathname === '/test') {
      requireTelegram(env);
      await sendTelegram(env, `🧪 BTC ALT SCALPER ${VERSION}\nTelegram 연결 테스트 성공\n자동 감시: Cloudflare Cron 5분`);
      return json({ ok: true });
    }

    if (req.method === 'POST' && u.pathname === '/position') {
      requireKV(env);
      const body = await readJson(req);
      const symbol = normalizeSymbol(body.symbol);
      if (!COINS.includes(symbol)) return json({ ok: false, error: '지원하지 않는 코인입니다.' }, 400);
      const action = body.action === 'remove' ? 'remove' : 'add';
      const positions = await getPositions(env);
      if (action === 'add') {
        const entry = Number(body.entry);
        if (!Number.isFinite(entry) || entry <= 0) return json({ ok: false, error: '실제 매수가(KRW)를 입력하세요.' }, 400);
        const old = positions[symbol] || {};
        const quantityRaw = body.quantity == null || body.quantity === '' ? old.quantity : Number(body.quantity);
        const quantity = Number.isFinite(Number(quantityRaw)) && Number(quantityRaw) > 0 ? Number(quantityRaw) : null;
        if (body.quantity != null && body.quantity !== '' && quantity == null) return json({ ok: false, error: '올바른 보유 수량을 입력하세요.' }, 400);
        positions[symbol] = {
          entry,
          quantity,
          addedAt: Number(old.addedAt) || Number(body.boughtAt) || Date.now(),
          updatedAt: Date.now()
        };
      } else {
        delete positions[symbol];
      }
      await env.SCALPER_KV.put(POS_KEY, JSON.stringify(positions));
      return json({ ok: true, held: Object.keys(positions), positions });
    }

    if (req.method === 'POST' && u.pathname === '/trade') {
      requireKV(env);
      const body = await readJson(req);
      const action = String(body.action || '').toLowerCase();
      const symbol = normalizeSymbol(body.symbol);
      if (!COINS.includes(symbol)) return json({ ok: false, error: '지원하지 않는 코인입니다.' }, 400);
      const history = await getTradeHistory(env);

      if (action === 'manual') {
        const entry = positiveNumber(body.entry);
        const exit = positiveNumber(body.exit);
        const quantity = positiveNumber(body.quantity);
        if (!entry || !exit || !quantity) return json({ ok: false, error: '매수가, 매도가, 수량을 모두 올바르게 입력하세요.' }, 400);
        const trade = makeClosedTrade({ symbol, entry, exit, quantity, boughtAt: Number(body.boughtAt) || null, soldAt: Number(body.soldAt) || Date.now(), source: 'manual' });
        history.unshift(trade);
        await saveTradeHistory(env, history);
        return json({ ok: true, trade, ...(await buildLedger(env)) });
      }

      if (action === 'sell') {
        const positions = await getPositions(env);
        const pos = positions[symbol];
        if (!pos) return json({ ok: false, error: `${symbol}/KRW가 보유 상태로 등록되어 있지 않습니다.` }, 400);
        const exit = positiveNumber(body.exit);
        const quantity = positiveNumber(body.quantity);
        if (!exit || !quantity) return json({ ok: false, error: '실제 매도가와 매도 수량을 입력하세요.' }, 400);
        const heldQty = positiveNumber(pos.quantity);
        if (heldQty && quantity > heldQty + 1e-12) return json({ ok: false, error: `매도 수량이 보유 수량(${heldQty})보다 큽니다.` }, 400);
        const trade = makeClosedTrade({ symbol, entry: Number(pos.entry), exit, quantity, boughtAt: Number(pos.addedAt) || null, soldAt: Number(body.soldAt) || Date.now(), source: 'position' });
        history.unshift(trade);
        if (heldQty && quantity < heldQty - 1e-12) {
          positions[symbol] = { ...pos, quantity: heldQty - quantity, updatedAt: Date.now() };
        } else {
          delete positions[symbol];
        }
        await Promise.all([
          env.SCALPER_KV.put(POS_KEY, JSON.stringify(positions)),
          saveTradeHistory(env, history)
        ]);
        return json({ ok: true, trade, ...(await buildLedger(env)) });
      }

      return json({ ok: false, error: '지원하지 않는 거래 작업입니다.' }, 400);
    }

    if (req.method === 'POST' && u.pathname === '/positions') {
      requireKV(env);
      const positions = await getPositions(env);
      return json({ ok: true, held: Object.keys(positions), positions });
    }

    if (req.method === 'POST' && u.pathname === '/ledger') {
      requireKV(env);
      return json({ ok: true, ...(await buildLedger(env)) });
    }

    if (req.method === 'POST' && u.pathname === '/status') {
      requireKV(env);
      const [raw, errRaw, positions] = await Promise.all([
        env.SCALPER_KV.get(LAST_RESULT_KEY),
        env.SCALPER_KV.get(LAST_ERROR_KEY),
        getPositions(env)
      ]);
      let lastError = null;
      try { lastError = errRaw ? JSON.parse(errRaw) : null; } catch {}
      if (!raw) return json({ ok: true, ready: false, lastError, held: Object.keys(positions), positions, message: '아직 Cron 스캔 결과가 저장되지 않았습니다.' });
      try {
        const saved = JSON.parse(raw);
        return json({ ok: true, ready: true, ...applyLivePositions(saved, positions, strategyConfig(env)), lastError });
      }
      catch { return json({ ok: false, error: '저장된 상태 데이터를 읽지 못했습니다.' }, 500); }
    }

    // 수동 조회: Telegram을 절대 발송하지 않습니다.
    if (req.method === 'POST' && u.pathname === '/scan') {
      const result = await scanAll(env, { notify: false, source: 'manual', asOf: Date.now() });
      return json(result);
    }

    // 백테스트용 Upbit 프록시. 브라우저의 Origin 제한(10초 1회)을 피하기 위해 1페이지씩 중계합니다.
    if (req.method === 'POST' && u.pathname === '/candles') {
      const body = await readJson(req);
      const symbol = normalizeSymbol(body.symbol);
      if (symbol !== 'BTC' && !COINS.includes(symbol)) return json({ ok: false, error: '지원하지 않는 코인입니다.' }, 400);
      const count = clampInt(Number(body.count) || 200, 1, 200);
      const to = body.to == null ? null : Number(body.to);
      if (to != null && !Number.isFinite(to)) return json({ ok: false, error: '잘못된 to 값입니다.' }, 400);
      const candles = await fetchCandlesPage(symbol, 5, count, to);
      return json({ ok: true, symbol, candles });
    }

      return json({ ok: false, error: 'not found' }, 404);
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      console.error('request failed', error);
      return json({ ok: false, error }, 500);
    }
  },

  async scheduled(controller, env) {
    // Cron 실패가 Cloudflare Past Events에 남도록 await/throw 합니다.
    requireKV(env);
    requireTelegram(env);
    const asOf = Number(controller?.scheduledTime) || Date.now();
    const delayMs = Math.max(0, numEnv(env.CRON_DELAY_SECONDS, 12)) * 1000;
    try {
      if (delayMs) await sleep(delayMs); // 거래소가 막 닫힌 5분봉을 확정할 시간을 줍니다.
      const result = await scanAll(env, { notify: true, source: 'cron', asOf });
      await env.SCALPER_KV.put(LAST_RESULT_KEY, JSON.stringify({ ...result, savedAt: Date.now() }));
      await env.SCALPER_KV.delete(LAST_ERROR_KEY);
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      try { await env.SCALPER_KV.put(LAST_ERROR_KEY, JSON.stringify({ at: Date.now(), error })); } catch {}
      console.error('scheduled scan failed', error);
      throw err;
    }
  }
};

function cors() {
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type,x-scalper-pin',
    'cache-control': 'no-store'
  };
}

function auth(req, env) {
  return !!env.SCALPER_PIN && req.headers.get('x-scalper-pin') === env.SCALPER_PIN;
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...cors() }
  });
}

async function readJson(req) {
  try { return await req.json(); } catch { return {}; }
}

function requireKV(env) {
  if (!env.SCALPER_KV) throw new Error('SCALPER_KV 바인딩이 없습니다. 24시간 자동알림에는 KV가 필수입니다.');
}

function requireTelegram(env) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) throw new Error('Telegram Secret 설정이 없습니다.');
}

function normalizeSymbol(value) {
  return String(value || '').toUpperCase().replace('KRW-', '').replace('/KRW', '').replace('USDT', '').trim();
}

function marketOf(symbol) { return `KRW-${normalizeSymbol(symbol)}`; }
function candleStartMs(c) { return Date.parse(`${c.candle_date_time_utc}Z`); }

async function fetchCandlesPage(symbol, unit = 5, count = 200, toMs = null) {
  const q = new URLSearchParams({ market: marketOf(symbol), count: String(count) });
  if (toMs != null) q.set('to', new Date(toMs).toISOString());
  const r = await fetch(`${UPBIT_CANDLE_BASE}/${unit}?${q.toString()}`, { headers: { accept: 'application/json' } });
  if (!r.ok) {
    const body = await r.text().catch(() => '');
    throw new Error(`Upbit ${r.status}${body ? `: ${body.slice(0, 120)}` : ''}`);
  }
  const data = await r.json();
  if (!Array.isArray(data)) throw new Error('Upbit candle 응답 형식이 올바르지 않습니다.');
  return data.reverse().map(c => [
    candleStartMs(c),
    Number(c.opening_price),
    Number(c.high_price),
    Number(c.low_price),
    Number(c.trade_price),
    Number(c.candle_acc_trade_volume)
  ]).filter(x => Number.isFinite(x[0]));
}

async function recentClosed5m(symbol, asOf, limit = 180) {
  const raw = await fetchCandlesPage(symbol, 5, Math.min(200, limit + 1), null);
  const cutoff = Math.floor(asOf / FIVE_MIN) * FIVE_MIN;
  return raw.filter(x => x[0] < cutoff).slice(-limit);
}

const closes = k => k.map(x => Number(x[4]));
const volumes = k => k.map(x => Number(x[5]));
const pct = (a, b) => b ? (a / b - 1) * 100 : 0;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const clampInt = (x, a, b) => Math.max(a, Math.min(b, Math.trunc(x)));
const rnd = (x, n = 2) => Number(Number(x).toFixed(n));
const numEnv = (v, fallback) => Number.isFinite(Number(v)) ? Number(v) : fallback;

function EMA(a, n) {
  if (!a.length) return 0;
  let e = a[0], m = 2 / (n + 1);
  for (let i = 1; i < a.length; i++) e = a[i] * m + e * (1 - m);
  return e;
}

function RSI(a, n = 14) {
  if (a.length < n + 1) return 50;
  let g = 0, l = 0;
  for (let i = 1; i <= n; i++) {
    const d = a[i] - a[i - 1];
    if (d >= 0) g += d; else l -= d;
  }
  let ag = g / n, al = l / n;
  for (let i = n + 1; i < a.length; i++) {
    const d = a[i] - a[i - 1];
    ag = (ag * (n - 1) + (d > 0 ? d : 0)) / n;
    al = (al * (n - 1) + (d < 0 ? -d : 0)) / n;
  }
  return al === 0 ? 100 : 100 - 100 / (1 + ag / al);
}

function ATR(k, n = 14) {
  if (k.length < n + 1) return 0;
  const tr = [];
  for (let i = 1; i < k.length; i++) {
    const h = Number(k[i][2]), lo = Number(k[i][3]), pc = Number(k[i - 1][4]);
    tr.push(Math.max(h - lo, Math.abs(h - pc), Math.abs(lo - pc)));
  }
  return tr.slice(-n).reduce((a, b) => a + b, 0) / n;
}

function closed15mCloses(k5, asOf) {
  const cutoff = Math.floor(asOf / FIFTEEN_MIN) * FIFTEEN_MIN;
  const byBucket = new Map();
  for (const row of k5) {
    if (row[0] >= cutoff) continue;
    const bucket = Math.floor(row[0] / FIFTEEN_MIN) * FIFTEEN_MIN;
    byBucket.set(bucket, Number(row[4]));
  }
  return [...byBucket.entries()].sort((a, b) => a[0] - b[0]).map(x => x[1]);
}

function strategyConfig(env) {
  return {
    minScore: numEnv(env.MIN_SCORE, 75),
    tp1Pct: numEnv(env.TP1_PERCENT, 1.2),
    tp2Pct: numEnv(env.TP2_PERCENT, 2.2),
    stopLossPct: numEnv(env.STOP_LOSS_PERCENT, 0.8),
    buyCooldownMin: numEnv(env.BUY_COOLDOWN_MINUTES ?? env.COOLDOWN_MINUTES, 20),
    sellCooldownMin: numEnv(env.SELL_COOLDOWN_MINUTES, 60),
    maxBuyAlerts: clampInt(numEnv(env.MAX_BUY_ALERTS, 2), 1, 10)
  };
}

function evaluateSignal(symbol, k5, b5, asOf, cfg) {
  if (k5.length < 60 || b5.length < 60) throw new Error('5분봉 데이터가 부족합니다.');
  const expectedStart = Math.floor(asOf / FIVE_MIN) * FIVE_MIN - FIVE_MIN;
  const altLast = k5.at(-1)?.[0];
  const btcLast = b5.at(-1)?.[0];
  if (altLast !== expectedStart) return { symbol, signal: 'STALE', stale: true, error: '최신 완료 5분봉이 없어 신호를 건너뜁니다.', candleStart: altLast ?? null };
  if (btcLast !== expectedStart) throw new Error('BTC 최신 완료 5분봉이 없습니다.');

  const p = closes(k5), v = volumes(k5), bp = closes(b5);
  const p15 = closed15mCloses(k5, asOf), bp15 = closed15mCloses(b5, asOf);
  const price = p.at(-1), e9 = EMA(p, 9), e20 = EMA(p, 20), e50 = EMA(p, 50);
  const be20 = EMA(bp, 20);
  const e20Prev = EMA(p.slice(0, -5), 20), be20Prev = EMA(bp.slice(0, -5), 20);
  const r = RSI(p), br = RSI(bp), r15 = RSI(p15), br15 = RSI(bp15);
  const relR = r - br, ret = pct(price, p.at(-2)), bret = pct(bp.at(-1), bp.at(-2)), relRet = ret - bret;
  const av = v.slice(-21, -1).reduce((a, x) => a + x, 0) / 20;
  const vr = av ? v.at(-1) / av : 1;
  const recentHigh = Math.max(...k5.slice(-21, -1).map(x => Number(x[2])));
  const breakout = price >= recentHigh * 0.9995;
  const atrPct = price ? ATR(k5) / price * 100 : 0;
  const slope5 = pct(e20, e20Prev), btcSlope = pct(be20, be20Prev);

  let score = 0;
  const reasons = [];
  score += clamp((relR - 2) * 2.2, 0, 22); if (relR >= 5) reasons.push(`RSI 상대강도 +${rnd(relR)}p`);
  if (e9 > e20) { score += 12; reasons.push('단기 추세 상승'); }
  if (e20 > e50) { score += 8; reasons.push('중기 추세 상승'); }
  if (r15 > br15) { score += 10; reasons.push('15m 상대강도 우위'); }
  score += clamp(relRet * 3, 0, 16); if (relRet > 0.35) reasons.push(`5m 상대모멘텀 +${rnd(relRet)}%`);
  score += clamp((vr - 1) * 25, 0, 14); if (vr >= 1.15) reasons.push(`거래량 ${rnd(vr)}x`);
  if (breakout) { score += 10; reasons.push('최근 20봉 고가 돌파'); }
  if (r >= 52 && r <= 72) score += 8; else if (r > 76) { score -= 10; reasons.push('RSI 과열'); }
  if (atrPct < 0.25) { score -= 6; reasons.push('변동성 부족'); }
  if (slope5 > 0) score += 2;
  if (btcSlope > 0) score += 2;
  score = clamp(score, 0, 100);

  const crash = bret <= -0.9 || br < 40 || bp.at(-1) < be20 * 0.995;
  const regime = br >= 48 && br <= 68 && bp.at(-1) > be20 ? 'RISK_ON' : 'RISK_OFF';
  const hard = score >= cfg.minScore && regime === 'RISK_ON' && r >= 52 && r <= 72 && relR >= 5 && e9 > e20 && vr >= 1.15 && relRet > 0 && !crash;
  const signal = hard ? 'BUY' : (score >= Math.max(60, cfg.minScore - 15) && !crash ? 'WATCH' : 'IDLE');
  const confidence = clamp(score * 0.72 + (regime === 'RISK_ON' ? 10 : -8) + (r15 > br15 ? 6 : 0) + (breakout ? 4 : 0) - (atrPct < 0.25 ? 8 : 0) - (r > 76 ? 12 : 0), 0, 100);
  const risk = crash || regime === 'RISK_OFF' || r > 76 ? 'HIGH' : confidence >= 82 ? 'LOW' : 'MEDIUM';

  return {
    symbol,
    market: marketOf(symbol),
    quote: 'KRW',
    candleStart: expectedStart,
    price,
    btcPrice: bp.at(-1),
    score: rnd(score),
    confidence: rnd(confidence),
    risk,
    signal,
    rsi: rnd(r),
    btcRsi: rnd(br),
    rsiRel: rnd(relR),
    rsi15: rnd(r15),
    btcRsi15: rnd(br15),
    ret5: rnd(ret),
    btcRet5: rnd(bret),
    relRet5: rnd(relRet),
    ema9: rnd(e9),
    ema20: rnd(e20),
    ema50: rnd(e50),
    ema20Slope5: rnd(slope5, 3),
    btcEma20Slope5: rnd(btcSlope, 3),
    volRatio: rnd(vr),
    breakout,
    atrPct: rnd(atrPct, 3),
    regime,
    btcCrash: crash,
    tp1: price * (1 + cfg.tp1Pct / 100),
    tp2: price * (1 + cfg.tp2Pct / 100),
    sl: price * (1 - cfg.stopLossPct / 100),
    reasons: reasons.slice(0, 6)
  };
}

function sellCheck(s, pos, cfg) {
  const entry = Number(pos?.entry) || 0;
  const gain = entry ? ((s.price / entry) - 1) * 100 : 0;
  const reasons = [];
  if (entry && s.price <= entry * (1 - cfg.stopLossPct / 100)) reasons.push(`손절선 -${cfg.stopLossPct}% 도달`);
  if (s.btcCrash) reasons.push('BTC 급락/약세');
  if (s.regime === 'RISK_OFF') reasons.push('BTC 시장국면 Risk-Off');
  if (s.ema9 < s.ema20 && s.relRet5 < 0) reasons.push('단기 추세·상대모멘텀 동시 약화');
  if (s.score < 48 && s.ema9 < s.ema20) reasons.push('종합점수 하락 + EMA 약세');
  if (entry && gain >= 1 && s.score < 55 && s.ema9 < s.ema20) reasons.push('수익 보호: 상승 후 추세 이탈');
  return { sell: reasons.length > 0, gain: rnd(gain), reasons };
}

async function getPositions(env) {
  if (!env.SCALPER_KV) return {};
  const raw = await env.SCALPER_KV.get(POS_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) || {};
    const normalized = {};
    for (const [key, value] of Object.entries(parsed)) {
      const symbol = normalizeSymbol(key);
      if (COINS.includes(symbol)) normalized[symbol] = value;
    }
    return normalized;
  } catch { return {}; }
}

function positiveNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function getTradeHistory(env) {
  if (!env.SCALPER_KV) return [];
  const raw = await env.SCALPER_KV.get(TRADE_HISTORY_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(0, MAX_TRADE_HISTORY) : [];
  } catch { return []; }
}

async function saveTradeHistory(env, history) {
  await env.SCALPER_KV.put(TRADE_HISTORY_KEY, JSON.stringify((history || []).slice(0, MAX_TRADE_HISTORY)));
}

function makeClosedTrade({ symbol, entry, exit, quantity, boughtAt = null, soldAt = Date.now(), source = 'manual' }) {
  const buyAmount = entry * quantity;
  const sellAmount = exit * quantity;
  const pnl = sellAmount - buyAmount;
  const pnlPct = entry ? (exit / entry - 1) * 100 : 0;
  return {
    id: `${soldAt}-${symbol}-${Math.random().toString(36).slice(2, 9)}`,
    symbol,
    entry: rnd(entry, 8),
    exit: rnd(exit, 8),
    quantity: rnd(quantity, 12),
    buyAmount: rnd(buyAmount, 4),
    sellAmount: rnd(sellAmount, 4),
    pnl: rnd(pnl, 4),
    pnlPct: rnd(pnlPct),
    boughtAt,
    soldAt,
    source
  };
}

function applyLivePositions(snapshot, positions, cfg) {
  const results = (snapshot?.results || []).map(row => {
    const s = { ...row };
    const pos = positions[s.symbol];
    if (!Number.isFinite(Number(s.score))) {
      s.held = !!pos;
      if (pos) { s.entry = pos.entry; s.quantity = pos.quantity ?? null; }
      return s;
    }
    if (pos) {
      const q = sellCheck(s, pos, cfg);
      s.held = true;
      s.entry = pos.entry;
      s.quantity = pos.quantity ?? null;
      s.gain = q.gain;
      s.sell = q.sell;
      s.sellReasons = q.reasons;
    } else {
      s.held = false;
      s.entry = null;
      s.quantity = null;
      s.gain = null;
      s.sell = false;
      s.sellReasons = [];
    }
    return s;
  });
  return {
    ...snapshot,
    held: Object.keys(positions),
    positions,
    sellSignals: results.filter(x => x.sell).map(x => x.symbol),
    results
  };
}

async function buildLedger(env) {
  const [positions, history, raw] = await Promise.all([
    getPositions(env),
    getTradeHistory(env),
    env.SCALPER_KV.get(LAST_RESULT_KEY)
  ]);
  let latest = null;
  try { latest = raw ? JSON.parse(raw) : null; } catch {}
  const latestPrices = {};
  for (const row of latest?.results || []) {
    if (row?.symbol && Number.isFinite(Number(row.price))) latestPrices[row.symbol] = Number(row.price);
  }

  let openCost = 0, openValue = 0, unrealizedPnl = 0, knownOpen = 0, unknownQty = 0;
  const open = Object.entries(positions).map(([symbol, pos]) => {
    const entry = Number(pos.entry);
    const quantity = positiveNumber(pos.quantity);
    const current = positiveNumber(latestPrices[symbol]);
    const cost = quantity ? entry * quantity : null;
    const value = quantity && current ? current * quantity : null;
    const pnl = cost != null && value != null ? value - cost : null;
    const pnlPct = current && entry ? (current / entry - 1) * 100 : null;
    if (cost != null && value != null) {
      openCost += cost; openValue += value; unrealizedPnl += pnl; knownOpen++;
    } else if (!quantity) unknownQty++;
    return {
      symbol,
      entry,
      quantity: quantity ?? null,
      addedAt: Number(pos.addedAt) || null,
      current: current ?? null,
      cost: cost == null ? null : rnd(cost, 4),
      value: value == null ? null : rnd(value, 4),
      pnl: pnl == null ? null : rnd(pnl, 4),
      pnlPct: pnlPct == null ? null : rnd(pnlPct)
    };
  });

  const realizedPnl = history.reduce((a, x) => a + (Number(x.pnl) || 0), 0);
  const realizedBuy = history.reduce((a, x) => a + (Number(x.buyAmount) || 0), 0);
  const realizedSell = history.reduce((a, x) => a + (Number(x.sellAmount) || 0), 0);
  const wins = history.filter(x => Number(x.pnl) > 0).length;
  return {
    positions,
    held: Object.keys(positions),
    open,
    history,
    latestPrices,
    summary: {
      openCount: open.length,
      knownOpen,
      unknownQty,
      openCost: rnd(openCost, 4),
      openValue: rnd(openValue, 4),
      unrealizedPnl: rnd(unrealizedPnl, 4),
      unrealizedPct: openCost ? rnd(unrealizedPnl / openCost * 100) : 0,
      realizedPnl: rnd(realizedPnl, 4),
      realizedBuy: rnd(realizedBuy, 4),
      realizedSell: rnd(realizedSell, 4),
      closedTrades: history.length,
      wins,
      winRate: history.length ? rnd(wins / history.length * 100) : 0
    },
    note: '장부 손익은 거래소 수수료를 제외한 단순 매수가/매도가 기준입니다.'
  };
}

async function shouldNotify(env, type, symbol, candleStart, cooldownMs) {
  const key = `last:${type}:${symbol}`;
  // v7의 ETHUSDT 형태 cooldown key도 한 번 읽어 업그레이드 직후 중복 알림을 줄입니다.
  let raw = await env.SCALPER_KV.get(key);
  if (!raw) raw = await env.SCALPER_KV.get(`last:${type}:${symbol}USDT`);
  if (!raw) return { yes: true, key };
  let last = null;
  try { last = JSON.parse(raw); } catch { last = { sentAt: Number(raw), candleStart: null }; }
  if (Number(last?.candleStart) === Number(candleStart)) return { yes: false, key, reason: 'same-candle' };
  if (Number(last?.sentAt) && Date.now() - Number(last.sentAt) < cooldownMs) return { yes: false, key, reason: 'cooldown' };
  return { yes: true, key };
}

async function markNotified(env, key, candleStart, cooldownMs) {
  const sentAt = Date.now();
  await env.SCALPER_KV.put(key, JSON.stringify({ candleStart, sentAt }), {
    expirationTtl: Math.max(3600, Math.ceil(cooldownMs / 1000) + 600)
  });
}

async function scanAll(env, { notify = false, source = 'manual', asOf = Date.now() } = {}) {
  const cfg = strategyConfig(env);
  const startedAt = Date.now();
  const b5 = await recentClosed5m('BTC', asOf, 180);
  const expectedStart = Math.floor(asOf / FIVE_MIN) * FIVE_MIN - FIVE_MIN;
  if (b5.at(-1)?.[0] !== expectedStart) throw new Error('BTC 최신 완료 5분봉을 가져오지 못했습니다.');

  const results = [];
  for (const symbol of COINS) {
    try {
      const k5 = await recentClosed5m(symbol, asOf, 180);
      results.push(evaluateSignal(symbol, k5, b5, asOf, cfg));
    } catch (e) {
      results.push({ symbol, market: marketOf(symbol), signal: 'ERROR', error: e instanceof Error ? e.message : String(e) });
    }
    await sleep(130); // Upbit candle 그룹 제한을 여유 있게 지킵니다.
  }

  const positions = env.SCALPER_KV ? await getPositions(env) : {};
  const held = Object.keys(positions);
  const sellSignals = [];
  for (const s of results) {
    if (!Number.isFinite(s.score)) { s.held = !!positions[s.symbol]; continue; }
    if (positions[s.symbol]) {
      const q = sellCheck(s, positions[s.symbol], cfg);
      s.held = true;
      s.entry = positions[s.symbol].entry;
      s.quantity = positions[s.symbol].quantity ?? null;
      s.gain = q.gain;
      s.sell = q.sell;
      s.sellReasons = q.reasons;
      if (q.sell) sellSignals.push(s);
    } else {
      s.held = false;
      s.sell = false;
      s.sellReasons = [];
    }
  }

  const sent = [], sold = [], skipped = [];
  if (notify) {
    requireKV(env);
    requireTelegram(env);
    const buyCooldownMs = cfg.buyCooldownMin * 60000;
    const sellCooldownMs = cfg.sellCooldownMin * 60000;
    const buys = results
      .filter(x => x.signal === 'BUY' && !x.held && Number.isFinite(x.score))
      .sort((a, b) => b.confidence - a.confidence || b.score - a.score)
      .slice(0, cfg.maxBuyAlerts);

    for (const s of buys) {
      const gate = await shouldNotify(env, 'buy', s.symbol, s.candleStart, buyCooldownMs);
      if (!gate.yes) { skipped.push(`${s.symbol}:BUY:${gate.reason}`); continue; }
      await sendTelegram(env, formatBuy(s, cfg));
      await markNotified(env, gate.key, s.candleStart, buyCooldownMs);
      sent.push(s.symbol);
    }

    for (const s of sellSignals) {
      const gate = await shouldNotify(env, 'sell', s.symbol, s.candleStart, sellCooldownMs);
      if (!gate.yes) { skipped.push(`${s.symbol}:SELL:${gate.reason}`); continue; }
      await sendTelegram(env, formatSell(s));
      await markNotified(env, gate.key, s.candleStart, sellCooldownMs);
      sold.push(s.symbol);
    }
  }

  const bp = closes(b5);
  return {
    ok: true,
    version: VERSION,
    strategyVersion: STRATEGY_VERSION,
    source,
    notificationsEnabled: notify,
    scannedAt: Date.now(),
    asOf,
    candleStart: expectedStart,
    durationMs: Date.now() - startedAt,
    market: 'UPBIT_KRW',
    btcPrice: bp.at(-1) || null,
    btcRsi: rnd(RSI(bp)),
    btcRet5: rnd(pct(bp.at(-1), bp.at(-2))),
    held,
    positions,
    sent,
    sold,
    skipped,
    sellSignals: sellSignals.map(x => x.symbol),
    top: results.filter(x => Number.isFinite(x.score)).sort((a, b) => b.confidence - a.confidence || b.score - a.score).slice(0, 5),
    results,
    strategy: cfg
  };
}

function kstTime(ms) {
  if (!Number.isFinite(Number(ms))) return '—';
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
  }).format(new Date(ms));
}

function formatBuy(s, cfg) {
  return `🟢 BUY SIGNAL ${VERSION}\n\n${s.symbol}/KRW\n완료봉: ${kstTime(s.candleStart)} KST\n가격: ₩${fmt(s.price)}\nScore: ${s.score}/100 (기준 ${cfg.minScore})\n신뢰도: ${s.confidence}/100 · 위험: ${s.risk}\nBTC RSI: ${s.btcRsi} · ALT RSI: ${s.rsi}\nRSI 상대강도: ${s.rsiRel >= 0 ? '+' : ''}${s.rsiRel}p\n5m 상대모멘텀: ${s.relRet5 >= 0 ? '+' : ''}${s.relRet5}%\n거래량: ${s.volRatio}x · ATR: ${s.atrPct}%\nEMA9/20/50: ${fmt(s.ema9)} / ${fmt(s.ema20)} / ${fmt(s.ema50)}\n\n🎯 TP1 +${cfg.tp1Pct}%: ₩${fmt(s.tp1)}\n🎯 TP2 +${cfg.tp2Pct}%: ₩${fmt(s.tp2)}\n🛑 SL -${cfg.stopLossPct}%: ₩${fmt(s.sl)}\n\n근거: ${s.reasons.join(' · ')}\n⚠️ 알림 전용이며 주문은 자동 실행하지 않습니다.`;
}

function formatSell(s) {
  return `🔴 SELL CHECK ${VERSION}\n\n${s.symbol}/KRW\n완료봉: ${kstTime(s.candleStart)} KST\n현재가: ₩${fmt(s.price)}\n진입가(기록): ₩${fmt(s.entry)}\n${s.quantity ? `보유수량(기록): ${s.quantity} ${s.symbol}\n` : ''}현재 손익: ${s.gain >= 0 ? '+' : ''}${s.gain}%\nScore: ${s.score}/100 · 위험: ${s.risk}\nBTC RSI: ${s.btcRsi} · BTC 국면: ${s.regime}\nEMA9/20/50: ${fmt(s.ema9)} / ${fmt(s.ema20)} / ${fmt(s.ema50)}\n\n🚨 매도 검토 사유\n${s.sellReasons.map(x => `• ${x}`).join('\n')}\n\n⚠️ 실제 주문은 자동 실행하지 않습니다.`;
}

function fmt(x) {
  x = Number(x);
  if (!Number.isFinite(x)) return '—';
  return x >= 1000 ? x.toLocaleString('ko-KR', { maximumFractionDigits: 0 }) : x >= 1 ? x.toLocaleString('ko-KR', { maximumFractionDigits: 4 }) : x.toFixed(6);
}

async function sendTelegram(env, text) {
  requireTelegram(env);
  const r = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text })
  });
  if (!r.ok) {
    const body = await r.text().catch(() => '');
    throw new Error(`Telegram ${r.status}${body ? `: ${body.slice(0, 160)}` : ''}`);
  }
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
