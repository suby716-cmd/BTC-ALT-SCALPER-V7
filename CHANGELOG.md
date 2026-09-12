# CHANGELOG

## v8.1.2
- FRED 공식 API(FRED_API_KEY 선택) → CSV → KV 최근 정상 캐시 fallback 추가
- Macro 데이터 품질 `normal / partial / unavailable` 분류
- 데이터 부족 시 Macro 점수 품질 가중 및 실시간 confidence 감점
- Macro `N/A`/부분 데이터/오류 상세/series별 source 표시
- FRED series 최근 정상값 KV cache(최대 96시간 사용) 추가
- FOMC 이벤트 패널티는 공급 장애와 독립적으로 유지

# v8.1.1

- FIX: v8.1.0 웹 대시보드에서 누락된 보유/장부 동기화 함수 5개 복구.
- FIX: 초기 로딩 `syncPositions is not defined`로 상단이 `연결 확인 필요`가 되던 문제 수정.
- FIX: Cron 상태/장부 버튼의 연쇄 ReferenceError 수정.
- KEEP: v8.1 Context/Macro/Prediction/Manual event, 12개 코인, SCALPER_KV 고정 binding 유지.

# Changelog

## v8.1.0

- 12개 코인(ETH/SOL/XRP/HBAR/ONDO/LINK/AVAX/DOGE/SUI/TAO/UNI/AAVE) 유지
- Macro / Prediction / News / Manual Event를 합친 외부 Context Score 추가
- FRED 공개 데이터 기반 미10Y·2Y, VIX, 달러, WTI, USD/JPY 프록시
- FOMC 발표 전후 방향 중립적 이벤트 위험 패널티
- Polymarket market ID 기반 확률 가중치 지원
- CryptoPanic optional Secret 기반 코인 뉴스 휴리스틱 지원
- 수동 호재/악재 이벤트(+10~-10, 만료시간, GLOBAL/코인별) UI 추가
- 외부 호재만으로 BUY가 생성되지 않도록 기술적 hard gate 유지
- 강한 외부 악재는 BUY 차단/SELL REVIEW 근거에 포함
- Context API 실패 시 전체 Cron이 멈추지 않는 fail-open 처리
- Context 결과 KV 캐시와 시간별 history snapshot 저장
- Telegram BUY/SELL 메시지에 Tech/Context/합산 점수 추가
- 백테스트 Score 구간 소수점 누락 버그 수정: 85~89.999 점수 등이 빠지던 문제 해결
- 기존 KV namespace ID를 wrangler.toml에 고정해 자동배포 시 binding 유지

## v8.0.3

- 7/14/30/60/90일 백테스트
- 실전 SELL 동기형, ATR+SELL+Trail 연구 모드
- 워크포워드/스트레스 테스트
