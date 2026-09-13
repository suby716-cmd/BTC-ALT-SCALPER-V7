# CHANGELOG

## v8.2.0 Pattern Confirmation
- 신규 BUY에 패턴 확인 gate 추가: 기존 기술조건을 통과해도 상승 패턴 확정이 없으면 BUY 대신 WATCH/IDLE
- Pattern Score `-8~+8`, 기본 BUY 확인 `>= +2`, 하락 SELL 경고 `<= -4`
- 5분 OHLCV 기반 거래범위 돌파/하향이탈, breakout retest, Wyckoff Spring/Upthrust, VCP-inspired contraction, Bull/Bear Flag, Triangle, Rectangle, Double Top/Bottom 추가
- 5분봉을 15분봉으로 집계해 Market Structure 방향을 보조 확인
- 가짜 돌파/Upthrust와 하락 패턴을 Risk/SELL REVIEW에 반영
- Telegram BUY/SELL 메시지에 Pattern 점수·대표 패턴·15분 구조·패턴 근거 추가
- 대시보드에 Pattern 열 및 패턴 상세 tooltip 추가
- 백테스트에서 `Pattern ON/OFF` 비교 가능
- 기존 Macro/Context/KV/Telegram/장부/12개 코인 기능 유지
- 특정 인플루언서의 독점 신호는 복제하지 않고 공개된 VCP/Wyckoff/CMT/고전 패턴 원리만 정량화

## v8.1.4 안정화판
- Macro 품질 경계값 수정: 9개 중 6개(정확히 2/3) 확보 시 `partial`로 정상 사용
- BLS CPI/실업률은 12시간 최소 갱신 간격을 두어 5분 Cron 반복 호출과 429를 방지
- Cboe OVX CSV 파서를 유연화하여 `DATE,OVX`/`VALUE`/`CLOSE` 등 공개 형식 변경에 대응
- Macro 데이터가 일부만 있을 때 점수는 품질 가중, 신뢰도는 보수적으로 감점하는 기존 원칙 유지
- 7일 관찰 기간 권장: 기능 추가/파라미터 튜닝은 동결하고 장애·오류만 핫픽스

## v8.1.3
- FRED Macro 의존 제거
- U.S. Treasury 공식 XML에서 2Y·10Y 수익률 직접 수집
- Federal Reserve Board H.10에서 Broad Dollar·USD/JPY 직접 수집
- Cboe 공식 CSV에서 VIX·OVX 직접 수집
- BLS Public Data API v1에서 CPI·실업률 수집
- EIA 공개 WTI 현물가격 페이지에서 WTI 수집
- 공급자별 독립 fallback/cache로 단일 공급자 장애 격리
- 9개 Macro metric의 LIVE/CACHE/실패·품질가중·confidence penalty 표시
- Macro API Key 불필요

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
