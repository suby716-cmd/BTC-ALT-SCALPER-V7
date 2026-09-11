# BTC ALT SCALPER v8 배포 체크리스트

이 문서는 기존 v7을 v8으로 교체할 때 필요한 작업만 순서대로 정리한 것입니다.

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
  "version": "v8.0.0",
  "kv": true,
  "telegramConfigured": true,
  "pinConfigured": true
}
```

`kv:false`이면 자동 알림 중복 방지와 보유 관리가 안전하지 않으므로 먼저 KV를 연결하세요.

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

### 웹페이지를 열어도 Telegram 신호가 추가 발송되지 않습니다

`지금 조회(알림X)`는 시장을 새로 계산해 화면에만 표시합니다. Telegram BUY/SELL 자동 발송은 Cron에서만 합니다.

### 화면의 자동 갱신은 시장을 다시 스캔하지 않습니다

페이지는 60초마다 KV에 저장된 마지막 Cron 결과만 읽습니다. 여러 PC/휴대폰을 동시에 열어도 그 자체로 Telegram 중복 발송을 만들지 않습니다.

### 실시간/백테스트 모두 Upbit KRW입니다

`ETH/USDT` 같은 잘못된 표기를 제거했고, `ETH/KRW`, `SOL/KRW`처럼 실제 데이터 단위와 맞췄습니다.

### 보유 등록은 실제 매수가를 사용합니다

보유 체크 시 실제 진입가(KRW)를 입력해야 합니다. SELL 검토 알림의 손익 계산은 이 값을 사용합니다.

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
