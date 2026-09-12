# BTC ALT SCALPER v8.1.1

Upbit KRW 5분봉을 기준으로 BTC 시장 국면 + 상대강도 + 모멘텀 + EMA + 거래량 + 돌파 조건을 계산하고, Cloudflare Worker Cron이 24시간 자동 감시하여 Telegram으로 BUY/SELL **검토 알림**을 보내는 시스템입니다.

> 이 프로젝트는 주문을 자동 실행하지 않습니다. Telegram 알림을 바탕으로 사용자가 직접 판단하는 수동매매 보조 도구입니다.


## v8.1.1 웹 연결 상태 긴급 수정

- v8.1.0 웹 대시보드에서 보유/장부 동기화 함수가 누락되어 초기 로딩 시 `syncPositions is not defined`가 발생하던 문제를 수정했습니다.
- 복구 함수: `applyHeldState`, `syncPositions`, `renderLedger`, `loadLedger`, `registerPosition`.
- Worker/KV/Telegram은 정상 연결되어 있었지만 웹 상단이 `연결 확인 필요`로 표시되고 Cron 상태/장부가 렌더링되지 않던 증상을 해결합니다.
- v8.1 Context/Macro/Prediction/Manual event 및 12개 코인 감시는 그대로 유지합니다.

## v8.1 외부 컨텍스트 연구 레이어

기술적 Score는 그대로 유지하고, 외부 환경을 별도 Context Score로 계산합니다. **외부 호재만으로 BUY를 만들지 않으며 기술적 진입 조건은 반드시 통과해야 합니다.**

- 자동 거시 프록시: FRED의 미 10Y/2Y 금리, VIX, 광의 달러지수, WTI, USD/JPY 변화
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

`wrangler.toml`의 Worker 이름은 기존 URL을 유지하기 쉽도록 `btc-alt-scalper-v7`을 그대로 사용합니다. 화면/엔진 버전은 v8.1.0입니다.
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
