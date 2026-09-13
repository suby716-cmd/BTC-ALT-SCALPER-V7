# BTC ALT REGIME TRADER v8.3.1 배포 체크리스트

이 문서는 기존 Worker/GitHub Pages를 v8.3.1 Regime Quality Manual Trader로 교체할 때 필요한 작업을 순서대로 정리한 것입니다. 자동 주문은 포함하지 않습니다.

## 1. GitHub 저장소에 파일 업로드

현재 ZIP의 내용을 기존 저장소에 덮어쓰거나 새 저장소에 올립니다.

- GitHub Pages 소스: `docs/`
- Cloudflare Worker 소스: `worker/worker.js`
- Worker 설정: `worker/wrangler.toml`

GitHub에는 Telegram Bot Token, Chat ID, Worker PIN을 절대 커밋하지 마세요.

## 2. Cloudflare Worker 코드 배포

기존 Worker를 계속 사용할 경우 `worker/worker.js`를 새 코드로 교체합니다.

Wrangler/Git 연동 배포를 사용한다면 Worker의 root directory가 `worker` 폴더를 가리키도록 하고 `wrangler.toml`이 함께 적용되게 합니다.

수동으로 Cloudflare Dashboard에서 코드를 붙여넣는 방식이라면, 코드 교체 후 아래의 Variables / KV / Cron 설정도 Dashboard에서 직접 확인해야 합니다.

## 3. Worker Secrets 확인

Cloudflare Worker → Settings / Variables and Secrets에서 다음 Secret 3개가 있어야 합니다.

- `SCALPER_PIN` — 웹 대시보드 접속용 PIN. 길고 추측하기 어려운 값을 권장합니다.
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`

기존 v7에서 Telegram 테스트가 정상이었다면 기존 Secret을 그대로 사용할 수 있습니다.

## 4. KV namespace 생성 및 binding

Cloudflare에서 KV namespace를 하나 만듭니다. 예: `BTC_ALT_SCALPER_KV`.

Worker에 KV binding을 추가합니다.

- Binding name: **`SCALPER_KV`**
- Namespace: 방금 만든 KV namespace

중요: 이름은 반드시 `SCALPER_KV`여야 합니다.

Wrangler로 관리한다면 `worker/wrangler.toml` 아래 부분의 주석을 해제하고 실제 namespace ID를 넣습니다.

```toml
[[kv_namespaces]]
binding = "SCALPER_KV"
id = "실제_KV_NAMESPACE_ID"
preview_id = "실제_PREVIEW_ID"
```

Dashboard에서 binding을 직접 추가했다면 파일의 placeholder를 억지로 채울 필요는 없습니다. 다만 이후 Wrangler 배포가 Dashboard 설정을 덮어쓰지 않는지 확인하세요.

## 5. 일반 환경변수 확인

기본값은 다음과 같습니다.

```text
MIN_SCORE=75
TP1_PERCENT=1.2
TP2_PERCENT=2.2
STOP_LOSS_PERCENT=0.8
BUY_COOLDOWN_MINUTES=20
SELL_COOLDOWN_MINUTES=60
MAX_BUY_ALERTS=2
CRON_DELAY_SECONDS=12
CONTEXT_BLOCK_THRESHOLD=-8
CONTEXT_SELL_THRESHOLD=-12
PATTERN_CONFIRMATION=true
PATTERN_BUY_MIN_SCORE=2
PATTERN_SELL_SCORE=-4
REGIME_ENGINE=true
TRADING_FEE_PERCENT=0.05
```

`wrangler.toml`로 배포하면 `[vars]` 값이 적용됩니다. Dashboard 수동 배포를 사용한다면 같은 값을 일반 Variables로 넣어두는 편이 안전합니다.

## 6. Cron Trigger 확인

Cloudflare Worker의 Trigger / Cron 설정에 다음 스케줄이 있어야 합니다.

```text
*/5 * * * *
```

Cloudflare Cron은 UTC 기준으로 해석하지만 `*/5`는 시간대와 관계없이 매 5분마다 실행되므로 한국에서도 그대로 사용하면 됩니다.

v8은 Cron 시작 후 기본 12초를 기다렸다가, 막 종료된 Upbit 5분봉을 조회합니다. 신호 계산에는 진행 중인 현재 봉을 사용하지 않습니다.

## 7. `/health` 확인

배포된 Worker가 예를 들어 아래라면:

```text
https://YOUR-WORKER.workers.dev
```

브라우저에서 다음을 엽니다.

```text
https://YOUR-WORKER.workers.dev/health
```

최소 아래 상태가 필요합니다.

```json
{
  "ok": true,
  "version": "v8.3.1",
  "kv": true,
  "telegramConfigured": true,
  "pinConfigured": true
}
```

`kv:false`이면 자동 알림 중복 방지와 보유 관리가 안전하지 않으므로 먼저 KV를 연결하세요.

v8.3.1에서는 `/health`의 `externalContext.manualOnly=true`, `adaptiveProfitReviews=true`, `autoTrading=false`도 확인할 수 있습니다. 이 값들은 **Telegram 수동매매 알림 전용**이고 주문 API가 없다는 의미입니다.

## 8. GitHub Pages에서 연결

GitHub Pages를 배포한 뒤 화면에서:

1. Cloudflare Worker URL 입력
2. Worker PIN 입력
3. `설정 저장`
4. `연결 점검`
5. `Telegram 테스트`
6. `Cron 상태`

순서로 확인합니다.

`연결 점검`에서 필수 설정이 모두 정상이고, `Cron 상태`에서 최근 5~10분 내 실행 기록이 보이면 **PC를 꺼도 24시간 자동 감시가 동작하는 상태**입니다.

## 9. v8의 중요한 동작 차이

### v8.3.1 수동매매 알림 종류

- `BUY REVIEW`: 신규 진입 검토. 실제 주문 없음.
- `TP1 PARTIAL REVIEW`: 동적 TP1 도달 시 1회. 부분익절 참고비율과 Runner 계획 표시.
- `TP2 / RUNNER REVIEW`: 동적 TP2 도달 시 1회. 남은 물량의 Trail 관리 검토.
- `SELL REVIEW`: 변동성 SL, Runner Trail 이탈, Regime 악화, 하락 패턴/복수 약화 등 매도 검토 사유.

모든 알림은 검토용이며 **실제 매수·매도는 사용자가 직접 실행하고 장부에 기록합니다.**

### 웹페이지를 열어도 Telegram 신호가 추가 발송되지 않습니다

`지금 조회(알림X)`는 시장을 새로 계산해 화면에만 표시합니다. Telegram BUY/SELL 자동 발송은 Cron에서만 합니다.

### 화면의 자동 갱신은 시장을 다시 스캔하지 않습니다

페이지는 60초마다 KV에 저장된 마지막 Cron 결과만 읽습니다. 여러 PC/휴대폰을 동시에 열어도 그 자체로 Telegram 중복 발송을 만들지 않습니다.

### 실시간/백테스트 모두 Upbit KRW입니다

`ETH/USDT` 같은 잘못된 표기를 제거했고, `ETH/KRW`, `SOL/KRW`처럼 실제 데이터 단위와 맞췄습니다.

### 보유 등록은 실제 매수가를 사용합니다

보유 체크 시 실제 진입가(KRW)를 입력해야 합니다. SELL 검토 알림의 손익 계산은 이 값을 사용합니다.

## v8.1.4 장부·기기 동기화 확인

배포 후 GitHub Pages의 **보유 · 매매 장부**에서 다음을 확인합니다.

1. 보유 체크 → 실제 매수가 + 보유 수량 입력
2. 체크가 즉시 유지되는지 확인
3. 장부에 매수가, 수량, 매입금액, 현재가, 평가손익이 표시되는지 확인
4. 실제 매도 후 매도가 + 매도 수량을 입력해 `매도 기록`
5. 부분 매도면 잔여 수량이 남고, 전량 매도면 보유 체크가 해제되는지 확인
6. 이미 끝난 과거 거래는 `지난 거래 직접 기록`으로 추가

7. 휴대폰 또는 다른 PC에서도 같은 GitHub Pages 주소를 열고 같은 Worker URL/PIN을 최초 1회 저장
8. 한 기기에서 보유 체크를 바꾼 뒤 다른 기기에서 약 15초 이내 또는 화면 복귀 시 반영되는지 확인
9. `UNI/KRW`, `AAVE/KRW`가 실시간 표와 백테스트 코인 목록에 보이는지 확인

> 보유/매매 데이터는 Cloudflare KV에 저장되어 기기 간 공유됩니다. Worker URL/PIN은 각 브라우저 로컬 저장이므로 새 기기에서는 다시 입력해야 합니다. Cloudflare KV는 전 세계 엣지에 전파되는 저장소라 아주 짧은 동기화 지연이 생길 수 있습니다.

장부 손익은 v8.1.4 당시에는 거래소 수수료 제외 기준이었고, v8.3.1부터는 `TRADING_FEE_PERCENT` 기준으로 매수·매도 수수료를 추정 반영합니다.

## v8.1.4 백테스트 확인

배포 후 백테스트 영역에서 다음 순서로 확인합니다.

1. 먼저 `기존 고정 TP/SL` + 최근 14일로 이전 결과와 기준선을 비교합니다.
2. 같은 기간을 `실전 SELL 동기형`으로 실행해 실제 Worker SELL 규칙을 반영했을 때 차이를 봅니다.
3. `개선형 ATR+SELL+Trail`을 실행해 변동성 적응형 결과를 비교합니다.
4. 기간을 30일 이상으로 늘리고 코인별 표본 수를 확인합니다.
5. `최적 조건 탐색`에서 Score 75/80/85/90을 비교합니다.
6. 반드시 `워크포워드 검증`에서 미래 35% 구간의 기대값·PF·MDD를 확인합니다.
7. 마지막으로 `스트레스 테스트`에서 비용과 슬리피지가 불리해져도 결과가 버티는지 확인합니다.

60~90일 ALL 백테스트는 Upbit 5분봉을 여러 페이지로 가져오므로 시간이 오래 걸릴 수 있습니다. 한 번 가져온 긴 기간 데이터는 같은 브라우저 세션에서 짧은 기간 테스트에 재사용됩니다.

> 백테스트/최적화 값은 실시간 Worker 설정에 자동 적용되지 않습니다. 실전 전략값 변경은 별도 검증 후 `wrangler.toml`/Cloudflare Variables를 수정하여 재배포해야 합니다.

## v8.3.1 Regime / 동적 Exit 확인

배포 후 다음을 확인합니다.

1. `/health`에서 `version: v8.3.1`, `strategyVersion: krw-5m-v8.3.1-regime-quality-manual`, `kv:true`, Telegram/PIN true 확인
2. 대시보드 상단 `대세 Regime`이 `STRONG_BULL / BULL / RANGE / BEAR / CRASH` 중 하나로 표시되는지 확인
3. 수동 `지금 조회(알림X)`에서 각 코인 행에 Regime, Pattern, 동적 Trade Plan이 표시되는지 확인
4. 실제 보유 등록 시 당시 Regime과 동적 SL/TP 계획이 장부에 저장되는지 확인
5. `BEAR/CRASH`에서는 신규 BUY Telegram이 차단되는지, `RANGE`에서는 강화된 진입조건이 적용되는지 확인
6. `STRONG_BULL/BULL`에서는 단기 Risk-Off 하나만으로 SELL이 발생하지 않고 복수 약화 조건 또는 긴급 위험이 필요한지 확인
7. 백테스트에서 같은 기간·같은 수수료로 `v8.2 비교 / Regime OFF`와 `v8.3.1 Regime Quality Filter / Regime ON`을 비교

### TP1/TP2/SL 해석

`TP1_PERCENT=1.2`, `TP2_PERCENT=2.2`, `STOP_LOSS_PERCENT=0.8`은 v8.3에서 더 이상 모든 코인에 그대로 강제되는 고정 청산값이 아니라 **동적 계획의 기준값(anchor)** 입니다. 실제 계획은 코인의 5분 ATR과 BTC 일봉 Regime에 따라 넓어지거나 좁아집니다.

- STRONG_BULL: 작은 눌림을 견디도록 SL/Trail과 목표폭을 넓히고 TP1은 전량매도가 아닌 일부익절 참고선
- BULL: 부분익절 + Runner 유지
- RANGE: 진입기준 강화, 이익보호를 빠르게
- BEAR/CRASH: 신규 BUY 차단, 기존 보유 위험 축소

Telegram의 BUY/SELL은 **검토 알림**입니다. 사용자가 직접 주문하며 Worker는 Upbit 주문 API를 호출하지 않습니다.

## 10. 문제가 있을 때

- `Unexpected token '<'` 대신 v8에서는 "JSON 대신 다른 응답"이라는 메시지가 나오도록 개선했습니다. 대부분 Worker URL이 잘못된 경우입니다.
- `unauthorized` → PIN 불일치
- `SCALPER_KV 바인딩이 없습니다` → KV binding 누락
- `Telegram Secret 설정이 없습니다` → Bot Token / Chat ID 누락
- `BTC 최신 완료 5분봉을 가져오지 못했습니다` → Upbit 일시 지연/통신 오류 가능. 다음 Cron에서도 반복되는지 확인
- `Cron 실행 지연 확인 필요` → 마지막 정상 Cron 결과가 12분 이상 오래됨. Cloudflare Cron Trigger / Worker Logs 확인

## 보안

- `SCALPER_PIN`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`는 GitHub에 넣지 않습니다.
- Worker PIN은 URL이나 스크린샷에 노출하지 않습니다.
- 이 프로젝트는 Upbit 주문 API Key를 사용하지 않습니다. 자동 주문 기능도 포함하지 않습니다.


## v8.1 외부 Context 추가 설정

기본 Macro는 U.S. Treasury · Federal Reserve Board · Cboe · BLS · EIA의 공개 원천을 직접 사용하며 별도 API 키가 필요 없습니다. Polymarket 공개시장 조회 역시 별도 API 키 없이 사용합니다. 대시보드의 `외부 컨텍스트 새로고침`, `수동 이벤트 추가`, `예측시장 추가` 버튼으로 사용할 수 있습니다.

코인 뉴스 자동점수를 사용하려면 Cloudflare Worker Secret에 선택적으로 다음을 추가합니다.

```text
CRYPTOPANIC_AUTH_TOKEN=발급받은_토큰
```

이 Secret은 GitHub에 넣지 않습니다. 토큰이 없으면 News 점수는 0으로 유지되고 나머지 기능은 정상 동작합니다.

`/health`에서 v8.3.1, `kv:true`, Telegram/PIN true를 확인한 뒤 대시보드에서 외부 Context를 새로고침합니다. 외부 데이터 제공자가 일시 실패해도 5분 가격 스캔은 계속 실행되도록 fail-open 설계되어 있습니다.

### Polymarket

Polymarket의 market ID(숫자)를 등록하고, 해당 시장에서 코인에 호재인 outcome(예: `Yes`)과 가중치를 설정합니다. 처음에는 가중치 2~4를 권장하며, 하나의 예측시장만으로 BUY가 생성되지는 않습니다.

### 수동 이벤트 예시

- GLOBAL +3, 72시간: 규제 법안 진전
- GLOBAL -4, 24시간: 지정학적 긴장 급증
- AAVE +4, 168시간: 공식 파트너십/프로토콜 업그레이드
- UNI -9, 12시간: 검증된 해킹/익스플로잇

점수는 사실 자체가 아니라 **해당 사건이 현재 전략의 위험선호에 미치는 영향에 대한 운영자 판단**입니다. 출처와 만료시간을 함께 기록하세요.


## v8.1.4 Macro 공개 원천 확인

추가 Secret 없이 동작합니다. 대시보드의 `외부 컨텍스트 새로고침` 후 Macro 품질 박스에서 다음 원천을 확인하세요.

- U.S. Treasury: 미 2Y / 10Y
- Federal Reserve Board H.10: 광의 달러지수 / USD·JPY
- Cboe: VIX / OVX
- BLS Public Data API v1: CPI / 실업률
- EIA: WTI 현물가격

각 항목은 `LIVE`, `CACHE`, `실패` 중 하나로 표시됩니다. 일부 공급자가 일시 실패해도 나머지 공급자는 독립적으로 계속 사용됩니다. 공개 Macro 전체가 부족한 경우 `N/A`로 표시되고 기술적 5분 스캔은 계속 동작합니다.


## v8.1.4 안정화 확인

- `/health`에서 `version: v8.3.1`, `kv:true`, Telegram/PIN true 확인
- 외부 Context 새로고침 후 9개 중 6개 이상이면 `부분 데이터`로 계산되어야 함
- BLS가 429를 반환해도 이미 저장된 최근 정상 캐시가 있으면 계속 사용하며, 12시간 이내에는 반복 호출하지 않음
- OVX 공개 CSV가 2열/다른 value 열 이름이어도 파서가 수치열을 탐색
- 배포 후 7일은 전략 값 변경 없이 오류·Cron·Telegram·장부 동기화만 관찰 권장


## v8.2 Pattern Confirmation 확인

배포 후 `/health`의 `strategy`에서 `patternConfirmation:true`, `patternBuyMinScore:2`, `patternSellScore:-4`를 확인합니다.

대시보드에서는 각 코인의 `Pattern` 열에 점수와 대표 패턴이 표시됩니다. BUY는 기존 Technical hard gate와 Context 보호장치에 더해 **확정된 상승 패턴 + Pattern Score 기준 + 15분 구조 비하락**을 모두 만족해야 합니다.

백테스트에서는 `v8.2 패턴확인 ON`과 `비교용 패턴 OFF`를 같은 코인·기간·수수료·슬리피지로 각각 실행해 거래수, PF, 기대값, MDD를 비교하세요. 하루 실전 손익만으로 설정을 다시 바꾸지 않는 것을 권장합니다.
