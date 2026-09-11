# BTC ALT SCALPER v8

Upbit KRW 5분봉을 기준으로 BTC 시장 국면 + 상대강도 + 모멘텀 + EMA + 거래량 + 돌파 조건을 계산하고, Cloudflare Worker Cron이 24시간 자동 감시하여 Telegram으로 BUY/SELL **검토 알림**을 보내는 시스템입니다.

> 이 프로젝트는 주문을 자동 실행하지 않습니다. Telegram 알림을 바탕으로 사용자가 직접 판단하는 수동매매 보조 도구입니다.

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

## 폴더 구조

- `docs/` — GitHub Pages 대시보드 + Upbit KRW 백테스트
- `worker/` — Cloudflare Worker + Cron + Telegram + KV

`wrangler.toml`의 Worker 이름은 기존 URL을 유지하기 쉽도록 `btc-alt-scalper-v7`을 그대로 사용합니다. 화면/엔진 버전은 v8.0.0입니다.
- `DEPLOY.md` — 배포/점검 순서

## Cloudflare Secrets

아래 값은 GitHub에 절대 저장하지 말고 Cloudflare Worker의 Secret으로 설정하세요.

- `SCALPER_PIN`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`

## Cloudflare KV

24시간 안정 운용에는 `SCALPER_KV` binding이 **필수**입니다. KV는 다음 용도로 사용합니다.

- BUY/SELL 중복 알림 방지
- 실제 보유 코인/진입가 저장
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
