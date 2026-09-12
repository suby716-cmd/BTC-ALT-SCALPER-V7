# v8.1 설계 연구 메모

## 다른 오픈소스 봇에서 가져온 장점

- Freqtrade: 백테스트/하이퍼옵트, stoploss/trailing, protections를 분리해서 검증한다. v8.1은 이 철학을 따라 기술 신호와 외부 Context를 분리하고 외부 호재가 기술 진입을 우회하지 못하게 했다.
- Hummingbot: 실행기/컨트롤러를 모듈화하고 triple-barrier 계열 리스크 구조를 사용한다. v8 계열의 TP/SL/Trail과 외부 리스크를 서로 다른 레이어로 유지한다.
- OctoBot: 과거 시나리오 replay와 optimizer를 제공한다. v8.1도 연구 모드와 실전 설정을 분리해, 연구 결과가 자동으로 실전값을 덮지 않게 한다.

## v8.1 Context Score 원칙

1. Technical Score는 기존 계산식을 유지한다.
2. Context Score는 -20~+20 보조점수다.
3. 양의 Context는 순위를 올릴 수 있지만 기술적 hard gate를 대신하지 않는다.
4. 강한 음의 Context는 신규 BUY 차단과 SELL REVIEW 사유가 될 수 있다.
5. 외부 API 실패는 fail-open: 점수 0으로 처리하고 5분 스캔 자체를 죽이지 않는다.
6. 정치/법안/전쟁 같은 사건을 영구적인 방향 점수로 하드코딩하지 않는다.

## 자동 Macro 프록시

FRED 공개 CSV를 사용해 다음 시계열을 저가중치로 계산한다.

- DGS10: 미국 10년 국채 수익률
- DGS2: 미국 2년 국채 수익률
- VIXCLS: VIX
- DTWEXBGS: 광의 달러지수
- DCOILWTICO: WTI
- DEXJPUS: USD/JPY

일간 지표이므로 5분 기술 신호보다 느리고, 절대적인 매수/매도 근거가 아니라 배경 레짐 필터다.

## 사건/뉴스 레이어

- 수동 이벤트: 범위(GLOBAL 또는 코인), 점수, 이름, 만료시간, 출처 메모
- Polymarket: market ID, 호재 방향(Yes/No 등), 가중치, 범위
- CryptoPanic: 선택적 Secret. 뉴스 제목의 고위험 키워드와 커뮤니티 투표를 낮은 가중치로 반영

해킹/익스플로잇 등 고위험 뉴스는 severeRisk로 표시할 수 있지만, 자동 주문은 하지 않는다.

## 아직 하지 않은 것

- 뉴스/예측시장/거시 Context의 과거 90일 완전 백필: 각 제공자의 역사 데이터/라이선스가 달라 현재는 실시간부터 snapshot을 쌓는다.
- 자동 매매 주문: 계속 미지원.
- 법안 통과나 FOMC 결과를 미리 확정적인 +/−로 해석: 미지원. 확률/시장반응과 함께 판단한다.
