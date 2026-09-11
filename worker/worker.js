const COINS=['ETHUSDT','SOLUSDT','XRPUSDT','HBARUSDT','ONDOUSDT','LINKUSDT','AVAXUSDT','DOGEUSDT','SUIUSDT','TAOUSDT'];
const BASE='https://api.upbit.com/v1/candles/minutes';
const POS_KEY='positions';
const BUY_COOLDOWN_MIN=20;

function toMarket(symbol){return 'KRW-'+symbol.replace('USDT','')}

export default{
  async fetch(req,env){
    const u=new URL(req.url);
    if(req.method==='OPTIONS')return new Response('',{status:204,headers:cors()});
    if(req.method==='GET'&&u.pathname==='/health')return json({ok:true,version:'v7.2',engine:'numeric-self-validation',kv:!!env.SCALPER_KV});
    if(req.method==='POST'&&u.pathname==='/test'){
      if(!auth(req,env))return json({ok:false,error:'unauthorized'},401);
      await sendTelegram(env,'🧪 BTC ALT SCALPER v7.2\nTelegram 연결 테스트 성공');
      return json({ok:true});
    }
    if(req.method==='POST'&&u.pathname==='/position'){
      if(!auth(req,env))return json({ok:false,error:'unauthorized'},401);
      if(!env.SCALPER_KV)return json({ok:false,error:'SCALPER_KV 바인딩이 없습니다.'},500);
      let body={};try{body=await req.json()}catch{}
      const symbol=String(body.symbol||'').toUpperCase();
      if(!COINS.includes(symbol))return json({ok:false,error:'지원하지 않는 코인입니다.'},400);
      const action=body.action==='remove'?'remove':'add';
      const positions=await getPositions(env);
      if(action==='add'){
        positions[symbol]={entry:Number(body.entry)||null,addedAt:Date.now()};
      }else{
        delete positions[symbol];
      }
      await env.SCALPER_KV.put(POS_KEY,JSON.stringify(positions));
      return json({ok:true,held:Object.keys(positions),positions});
    }
    if(req.method==='POST'&&u.pathname==='/positions'){
      if(!auth(req,env))return json({ok:false,error:'unauthorized'},401);
      if(!env.SCALPER_KV)return json({ok:false,error:'SCALPER_KV 바인딩이 없습니다.'},500);
      const positions=await getPositions(env);
      return json({ok:true,held:Object.keys(positions),positions});
    }
    if(req.method==='POST'&&u.pathname==='/scan'){
      if(!auth(req,env))return json({ok:false,error:'unauthorized'},401);
      return json(await scanAll(env,false));
    }
    return json({ok:false,error:'not found'},404)
  },
  async scheduled(e,env,ctx){ctx.waitUntil(scanAll(env,false))}
};

function cors(){return{'access-control-allow-origin':'*','access-control-allow-methods':'GET,POST,OPTIONS','access-control-allow-headers':'content-type,x-scalper-pin'}}
function auth(r,e){return r.headers.get('x-scalper-pin')===e.SCALPER_PIN}
function json(x,s=200){return new Response(JSON.stringify(x),{status:s,headers:{'content-type':'application/json',...cors()}})}

async function kl(symbol,interval='5m',limit=160){
  const unit=interval==='5m'?5:15,market=toMarket(symbol);
  const r=await fetch(`${BASE}/${unit}?market=${market}&count=${limit}`,{headers:{'Accept':'application/json'}});
  if(!r.ok)throw Error(`Upbit ${r.status}`);
  const data=await r.json();
  return data.reverse().map(c=>[c.timestamp,c.opening_price,c.high_price,c.low_price,c.trade_price,c.candle_acc_trade_volume]);
}
const cls=k=>k.map(x=>+x[4]), vols=k=>k.map(x=>+x[5]);
function EMA(a,n){if(!a.length)return 0;let e=a[0],m=2/(n+1);for(let i=1;i<a.length;i++)e=a[i]*m+e*(1-m);return e}
function RSI(a,n=14){if(a.length<n+1)return 50;let g=0,l=0;for(let i=1;i<=n;i++){let d=a[i]-a[i-1];if(d>=0)g+=d;else l-=d}let ag=g/n,al=l/n;for(let i=n+1;i<a.length;i++){let d=a[i]-a[i-1];ag=(ag*(n-1)+(d>0?d:0))/n;al=(al*(n-1)+(d<0?-d:0))/n}return al===0?100:100-100/(1+ag/al)}
function ATR(k,n=14){if(k.length<n+1)return 0;const t=[];for(let i=1;i<k.length;i++){const h=+k[i][2],lo=+k[i][3],pc=+k[i-1][4];t.push(Math.max(h-lo,Math.abs(h-pc),Math.abs(lo-pc)))}return t.slice(-n).reduce((a,b)=>a+b,0)/n}
const pct=(a,b)=>b?(a/b-1)*100:0,clamp=(x,a,b)=>Math.max(a,Math.min(b,x)),rnd=(x,n=2)=>Number(x.toFixed(n));

async function calc(symbol,b5,b15){
  const [k5,k15]=await Promise.all([kl(symbol,'5m',160),kl(symbol,'15m',100)]);
  const p=cls(k5),v=vols(k5),bp=cls(b5),p15=cls(k15),bp15=cls(b15);
  const price=p.at(-1),e9=EMA(p,9),e20=EMA(p,20),e50=EMA(p,50),be20=EMA(bp,20),be50=EMA(bp,50);
  const r=RSI(p),br=RSI(bp),r15=RSI(p15),br15=RSI(bp15),relR=r-br,ret=pct(price,p.at(-2)),bret=pct(bp.at(-1),bp.at(-2)),relRet=ret-bret;
  const av=v.slice(-21,-1).reduce((a,x)=>a+x,0)/20,vr=av?v.at(-1)/av:1,rh=Math.max(...p.slice(-21,-1)),breakout=price>=rh*.9995,atrPct=price?ATR(k5)/price*100:0;
  const slope5=pct(e20,p.at(-6)),btcSlope=pct(be20,bp.at(-6));
  let score=0,reasons=[];
  score+=clamp((relR-2)*2.2,0,22);if(relR>=5)reasons.push(`RSI 상대강도 +${rnd(relR)}p`);
  if(e9>e20){score+=12;reasons.push('단기 추세 상승')}
  if(e20>e50){score+=8;reasons.push('중기 추세 상승')}
  if(r15>br15){score+=10;reasons.push('15m 상대강도 우위')}
  score+=clamp(relRet*3,0,16);if(relRet>.35)reasons.push(`5m 상대모멘텀 +${rnd(relRet)}%`);
  score+=clamp((vr-1)*25,0,14);if(vr>=1.15)reasons.push(`거래량 ${rnd(vr)}x`);
  if(breakout){score+=10;reasons.push('최근 고점 돌파')}
  if(r>=52&&r<=72)score+=8;else if(r>76){score-=10;reasons.push('RSI 과열')}
  if(atrPct<.25){score-=6;reasons.push('변동성 부족')}
  if(slope5>0)score+=2;if(btcSlope>0)score+=2;score=clamp(score,0,100);
  const crash=bret<=-.9||br<40||bp.at(-1)<be20*.995,regime=br>=48&&br<=68&&bp.at(-1)>be20?'RISK_ON':'RISK_OFF';
  const hard=score>=75&&regime==='RISK_ON'&&r>=52&&r<=72&&relR>=5&&e9>e20&&vr>=1.15&&relRet>0&&!crash;
  const signal=hard?'BUY':(score>=60&&!crash?'WATCH':'IDLE');
  const confidence=clamp(score*.72+(regime==='RISK_ON'?10:-8)+(r15>br15?6:0)+(breakout?4:0)-(atrPct<.25?8:0)-(r>76?12:0),0,100);
  const risk=crash||regime==='RISK_OFF'||r>76?'HIGH':confidence>=82?'LOW':'MEDIUM';
  return{symbol,price,btcPrice:bp.at(-1),score:rnd(score),confidence:rnd(confidence),risk,signal,rsi:rnd(r),btcRsi:rnd(br),rsiRel:rnd(relR),rsi15:rnd(r15),btcRsi15:rnd(br15),ret5:rnd(ret),btcRet5:rnd(bret),relRet5:rnd(relRet),ema9:rnd(e9),ema20:rnd(e20),ema50:rnd(e50),volRatio:rnd(vr),breakout,atrPct:rnd(atrPct,3),regime,btcCrash:crash,tp1:price*1.05,tp2:price*1.10,sl:price*.95,reasons:reasons.slice(0,5)}
}

async function getPositions(env){
  const raw=await env.SCALPER_KV.get(POS_KEY);
  if(!raw)return{};
  try{return JSON.parse(raw)||{}}catch{return{}}
}

async function scanAll(env,force=false){
  const[b5,b15]=await Promise.all([kl('BTCUSDT','5m',160),kl('BTCUSDT','15m',100)]);
  const results=[];
  for(const c of COINS){try{results.push(await calc(c,b5,b15))}catch(e){results.push({symbol:c,signal:'ERROR',error:e.message})}await sleep(250)}
  const positions=env.SCALPER_KV?await getPositions(env):{};
  const held=Object.keys(positions);
const events=[];let positionsChanged=false;
  for(const s of results){
    const pos=positions[s.symbol];
    if(!pos){s.held=false;s.sell=false;s.sellReasons=[];continue}
    s.held=true;
    const entry=Number(pos.entry)||0,gain=entry?((s.price/entry)-1)*100:0;
    s.entry=entry||null;s.gain=rnd(gain);
    if(entry&&!pos.notifiedSL&&s.price<=entry*.95){events.push({symbol:s.symbol,type:'SL',s,entry,gain:rnd(gain)});pos.notifiedSL=true;positionsChanged=true}
    if(entry&&!pos.notifiedTP2&&s.price>=entry*1.10){events.push({symbol:s.symbol,type:'TP2',s,entry,gain:rnd(gain)});pos.notifiedTP2=true;pos.notifiedTP1=true;positionsChanged=true}
    else if(entry&&!pos.notifiedTP1&&s.price>=entry*1.05){events.push({symbol:s.symbol,type:'TP1',s,entry,gain:rnd(gain)});pos.notifiedTP1=true;positionsChanged=true}
    const reasons=[];
    if(s.regime==='RISK_OFF')reasons.push('BTC 시장국면 Risk-Off');
    if(s.ema9<s.ema20)reasons.push('단기 추세 하락 전환');
    if(s.relRet5<0)reasons.push('BTC 대비 상대모멘텀 약화');
    if(s.score<48)reasons.push('종합 Score 약세(<48)');
    if(s.btcCrash)reasons.push('BTC 급락/약세 감지');
    const bearishCount=[s.regime==='RISK_OFF',s.ema9<s.ema20,s.relRet5<0,s.score<48].filter(Boolean).length;
    const reversal=bearishCount>=3||s.btcCrash;
    s.sell=reversal;s.sellReasons=reasons;
    if(reversal&&!pos.reversalActive){events.push({symbol:s.symbol,type:'SELL',s,entry,gain:rnd(gain),reasons});pos.reversalActive=true;positionsChanged=true}
    else if(!reversal&&pos.reversalActive){pos.reversalActive=false;positionsChanged=true}
  }
  if(positionsChanged&&env.SCALPER_KV)await env.SCALPER_KV.put(POS_KEY,JSON.stringify(positions));

  const buys=results.filter(x=>x.signal==='BUY'&&!x.held).sort((a,b)=>b.confidence-a.confidence||b.score-a.score),sent=[],sold=[];
  const now=Date.now(),cool=Number(env.COOLDOWN_MINUTES||BUY_COOLDOWN_MIN)*60000;
  for(const s of buys.slice(0,2)){
    const key=`last:buy:${s.symbol}`,last=env.SCALPER_KV?await env.SCALPER_KV.get(key):null;
    if(!force&&last&&now-Number(last)<cool)continue;
    await sendTelegram(env,format(s));sent.push(s.symbol);
    if(env.SCALPER_KV)await env.SCALPER_KV.put(key,String(now),{expirationTtl:Math.max(3600,Math.floor(cool/1000))});
  }

  for(const ev of events){
    const msg=ev.type==='SL'?formatSL(ev):ev.type==='TP1'?formatTP(ev,1):ev.type==='TP2'?formatTP(ev,2):formatSell(ev);
    await sendTelegram(env,msg);sold.push(`${ev.symbol}(${ev.type})`);
  }
  return{ok:true,version:'v7.2',btcPrice:+b5.at(-1)?.[4]||null,btcRsi:RSI(cls(b5)),btcRet5:pct(+b5.at(-1)?.[4],+b5.at(-2)?.[4]),held,sent,sold,top:results.filter(x=>x.score!=null).sort((a,b)=>b.confidence-a.confidence||b.score-a.score).slice(0,5),results};
}

function format(s){return `🟢 BUY SIGNAL v7\n\n${s.symbol.replace('USDT','/USDT')}\n가격: ${fmt(s.price)}\nScore: ${s.score}/100\n신뢰도: ${s.confidence}/100 · 위험: ${s.risk}\nBTC RSI: ${s.btcRsi} · ALT RSI: ${s.rsi}\nRSI 상대강도: ${s.rsiRel>=0?'+':''}${s.rsiRel}p\n5m 상대모멘텀: ${s.relRet5>=0?'+':''}${s.relRet5}%\n거래량: ${s.volRatio}x · ATR: ${s.atrPct}%\nEMA: ${s.ema9} > ${s.ema20} > ${s.ema50}\n\n🎯 TP1 +5%: ${fmt(s.tp1)} (매수 시 참고용 목표가)\n🎯 TP2 +10%: ${fmt(s.tp2)}\n🛑 참고 손절선 -5%: ${fmt(s.sl)}\n\n근거: ${s.reasons.join(' · ')}\n⚠️ 수동매매 신호. 체결 전 호가/뉴스/변동성을 확인하세요. 실제 매수하시면 화면에서 '보유' 체크를 해주셔야 이후 TP/SL/SELL 알림을 받습니다.`}
function formatSL(ev){return `🔴 SELL 시그널 v7 (-5% 하락)\n\n${ev.symbol.replace('USDT','/USDT')}\n현재가: ${fmt(ev.s.price)}\n매수가(기록): ${fmt(ev.entry)}\n손익: ${ev.gain>=0?'+':''}${ev.gain}%\n\n⚠️ 매수가 대비 -5% 하락했습니다. 매도 여부를 검토하세요.\n(이 알림은 이번 보유 동안 1회만 발송됩니다.)`}
function formatTP(ev,tier){const label=tier===1?'+5%':'+10%';const advice=tier===1?'보유 수량의 절반(50%) 정도 익절을 고려해보세요. 나머지는 추세를 좀 더 지켜볼 수 있습니다.':'남은 물량의 익절도 고려해보세요. 계속 보유하신다면 손절선을 매수가 부근으로 올려 이익을 보호하는 것도 방법입니다.';return `🎯 TP${tier} 도달 v7 (${label})\n\n${ev.symbol.replace('USDT','/USDT')}\n현재가: ${fmt(ev.s.price)}\n매수가(기록): ${fmt(ev.entry)}\n손익: +${ev.gain}%\n\n💡 ${advice}\n(이 알림은 이번 보유 동안 1회만 발송됩니다.)`}
function formatSell(ev){return `🟠 하락반전 경계 v7\n\n${ev.symbol.replace('USDT','/USDT')}\n현재가: ${fmt(ev.s.price)}\n매수가(기록): ${ev.entry?fmt(ev.entry):'—'}\n손익: ${ev.entry?(ev.gain>=0?'+':'')+ev.gain+'%':'—'}\nScore: ${ev.s.score}/100 · 위험: ${ev.s.risk}\n\n근거(아래 중 3개 이상 동시 충족 또는 BTC 급락):\n${ev.reasons.map(x=>'• '+x).join('\n')}\n\n⚠️ 아직 -5% 손절선은 아니지만, 추세가 약해지는 조기 경고입니다. 매도 여부를 직접 판단하세요.\n(상태가 계속 유지되는 동안은 반복 발송되지 않고, 조건이 풀렸다가 다시 발생하면 재발송됩니다.)`}
function fmt(x){return x>=1000?x.toLocaleString('en-US',{maximumFractionDigits:2}):x>=1?x.toFixed(4):x.toFixed(6)}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function sendTelegram(env,text){const r=await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({chat_id:env.TELEGRAM_CHAT_ID,text})});if(!r.ok)throw Error(`Telegram ${r.status}`)}
