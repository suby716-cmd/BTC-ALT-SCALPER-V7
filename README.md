# BTC ALT SCALPER v7

Muse/LLM 없이 숫자 기반으로 BTC 국면 + 상대강도 + 모멘텀 + EMA + 거래량 + 돌파를 결합하는 단타 연구/알림 시스템입니다.

## v7 추가 핵심
- 신호 Confidence(연구용 품질지표)
- Profit Factor / 기대값 / 복리 수익 / MDD / 최대 연속손실
- 코인별 / Score별 / 시간대별 / 시장국면별 / TP·SL 결과별 분석
- 거래 중복 방지형 백테스트
- 자동 Threshold × TP × SL 후보 탐색
- 워크포워드 검증
- 수수료/슬리피지 스트레스 테스트
- 실시간 Telegram 수동매매 알림
- GitHub Pages에는 비밀키를 저장하지 않음

## 구조
- docs/: GitHub Pages
- worker/: Cloudflare Worker + Telegram relay

## Worker Secrets
SCALPER_PIN
TELEGRAM_BOT_TOKEN
TELEGRAM_CHAT_ID

## 주의
백테스트는 과거 데이터 검증일 뿐 미래 수익을 보장하지 않습니다. 실전 전 페이퍼 트레이딩과 소액 검증을 권장합니다.
