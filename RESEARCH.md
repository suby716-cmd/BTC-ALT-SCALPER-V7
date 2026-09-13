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

FRED를 거치지 않고 공식 공개 원천을 직접 사용해 다음 지표를 저가중치로 계산한다.

- U.S. Treasury Daily Yield Curve: 미국 10년·2년 국채 수익률
- Cboe: VIX, OVX(원유 변동성)
- Federal Reserve Board H.10: Nominal Broad Dollar Index, USD/JPY
- EIA: Cushing WTI Spot Price
- BLS Public Data API v1: CPI, 실업률

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


## v8.1.4 데이터 품질 원칙

거시 데이터 결측을 0점 중립으로 오인하지 않습니다. 9개 Macro metric의 LIVE/CACHE/missing 비율을 기록하고, 부분 데이터는 점수 가중치를 낮추며 실시간 confidence에 penalty를 적용합니다.

공급자는 `Treasury / Federal Reserve Board / Cboe / BLS / EIA`로 분리합니다. 한 공급자 장애가 전체 Macro를 무효화하지 않도록 공급자별 캐시를 독립적으로 유지합니다. CPI·실업률처럼 월간 발표 주기가 긴 자료는 더 긴 캐시 유효기간을 허용하고, 국채·VIX·WTI처럼 일간 자료는 더 짧게 허용합니다.


## v8.2 Pattern Engine 연구 근거

사용자가 제공한 상승 패턴 자료(돌파, 풀백, 더블바텀, 상승삼각형, 박스, 대칭삼각형, 역헤드앤숄더, 컵앤핸들, VCP)를 출발점으로 삼되, 실시간 5분 스캘퍼에서 수치화가 쉽고 확인 조건이 명확한 구조를 우선 채택했습니다.

### 공개적으로 참고한 프레임워크

1. **Mark Minervini / VCP**: 우측 가격 변동폭이 줄고 공급이 감소한 뒤 피벗 돌파를 찾는 공개 VCP 개념. v8.2는 정확한 유료 규칙을 복제하지 않고 `3구간 range contraction + volume dry-up + pivot breakout`만 독립적으로 구현합니다.
2. **Richard Wyckoff**: broad market trend, relative strength, volume confirmation, spring/upthrust, breakout 후 throwback/retest 개념. v8.2는 spring/upthrust와 15분 구조 확인에 반영합니다.
3. **CMT / classical TA**: breakout은 거래량과 종가 확인이 중요하며, neckline/지지·저항 이탈 전에는 패턴을 확정하지 않는 원칙.
4. **Crypto-specific evidence**: 암호화폐는 5분 단위 volume-return 상호관계와 intraday momentum/reversal이 보고되어 있어, 패턴명보다 `거래량 + 종가확인 + 시장국면`을 함께 쓰도록 설계합니다.

### 구현 원칙

- 모양 유사도/AI 이미지 인식은 사용하지 않습니다. OHLCV에서 직접 계산합니다.
- 미래 데이터를 보지 않습니다. 모든 패턴은 현재 완료봉까지의 데이터만 사용합니다.
- 단순 wick 돌파가 아니라 종가 위치와 거래량을 확인합니다.
- 상승 패턴은 기존 Technical hard gate를 보조할 뿐, 단독 BUY를 만들지 않습니다.
- 하락 패턴/failed breakout은 신규진입 차단과 보유 SELL 검토에 더 강하게 사용합니다.
- 15분 구조를 5분 데이터에서 집계해 별도 API 호출 없이 multi-timeframe 확인을 합니다.
- 같은 패턴이 중복 인식될 수 있으므로 Pattern Score는 `-8~+8`로 clamp 합니다.

### 참고 공개 자료

- CMT Association, Volume and Volatility: https://content.cmtassociation.org/a/volume-and-volatility
- StockCharts ChartSchool, Wyckoff Method / Stock Analysis: https://chartschool.stockcharts.com/table-of-contents/market-analysis/wyckoff-analysis-articles
- Binance Academy, Classical Chart Patterns: https://www.binance.com/en/academy/articles/a-beginners-guide-to-classical-chart-patterns
- Mark Minervini public VCP workshop review: https://cdn.minervini.com/static/dist/mtp-review.1f8e8633.pdf
- Finance Research Letters, technical trading rules in Bitcoin: trading-range breakout forecasting evidence (2020)
- Research in International Business and Finance, intraday crypto volume-return nexus (2021)
- International Review of Economics & Finance, candlestick patterns in cryptocurrency markets (2026)

이 출처들은 패턴이 항상 맞는다는 뜻이 아닙니다. 인플루언서/분석가의 적중률을 독립적으로 검증할 수 없으므로, 사람의 명성보다 **재현 가능한 규칙과 백테스트/워크포워드 결과**를 우선합니다.
