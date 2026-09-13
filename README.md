# BTC ALT REGIME TRADER v8.3.1

Upbit KRW 시장을 대상으로 **BTC 완료 일봉 Market Regime + 15분 구조 + 5분 기술·패턴 + 외부 Context**를 결합하고, Cloudflare Worker Cron이 24시간 감시하여 Telegram으로 BUY/SELL **검토 알림**만 보내는 수동매매 보조 시스템입니다.

> 이 프로젝트는 주문을 자동 실행하지 않습니다. Telegram 알림을 바탕으로 사용자가 직접 판단하는 수동매매 보조 도구입니다.



## v8.3.1 Regime Quality Filter

v8.3.0의 동일 90일 ALL 검증에서 `PF 0.92 / 복리 약 -6% / MDD 약 11%`까지 개선된 뒤, Regime별로 보면 `STRONG_BULL PF 1.11`, `BULL PF 0.97`, `RANGE PF 0.54`로 RANGE 구간이 손실의 핵심임이 확인되었습니다. Score 구간도 75~79가 오히려 PF 1.36으로 가장 좋고 80 이상이 악화되어, 단순히 Score 임계값을 높이는 대신 **시장 품질 필터**를 강화했습니다.

### 핵심 변경

- `RANGE`: 신규 BUY Telegram을 완전 차단하고 WATCH/분석만 유지
- `Alt Relative Strength Quality`: 15분 RSI의 BTC 대비 상대강도와 중기 EMA 품질을 추가 확인
- `Anti-Chase`: EMA20 대비 ATR 이격, 1~2봉 급등, 거래량 폭증을 이용해 과열 추격 진입을 WAIT 처리
- `Hard / Soft BTC Risk` 분리: 진짜 급락만 긴급 SELL 검토, 상승장의 단기 Risk-Off는 다른 약화 신호와 함께 확인
- 백테스트에 `v8.3.1 Regime Quality Filter`와 `v8.3.0 Regime+Adaptive 비교`를 동시에 남겨 동일 90일에서 직접 비교 가능
- 자동 주문은 계속 미지원. Telegram 수동매매 검토 방식 유지

1차 목표는 동일 90일 조건에서 v8.3.0의 `PF 0.92`를 v8.3.1이 `PF > 1.0`으로 넘기는지 확인하는 것입니다. 결과가 개선되지 않으면 해당 필터를 실전 우위로 간주하지 않습니다.

## v8.3.0 Market Regime + Regime-Adaptive Exit

v8.2의 90일 ALL 백테스트에서 Pattern ON이어도 거래 575회, 승률 28.7%, 복리 -57.65%, PF 0.54, MDD 60.63%가 나타난 문제를 단순히 패턴 추가로 해결하지 않고 **대세 상승·하락장에 따라 진입과 청산 규칙 자체를 바꾸는 구조**로 개선했습니다.

### 1) BTC 완료 일봉 Market Regime

BTC 완료 일봉의 20/50/200 EMA, 30·90일 수익률, 90일 고점 대비 낙폭, 일봉 RSI, 추세 기울기를 점수화해 다음 5단계로 분류합니다.
Upbit 일봉은 **00:00 KST** 기준으로 완료 여부를 판단해 현재 진행 중인 일봉은 Regime 계산과 백테스트에서 제외합니다.

- `STRONG_BULL` — 강한 상승장
- `BULL` — 상승장
- `RANGE` — 횡보/혼조
- `BEAR` — 하락장
- `CRASH` — 강한 하락/급락장

고정적인 “4년마다 오른다” 규칙을 직접 매매 신호로 쓰지 않습니다. 반감기/장기 사이클 현상은 가격 자체에 이미 반영되므로, 실제 200EMA·30/90일 수익률·낙폭이 확인될 때만 상승장으로 판정합니다.

### 2) Regime별 신규 BUY 정책

- `STRONG_BULL/BULL`: 기존 Score + Pattern 확인을 통과하면 BUY 검토 가능
- `RANGE` (v8.3.0 비교모드): Score 기준을 기본보다 +7 높이고 Pattern +4 이상, 15분 구조 UP 요구
- `RANGE` (v8.3.1 실전모드): 신규 BUY 차단, WATCH/분석만 유지
- `BEAR/CRASH`: 신규 BUY Telegram 차단. 반등 패턴을 “대세 상승 전환”으로 오인하지 않도록 함

### 3) 고정 TP1/TP2/SL을 Regime + ATR 적응형으로 교체

`1.2% / 2.2% / 0.8%`를 절대값으로 사용하지 않습니다. 각 코인의 5분 ATR과 현재 Regime을 사용해 SL, TP1, TP2, Trail, 1차 익절 비율, 최대 관찰시간을 계산합니다.

예시 방향:

- `STRONG_BULL`: 더 넓은 SL/TP, TP1 30%만 부분익절, 최대 72시간 Runner 허용
- `BULL`: TP1 40% 부분익절, 최대 48시간
- `RANGE`: TP1 50%, 최대 24시간
- `BEAR`: 신규 BUY 차단이 기본이며 기존 보유는 더 민감하게 위험 축소

### 4) 상승장 SELL 과민반응 완화

기존에는 BTC 5분 `RISK_OFF`만으로도 SELL 검토 사유가 될 수 있었습니다. v8.3은 `STRONG_BULL/BULL`에서 작은 눌림 또는 단기 Risk-Off 하나만으로 SELL하지 않고 **하락 패턴 + 15분 DOWN + EMA/상대모멘텀 약화 등 복수 약화 조건**을 요구합니다. 반대로 `CRASH`, 동적 SL 도달, 외부 고위험 이벤트는 긴급 SELL 검토로 분류합니다.

### 5) 거래 회전율/수수료 문제 + 수동 Runner 관리

- 백테스트는 기존처럼 편도 수수료와 슬리피지를 반영합니다.
- 장부도 v8.3부터 편도 `TRADING_FEE_PERCENT=0.05` 기본값을 매수·매도 양쪽에 추정 반영하여 순손익을 표시합니다.
- 신규 보유 등록 시 당시 Regime과 동적 SL/TP/Trail 계획을 KV에 함께 저장합니다.
- Cron은 보유 포지션의 **완료 5분봉 종가 기준 Peak**를 추적합니다. intrabar 고가를 쓰지 않아 한 봉 안에서 고가와 저가 중 무엇이 먼저 나왔는지 모르는 문제를 피합니다.
- TP1 도달 시 `TP1 PARTIAL REVIEW`를 한 번 보내며, Regime별 부분익절 비율을 **참고값**으로 제시합니다. 실제 매도는 사용자가 직접 합니다.
- TP2 도달 시 `TP2 / RUNNER REVIEW`를 한 번 보내고, 남은 물량은 Peak 대비 동적 Trail로 보호합니다.
- 실제 부분매도를 장부에 기록하면 남은 수량은 동일 포지션으로 계속 관리됩니다.

### 6) 수동매매 전용

v8.3도 **주문 API를 호출하지 않습니다.** BUY/SELL은 Telegram 검토 알림이며, 실제 매수·매도는 사용자가 직접 판단·실행합니다. 자동매매 기능이나 Upbit 로그인/API 주문 권한은 포함하지 않습니다.

### 7) 백테스트 비교

대시보드에서 아래 조합을 같은 기간·같은 수수료 조건으로 비교할 수 있습니다.

- `v8.3 Regime+Adaptive Exit / Regime ON`
- `v8.2 ATR+SELL+Trail / Regime OFF`
- `Pattern ON/OFF`

목표는 거래 횟수를 무조건 늘리는 것이 아니라 **PF·기대값을 양수로 만들고 MDD·수수료 회전율을 낮추는 것**입니다.

> v8.3 역시 수익을 보장하지 않습니다. 특히 전략 변경 후에는 30/60/90일 비교, 워크포워드, 비용 스트레스, 실제 수동 관찰을 함께 확인해야 합니다.

## v8.2.0 Pattern Confirmation Engine

하루 손익만으로 전략의 우열을 확정할 수는 없지만, v8.1.x의 진입이 **점수는 높아도 차트 구조 확인 없이 발생할 수 있는 문제**를 줄이기 위해 신규 BUY를 더 보수적으로 바꿨습니다.

- 기존 Technical Score ≥ 기준값은 그대로 유지합니다.
- 그 위에 **확정된 상승 패턴 + 완료봉 종가 + 거래량 확인 + 15분 구조 비하락**을 추가로 요구합니다.
- 패턴 자체가 BUY를 만들 수 없습니다. 기존 RSI/EMA/상대강도/거래량/BTC Risk-On 조건을 모두 통과한 뒤 마지막 확인 필터로만 작동합니다.
- 하락 패턴/가짜 돌파는 보유 포지션의 SELL 검토 사유와 위험도에 반영합니다.
- Pattern Score 기본 범위는 `-8 ~ +8`, BUY 확인 기본값은 `+2 이상`, SELL 경고 기본값은 `-4 이하`입니다.
- 백테스트 화면에서 `v8.2 패턴확인 ON / 비교용 패턴 OFF`를 바꿔 같은 기간 성과를 직접 비교할 수 있습니다.

### 포함한 공개 패턴 구조

- **Trading range breakout / breakdown**: 종가와 거래량으로 확정
- **Breakout retest / throwback**: 돌파한 저항을 지지로 재확인
- **Wyckoff Spring / Upthrust**: 지지·저항의 실패 돌파와 범위 복귀
- **VCP-inspired contraction**: 변동폭과 거래량 수축 뒤 피벗 돌파
- **Bull/Bear Flag**: impulse → 저거래량 조정 → 재돌파/재이탈
- **Ascending/Descending Triangle**
- **Flat Base / Rectangle**
- **Double Bottom / Double Top + neckline 확인**
- **15분 Market Structure 확인**: 5분봉 잡음 필터

특정 인플루언서의 실시간 매매 신호나 유료/독점 규칙을 복제하지 않습니다. Mark Minervini의 공개 VCP 개념, Wyckoff의 공개 시장구조/스프링·업스러스트 개념, CMT의 가격·거래량 확인 원칙, 고전적 breakout/flag/triangle 구조를 **재현 가능한 수치 규칙**으로 구현했습니다.

> v8.2는 수익을 보장하지 않습니다. 특히 하루 수익률은 표본이 너무 작습니다. 배포 후 30/60/90일 백테스트에서 Pattern ON/OFF를 비교하고, 실전에서는 소액·관찰 중심으로 검증하세요.

## v8.1.4 안정화판

이번 버전은 신규 기능 추가보다 **운영 안정화**가 목적입니다.

- 공개 Macro 9개 중 6개 이상 확보하면 `부분 데이터`로 안전하게 사용합니다.
- BLS CPI/실업률은 월간 지표이므로 12시간 이내에는 KV 캐시를 재사용해 429를 줄입니다.
- Cboe OVX CSV 열 이름이 바뀌어도 DATE + 수치열을 유연하게 찾도록 파서를 보강했습니다.
- 7일 동안 전략 파라미터/기능을 가급적 바꾸지 않고 Cron, Telegram, Macro 품질, 실제 매매장부를 관찰하는 것을 권장합니다.

### 보유·매매 장부 빠른 사용법

1. 실제로 매수한 코인만 메인 표의 `보유` 체크박스를 체크하고 **실제 매수가와 실제 보유 수량**을 입력합니다.
2. 장부의 `현재 보유`에서 매입금액·평가금액·미실현손익을 확인합니다.
3. 실제 매도 후 장부의 `실제 매도가`와 `매도수량`을 넣고 `매도 기록`을 누릅니다. 일부만 매도하면 남은 수량은 계속 보유로 남습니다.
4. 잘못 입력한 보유정보는 `수정`, 과거 거래는 `지난 거래 직접 기록`으로 보완합니다.
5. 데이터는 Cloudflare KV에 저장되어 집/업무 PC/휴대폰에서 같은 Worker URL과 PIN을 쓰면 공유됩니다.

> 참고: 위 문장은 v8.1 당시 동작 설명입니다. **v8.3 장부는 매수·매도 양쪽의 추정 수수료를 반영합니다.**


## v8.1.1 웹 연결 상태 긴급 수정

- v8.1.0 웹 대시보드에서 보유/장부 동기화 함수가 누락되어 초기 로딩 시 `syncPositions is not defined`가 발생하던 문제를 수정했습니다.
- 복구 함수: `applyHeldState`, `syncPositions`, `renderLedger`, `loadLedger`, `registerPosition`.
- Worker/KV/Telegram은 정상 연결되어 있었지만 웹 상단이 `연결 확인 필요`로 표시되고 Cron 상태/장부가 렌더링되지 않던 증상을 해결합니다.
- v8.1 Context/Macro/Prediction/Manual event 및 12개 코인 감시는 그대로 유지합니다.


## v8.1.4 공개 원천 Macro

FRED 의존을 제거하고 **미국 정부·공식 거래소의 공개 원천자료**를 직접 읽도록 바꿨습니다. 별도 Macro API Key가 필요하지 않습니다.

- **U.S. Treasury**: Daily Treasury Par Yield Curve XML에서 2Y·10Y 국채수익률
- **Federal Reserve Board H.10**: Nominal Broad Dollar Index와 USD/JPY
- **Cboe**: VIX와 OVX(원유 변동성)
- **BLS Public Data API v1**: CPI와 실업률
- **EIA**: Cushing WTI 현물가격
- 공급자별로 독립 수집하여, 예를 들어 Cboe만 실패해도 Treasury/Fed/BLS/EIA 자료는 계속 사용합니다.
- 각 공개 원천이 실패하면 **공급자별 최근 정상 KV 캐시**를 사용하며, 캐시/누락 비율에 따라 Macro 점수와 신뢰도를 보수적으로 낮춥니다.
- 대시보드에 각 지표의 `LIVE / CACHE / 실패`와 원 출처를 표시합니다.
- Macro가 충분히 확보되지 않으면 `+0.00` 중립으로 위장하지 않고 `부분 데이터` 또는 `N/A`로 표시합니다.
- FOMC 이벤트 위험 패널티는 외부 데이터 공급 장애와 독립적으로 유지합니다.

## v8.1 외부 컨텍스트 연구 레이어

기술적 Score는 그대로 유지하고, 외부 환경을 별도 Context Score로 계산합니다. **외부 호재만으로 BUY를 만들지 않으며 기술적 진입 조건은 반드시 통과해야 합니다.**

- 자동 거시 프록시: Treasury 10Y/2Y, Cboe VIX·OVX, Fed Broad Dollar·USD/JPY, EIA WTI, BLS CPI·실업률
- FOMC 이벤트 창: 방향을 예측하지 않고 발표 전후 신규진입 불확실성 패널티
- Polymarket: 사용자가 등록한 시장 ID의 확률을 가중치 점수로 반영
- 수동 이벤트: CLARITY 법안, Treasury buyback, 전쟁/휴전, ETF, 파트너십, 규제, 해킹 등 +10~-10과 만료시간으로 등록
- CryptoPanic(선택): Secret이 있을 때만 12개 코인의 최근 뉴스 제목·투표를 저가중치로 점수화
- Context가 강하게 부정적이면 BUY를 차단하고, 보유 포지션에서는 기술 약세와 함께 SELL 검토 사유로 추가
- 매시간 Context snapshot을 KV에 남겨 향후 외부지표 포함 워크포워드 연구용 데이터를 축적

기본 보호값은 `CONTEXT_BLOCK_THRESHOLD=-8`, `CONTEXT_SELL_THRESHOLD=-12`입니다. 호재 점수는 기술적 진입을 대신하지 않습니다.

> Treasury buyback, 법안 통과, 전쟁, 선거 같은 사건의 방향성은 단순하지 않으므로 코드에 영구적인 +점수로 하드코딩하지 않았습니다. 현재 상황에 맞는 수동 이벤트 또는 예측시장 확률로 반영하도록 설계했습니다.

## v8.0.2부터 유지되는 장부·기기동기화 기능

- **다중 기기 보유 동기화 강화**: 업무용 PC·집 PC·휴대폰이 같은 Worker/KV 보유 상태를 공유
- **체크박스 깜빡임 방지**: 체크/해제 직후 서버가 반환한 최신 상태를 화면에 즉시 반영
- **15초 보유 상태 동기화**: 다른 기기에서 바꾼 보유 상태를 열린 화면이 자동 재조회
- **화면 복귀 즉시 동기화**: 휴대폰/PC 탭으로 돌아오면 보유/장부 상태 즉시 갱신
- **UNI/KRW, AAVE/KRW 추가**: 실시간 스캔·Telegram·보유관리·백테스트 대상에 추가

> Worker URL과 PIN은 보안상 각 브라우저의 localStorage에 따로 저장됩니다. 따라서 새 PC/휴대폰에서는 처음 한 번 같은 Worker URL과 PIN을 입력해야 합니다. 보유/매매 데이터 자체는 Cloudflare KV에 저장되어 기기 간 공유됩니다. KV 특성상 다른 기기에 반영될 때 짧은 지연이 있을 수 있습니다.

## v8.0.3 백테스트 보강

최근 14일 단순 TP/SL 백테스트에서 손실이 크게 나타난 문제를 진단하기 위해, 백테스트를 **수익률을 예쁘게 만드는 방향이 아니라 실전 동작을 더 정확히 재현하고 과적합을 줄이는 방향**으로 보강했습니다.

- 기간: 7 / 14 / 30 / 60 / 90일
- `실전 SELL 동기형`: 실제 Worker의 Risk-Off/Crash/EMA·상대모멘텀/Score/수익보호 SELL 조건 재현
- `개선형 ATR+SELL+Trail`: 코인 변동성에 따라 SL/TP 폭을 조정하고 TP1 50% 부분익절 후 남은 수량을 트레일링
- `기존 고정 TP/SL`: 이전 결과와 비교하기 위한 기준선 유지
- Score 75/80/85/90 비교 및 제한된 ATR 프로필 탐색
- 학습구간에서 고른 조건을 미래 35% 구간에 고정하는 워크포워드 검증
- 수수료·슬리피지 스트레스 테스트
- 거래 표본이 적은 코인은 경고 표시

> 개선형 백테스트가 수익을 보장한다는 뜻은 아닙니다. 결과가 양수여도 워크포워드·스트레스 테스트·페이퍼 트레이딩을 통과하기 전에는 실시간 설정에 자동 반영하지 않습니다.

## v8.0.1 장부 변경

- **보유 체크 즉시 유지**: 보유 등록 직후 오래된 Cron 스냅샷 때문에 체크가 다시 풀리던 문제 수정
- **매수가 + 실제 보유수량 저장**: 원화 평가손익 계산 가능
- **보유/매매 장부 추가**: 매입금액, 현재 평가금액, 미실현손익, 누적 실현손익 표시
- **실제 매도 기록**: 매도가와 매도수량 입력 후 부분/전량 매도 기록
- **지난 거래 직접 기록**: 이미 매도한 거래(예: ETH)를 매수가·매도가·수량으로 장부에 추가 가능
- **부분 매도 지원**: 일부만 매도하면 남은 수량은 계속 보유 상태 유지
- **거래 기록 KV 저장**: `trade-history:v1`에 최근 300건 보관

> v8.1 장부 손익은 거래소 수수료를 제외한 단순 매수가/매도가 기준입니다. 수수료 반영은 후속 버전에서 추가할 수 있습니다.

## v8 핵심 변경

- **PC/브라우저와 독립된 24시간 실행**: Cloudflare Cron `*/5 * * * *`
- **Telegram 발송은 Cron 전용**: 웹의 `지금 조회`는 조회만 하고 알림을 보내지 않음
- **Upbit KRW로 완전 통일**: 실시간/표시/백테스트 모두 KRW 기준
- **완료된 5분봉만 사용**: 진행 중인 봉으로 인한 신호 흔들림 감소
- **동일 봉 + 쿨다운 중복 방지**: Cloudflare KV 사용
- **실시간/백테스트 Score 계산식 통일**
- **Upbit 백테스트 프록시**: 브라우저의 Upbit Origin rate-limit 문제를 Worker가 1페이지씩 중계
- **Cron 상태 저장/조회**: 웹에서 마지막 자동 실행 시각과 Telegram 발송 결과 확인
- **보유 상태 서버 저장**: 실제 진입가(KRW)를 KV에 기록하여 SELL 검토 신호 계산
- **JSON 오류 처리 개선**: Worker URL이 잘못되어 HTML이 돌아와도 이해하기 쉬운 오류 표시
- **환경변수 실제 적용**: Score/TP/SL/쿨다운 값을 `wrangler.toml`에서 관리


## 감시 코인

`ETH, SOL, XRP, HBAR, ONDO, LINK, AVAX, DOGE, SUI, TAO, UNI, AAVE`의 Upbit KRW 마켓을 감시합니다.

## 폴더 구조

- `docs/` — GitHub Pages 대시보드 + Upbit KRW 백테스트
- `worker/` — Cloudflare Worker + Cron + Telegram + KV

`wrangler.toml`의 Worker 이름은 기존 URL을 유지하기 쉽도록 `btc-alt-scalper-v7`을 그대로 사용합니다. 화면/엔진 버전은 v8.3.1입니다.
- `DEPLOY.md` — 배포/점검 순서

## Cloudflare Secrets

아래 값은 GitHub에 절대 저장하지 말고 Cloudflare Worker의 Secret으로 설정하세요.

- `SCALPER_PIN`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`
- `CRYPTOPANIC_AUTH_TOKEN` (선택: 코인 뉴스 컨텍스트를 사용할 때만)

## Cloudflare KV

24시간 안정 운용에는 `SCALPER_KV` binding이 **필수**입니다. KV는 다음 용도로 사용합니다.

- BUY/SELL 중복 알림 방지
- 실제 보유 코인/진입가/수량 저장
- 매도 완료 거래 장부 저장
- 마지막 Cron 정상 실행 결과 저장
- 최근 Cron 오류 상태 저장

자세한 설정 순서는 `DEPLOY.md`를 보세요.

## 기본 전략값

`worker/wrangler.toml`에서 관리합니다.

- `MIN_SCORE = 75`
- `TP1_PERCENT = 1.2`
- `TP2_PERCENT = 2.2`
- `STOP_LOSS_PERCENT = 0.8`
- `BUY_COOLDOWN_MINUTES = 20`
- `SELL_COOLDOWN_MINUTES = 60`
- `MAX_BUY_ALERTS = 2`
- `CRON_DELAY_SECONDS = 12`
- `CONTEXT_BLOCK_THRESHOLD = -8`
- `CONTEXT_SELL_THRESHOLD = -12`

값을 바꾼 뒤에는 Worker를 다시 배포해야 실시간 엔진에 반영됩니다. 웹 백테스트의 기본값은 `/health`에서 Worker 설정을 읽어 맞춥니다.

## 정상 확인 기준

Worker URL 뒤에 `/health`를 열었을 때 최소한 다음 항목이 모두 `true`여야 합니다.

```json
{
  "ok": true,
  "kv": true,
  "telegramConfigured": true,
  "pinConfigured": true
}
```

그 다음 웹페이지에서 `Cron 상태`를 눌렀을 때 최근 약 5~10분 내 실행 결과가 보이면, PC를 꺼도 Cloudflare에서 자동 감시가 실제 동작 중인 상태입니다.

## 주의

백테스트는 과거 데이터에 대한 연구 결과일 뿐 미래 수익을 보장하지 않습니다. 거래 수수료·슬리피지·호가 공백·뉴스·급변동 등 실제 체결 환경과 차이가 있을 수 있으므로 페이퍼 트레이딩과 소액 검증을 권장합니다.
