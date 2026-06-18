# Strategy Report Requirements

## Purpose

Generate a strategy report for each open position that explains why the trader bought or sold the stock.

The report should be concise, investment-focused, and suitable for internal review. It should explain the trade rationale, not just list transaction details.

The investment rationale must combine fundamental analysis and technical analysis. Do not write a report that is purely fundamental.

Open-position stock reports apply to stock / equity rows with open-position types such as `BUY OPEN`, `BUY TO OPEN`, `BO`, `SHORT SELL`, `SELL TO OPEN`, or `SS`.

## Language

- Default output language: Traditional Chinese.
- Keep stock tickers, company names, broker names, and market terms in English where clearer.
- Do not mention the data vendor name in the final report.

## Required Sections

### 1. Investment Manager & Team

Include the responsible investment manager or team.

Example:

```text
投資經理：Alex Chan
```

### 2. Company Name / Stock Code / Date

Include:

- Company name
- Stock code
- Trade date

Use the trade date from the transaction, not the report generation date.

### 3. Details of Proposal

Include:

- Transaction type
- Expected buy or sell price
- Quantity
- Broker

For price wording, use `預期買入價格` or `預期賣出價格`, not `建議買入價格` or `建議賣出價格`.

Transaction type wording:

- Show only `BUY` or `SELL` in the report.
- Do not show `BUY OPEN`, `SELL OPEN`, `BUY CLOSE`, or `SELL CLOSE` in the report.

Price format:

- Round the transaction price to 1 decimal place.
- Add an allowed range of `±0.5%`.

Example:

```text
預期買入價格：約 USD 181.4，允許價格範圍 ±0.5%
```

### 4. Investment Strategy

This is the main section. It must explain why the trader opened the position.

For BUY / BUY OPEN trades, explain:

- Business exposure and industry theme
- Revenue or earnings growth rationale
- Profitability or margin improvement
- Balance sheet or financial strength, if relevant
- Why the entry price is reasonable for the strategy
- Technical setup based on data available before the actual trade date
- Whether price action, moving averages, RSI, volume, VWAP, support/resistance, or volatility supported the entry

For SELL / SELL CLOSE trades, explain:

- Reason for reducing or closing the position
- Valuation, risk control, profit-taking, thesis change, or portfolio adjustment
- Whether the sell is tactical or reflects a change in investment view
- Technical setup based on data available before the actual trade date
- Whether price action, moving averages, RSI, volume, VWAP, support/resistance, or volatility supported the exit

The section should normally contain 3-5 paragraphs.

## Technical Analysis Rules

Technical analysis must use only market data available before the actual trade date.

Do not use current price, current moving averages, the trade date's market data, or post-trade technical data when explaining the original trade decision.

Use a data cutoff of one calendar day before the trade date. If that cutoff date is not a trading day, use the latest available trading day before the trade date.

For each report, include the most relevant pre-trade data where available:

- Open, high, low, close
- VWAP
- Trading volume
- 20-day average volume
- SMA20, SMA50, SMA100, SMA200
- RSI14
- ATR14
- 20-day high / low
- 52-week high / low as of the pre-trade data date

Use the technical data to explain the trade setup, not as a standalone data dump.

## Risk Section

Include a risk section with 3-5 bullet points.

Common risk categories:

- Valuation risk
- Market volatility risk
- Industry cycle risk
- Execution risk
- Customer concentration risk
- Earnings or margin risk
- Liquidity or financing risk

## Sections To Exclude

Do not include these sections unless explicitly requested:

- Valuation / Position Review
- Conclusion
- Current unrealized P/L
- Current return since entry

## Data Use Rules

- Use available market and company data to support the rationale.
- All fundamental and technical data must be available before the trade date. Do not use data dated on or after the trade date.
- Do not invent catalysts, analyst ratings, price targets, or news that are not available in the provided data.
- Do not mention the data source name in the final report.
- Keep the report focused on explaining the trader's buy or sell decision.
- This report template is only for stock / equity trades. Futures and options will use a separate template.

## Example Output

```markdown
### 1. Investment Manager & Team
**投資經理：** Alex Chan

### 2. Company Name / Stock Code / Date
**公司：** Astera Labs, Inc.  
**股票代號：** ALAB US Equity  
**日期：** 2026 年 1 月 2 日

### 3. Details of Proposal
- **交易類型：** BUY
- **預期買入價格：** 約 USD 181.4，允許價格範圍 ±0.5%
- **數量：** 216 股
- **經紀商：** Interactive Brokers LLC

### 4. Investment Strategy
買入 Astera Labs 的主要原因，是公司處於 AI 基礎設施與雲端運算半導體連接方案的核心位置。公司提供的 Intelligent Connectivity Platform 涵蓋資料、網路及記憶體連接產品，有助支援高效能 AI 系統的大規模部署。

Astera Labs 的產品定位受惠於 AI server、cloud infrastructure 及高速資料傳輸需求增加。隨著大型雲端客戶及 AI 運算平台持續提升頻寬、延遲及系統穩定性要求，公司的連接晶片與相關解決方案具備結構性增長機會。

公司收入增長快速，並已由早期投入階段逐步進入盈利改善階段。隨著收入規模擴大，毛利率及營運利潤率改善，反映公司產品具備較高附加值，亦顯示經營槓桿開始釋放。

預期買入價格約 USD 181.4，交易目的在於捕捉公司在 AI infrastructure supply chain 中的成長機會。該價格反映 trader 對公司中期收入增長、盈利能力改善及市場需求持續擴張的判斷。

### 5. Risk
- **估值風險：** 市場對 AI 相關半導體公司的增長預期較高，若業績不及預期，股價可能出現估值修正。
- **波動風險：** ALAB 屬高增長半導體股票，股價對市場情緒及科技股風險偏好較敏感。
- **行業週期風險：** 半導體及 AI 基礎設施需求可能受雲端資本開支週期影響。
- **執行風險：** 若公司產品導入、客戶擴展或新產品開發進度慢於預期，可能影響增長假設。
```
