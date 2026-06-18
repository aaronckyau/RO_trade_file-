#!/usr/bin/env python3
from __future__ import annotations

import json
import math
import os
import re
import ssl
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from statistics import mean


HOST = "127.0.0.1"
PORT = int(os.environ.get("RO_TRANSACTION_API_PORT", "8788"))
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-3.1-flash-lite")
ENV_PATHS = (
    os.environ.get("RO_TRANSACTION_ENV", ""),
    "/etc/ro-transaction.env",
    os.path.join(os.path.dirname(__file__), ".env"),
)


def load_env() -> dict[str, str]:
    values: dict[str, str] = {}
    for path in ENV_PATHS:
        if not path or not os.path.exists(path):
            continue
        with open(path, "r", encoding="utf-8-sig") as handle:
            for line in handle:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, value = line.split("=", 1)
                values[key.strip()] = value.strip().strip('"').strip("'")
    values.update({key: value for key, value in os.environ.items() if key in {"FMP_API_KEY", "GEMINI_API_KEY"}})
    return values


def json_response(handler: BaseHTTPRequestHandler, status: int, payload: dict) -> None:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def http_json(url: str, *, headers: dict[str, str] | None = None, data: dict | None = None, timeout: int = 35):
    body = None
    request_headers = headers or {}
    if data is not None:
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        request_headers = {**request_headers, "Content-Type": "application/json"}
    request = urllib.request.Request(url, data=body, headers=request_headers)
    with urllib.request.urlopen(request, timeout=timeout, context=ssl.create_default_context()) as response:
        return json.loads(response.read().decode("utf-8"))


def fmp_get(path: str, params: dict[str, str], api_key: str):
    query = urllib.parse.urlencode(params)
    url = f"https://financialmodelingprep.com/stable/{path}?{query}"
    return http_json(url, headers={"apikey": api_key})


def parse_symbol(security: str) -> str:
    token = str(security or "").strip().split()
    if not token:
        return ""
    return re.sub(r"[^A-Za-z0-9.\-]", "", token[0]).upper()


def is_stock_security(security: str) -> bool:
    text = f" {str(security or '').strip().lower()} "
    non_stock_markers = (" future", " futures", " option", " call ", " put ", " curncy", " index", " cmdty")
    if any(marker in text for marker in non_stock_markers):
        return False
    return " equity" in text


def is_open_position_type(value: str) -> bool:
    normalized = re.sub(r"\s+", " ", str(value or "").strip().lower())
    return normalized in {"bo", "buy open", "buy to open", "ss", "short sell", "sell open", "sell to open"}


def parse_trade_date(value: str) -> datetime:
    text = str(value or "").strip()
    for fmt in ("%Y-%m-%d", "%Y/%m/%d", "%d/%m/%Y", "%d-%m-%Y"):
        try:
            return datetime.strptime(text, fmt)
        except ValueError:
            pass
    raise ValueError("Invalid trade date.")


def as_float(value, default: float = 0.0) -> float:
    if value is None:
        return default
    try:
        return float(str(value).replace(",", "").replace("(", "-").replace(")", ""))
    except ValueError:
        return default


def round1(value: float) -> str:
    return f"{value:.1f}"


def round2(value: float | None) -> float | None:
    if value is None or not math.isfinite(value):
        return None
    return round(value, 2)


def latest_before(rows: list[dict], cutoff_date: str) -> dict | None:
    filtered = []
    for row in rows:
        marker = str(row.get("filingDate") or row.get("date") or "")
        if marker and marker <= cutoff_date:
            filtered.append((marker, row))
    filtered.sort(key=lambda item: item[0], reverse=True)
    return filtered[0][1] if filtered else None


def same_quarter_prior_year(rows: list[dict], latest: dict) -> dict | None:
    try:
        target_year = str(int(str(latest.get("date", ""))[:4]) - 1)
    except ValueError:
        return None
    period = latest.get("period")
    for row in rows:
        if str(row.get("date", "")).startswith(target_year) and row.get("period") == period:
            return row
    return None


def avg(rows: list[dict], field: str) -> float | None:
    values = [as_float(row.get(field), math.nan) for row in rows]
    values = [value for value in values if math.isfinite(value)]
    return mean(values) if values else None


def compute_technicals(history: list[dict], cutoff_date: str, trade_price: float) -> dict:
    rows = sorted(history, key=lambda item: item.get("date", ""))
    idx = -1
    for index, row in enumerate(rows):
        if str(row.get("date", "")) <= cutoff_date:
            idx = index
    if idx < 0:
        raise ValueError("No historical price data found before trade date.")
    up_to = rows[: idx + 1]
    as_of = rows[idx]

    def lastn(count: int) -> list[dict]:
        return up_to[-count:]

    close = as_float(as_of.get("close"))
    vwap = as_float(as_of.get("vwap"))
    sma20 = avg(lastn(20), "close")
    sma50 = avg(lastn(50), "close")
    sma100 = avg(lastn(100), "close")
    sma200 = avg(lastn(200), "close")
    vol20 = avg(lastn(20), "volume")
    high20 = max(as_float(row.get("high")) for row in lastn(20))
    low20 = min(as_float(row.get("low")) for row in lastn(20))
    year_rows = lastn(252)
    week52_high = max(as_float(row.get("high")) for row in year_rows)
    week52_low = min(as_float(row.get("low")) for row in year_rows)

    changes = []
    for index in range(max(1, idx - 13), idx + 1):
        changes.append(as_float(rows[index].get("close")) - as_float(rows[index - 1].get("close")))
    gains = [max(change, 0) for change in changes]
    losses = [max(-change, 0) for change in changes]
    avg_gain = mean(gains) if gains else 0
    avg_loss = mean(losses) if losses else 0
    rsi14 = 100 if avg_loss == 0 else 100 - (100 / (1 + (avg_gain / avg_loss)))

    true_ranges = []
    for index in range(max(1, idx - 13), idx + 1):
        high = as_float(rows[index].get("high"))
        low = as_float(rows[index].get("low"))
        prior_close = as_float(rows[index - 1].get("close"))
        true_ranges.append(max(high - low, abs(high - prior_close), abs(low - prior_close)))
    atr14 = mean(true_ranges) if true_ranges else None

    def pct_vs(base: float | None) -> float | None:
        if not base:
            return None
        return round2((close / base - 1) * 100)

    return {
        "date": as_of.get("date"),
        "open": as_float(as_of.get("open")),
        "high": as_float(as_of.get("high")),
        "low": as_float(as_of.get("low")),
        "close": close,
        "vwap": vwap,
        "volume": int(as_float(as_of.get("volume"))),
        "dailyChangePct": as_float(as_of.get("changePercent")),
        "sma20": round2(sma20),
        "sma50": round2(sma50),
        "sma100": round2(sma100),
        "sma200": round2(sma200),
        "closeVsSma20Pct": pct_vs(sma20),
        "closeVsSma50Pct": pct_vs(sma50),
        "closeVsSma200Pct": pct_vs(sma200),
        "rsi14": round2(rsi14),
        "atr14": round2(atr14),
        "atr14PctOfClose": round2((atr14 / close) * 100) if atr14 and close else None,
        "volume20DayAvg": int(round(vol20)) if vol20 else None,
        "volumeVs20DayAvgPct": round2((as_float(as_of.get("volume")) / vol20 - 1) * 100) if vol20 else None,
        "high20": round2(high20),
        "low20": round2(low20),
        "closeVs20DayHighPct": round2((close / high20 - 1) * 100) if high20 else None,
        "week52High": round2(week52_high),
        "week52Low": round2(week52_low),
        "closeVs52WeekHighPct": round2((close / week52_high - 1) * 100) if week52_high else None,
        "closeVs52WeekLowPct": round2((close / week52_low - 1) * 100) if week52_low else None,
        "expectedPriceVsClosePct": round2((trade_price / close - 1) * 100) if close else None,
        "expectedPriceVsVwapPct": round2((trade_price / vwap - 1) * 100) if vwap else None,
        "expectedPriceWithinReferenceDayRange": as_float(as_of.get("low")) <= trade_price <= as_float(as_of.get("high")),
    }


def build_facts(transaction: dict, fmp_api_key: str) -> dict:
    symbol = parse_symbol(transaction.get("security", ""))
    if not symbol:
        raise ValueError("Missing stock symbol.")
    trade_dt = parse_trade_date(transaction.get("tradeDate", ""))
    trade_date = trade_dt.strftime("%Y-%m-%d")
    data_cutoff_date = (trade_dt - timedelta(days=1)).strftime("%Y-%m-%d")
    trade_price = as_float(transaction.get("price"))
    profile_rows = fmp_get("profile", {"symbol": symbol}, fmp_api_key)
    profile = profile_rows[0] if profile_rows else {}
    income_rows = fmp_get("income-statement", {"symbol": symbol, "period": "quarter", "limit": "12"}, fmp_api_key)
    latest = latest_before(income_rows, data_cutoff_date) or {}
    prior = same_quarter_prior_year(income_rows, latest) if latest else None
    from_date = (trade_dt - timedelta(days=460)).strftime("%Y-%m-%d")
    history = fmp_get("historical-price-eod/full", {"symbol": symbol, "from": from_date, "to": data_cutoff_date}, fmp_api_key)
    technicals = compute_technicals(history, data_cutoff_date, trade_price)

    revenue = as_float(latest.get("revenue"))
    gross_profit = as_float(latest.get("grossProfit"))
    operating_income = as_float(latest.get("operatingIncome"))
    net_income = as_float(latest.get("netIncome"))
    prior_revenue = as_float(prior.get("revenue")) if prior else 0
    prior_gross_profit = as_float(prior.get("grossProfit")) if prior else 0
    prior_net_income = as_float(prior.get("netIncome")) if prior else 0

    transaction_type = str(transaction.get("type", "")).strip()
    is_buy = "buy" in transaction_type.lower()
    price_label = "預期買入價格" if is_buy else "預期賣出價格"

    return {
        "trade": {
            "investmentManager": "Alex Chan",
            "company": transaction.get("description") or profile.get("companyName") or symbol,
            "stockCode": transaction.get("security") or symbol,
            "tradeDate": trade_date,
            "dataCutoffDate": data_cutoff_date,
            "type": transaction_type,
            "expectedPriceText": f"{price_label}： 約 {transaction.get('ccy') or 'USD'} {round1(trade_price)}，允許價格範圍 ±0.5%",
            "quantity": transaction.get("qty"),
            "broker": transaction.get("counterpart"),
        },
        "business": {
            "sector": profile.get("sector"),
            "industry": profile.get("industry"),
            "description": profile.get("description"),
        },
        "fundamentalDataAvailableBeforeTradeDate": {
            "latestQuarter": f"{latest.get('fiscalYear', '')} {latest.get('period', '')}".strip(),
            "filingDate": latest.get("filingDate"),
            "revenue": revenue,
            "grossProfit": gross_profit,
            "operatingIncome": operating_income,
            "netIncome": net_income,
            "eps": latest.get("eps"),
            "revenueYoYPct": round2((revenue / prior_revenue - 1) * 100) if prior_revenue else None,
            "grossProfitYoYPct": round2((gross_profit / prior_gross_profit - 1) * 100) if prior_gross_profit else None,
            "latestGrossMarginPct": round2(gross_profit / revenue * 100) if revenue else None,
            "latestOperatingMarginPct": round2(operating_income / revenue * 100) if revenue else None,
            "latestNetMarginPct": round2(net_income / revenue * 100) if revenue else None,
            "priorYearSameQuarterNetIncome": prior_net_income if prior else None,
        },
        "technicalDataAvailableBeforeTradeDate": technicals,
    }


def generate_report(facts: dict, gemini_api_key: str) -> dict:
    schema = {
        "type": "object",
        "properties": {
            "investmentManagerAndTeam": {"type": "string"},
            "companyStockCodeDate": {"type": "string"},
            "detailsOfProposal": {"type": "array", "items": {"type": "string"}},
            "investmentStrategyParagraphs": {"type": "array", "items": {"type": "string"}},
            "risks": {"type": "array", "items": {"type": "string"}},
        },
        "required": [
            "investmentManagerAndTeam",
            "companyStockCodeDate",
            "detailsOfProposal",
            "investmentStrategyParagraphs",
            "risks",
        ],
    }
    prompt = f"""
你是內部投資交易策略報告撰寫助手。請只使用 JSON 事實，不要加入未提供的新聞、price target、broker rating 或資料來源名稱。

請用繁體中文生成策略報告內容，主題是 trader 為何建立 open position。必須基本面 + 技術面，不可全部是 fundamental。

硬性要求：
- 不要提任何資料供應商名稱。
- 不要加入 Valuation / Position Review。
- 不要加入 Conclusion。
- 不要寫投資建議報告標題。
- 投資經理固定寫「投資經理： Alex Chan」。
- 日期使用交易日。
- Details of Proposal 不要寫 Deal No。
- 交易類型只能寫 BUY 或 SELL。
- Details of Proposal 的價格必須使用 trade.expectedPriceText，不要用「建議」。
- Investment Strategy 需要 4-5 段：前面基本面，後面技術面。
- 基本面和技術面只能使用 trade.dataCutoffDate 或以前可取得的資料，不可使用交易日當日或之後的資料。
- 技術面段落必須明確寫「截至交易日前可取得資料」及 technicalDataAvailableBeforeTradeDate.date，並使用 OHLC、VWAP、SMA20/50/100/200、RSI14、成交量 vs 20日均量、ATR14 的實際數字。
- 請用 expected price 與交易日前可取得的 close / VWAP / moving averages 比較，不要聲稱使用了交易日當日價格。

Data JSON:
{json.dumps(facts, ensure_ascii=False, indent=2)}
"""
    body = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0.1,
            "maxOutputTokens": 2400,
            "responseMimeType": "application/json",
            "responseSchema": schema,
        },
    }
    response = http_json(
        f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent",
        headers={"x-goog-api-key": gemini_api_key},
        data=body,
        timeout=70,
    )
    text = "\n".join(part.get("text", "") for part in response["candidates"][0]["content"]["parts"])
    report = json.loads(text)
    report["investmentManagerAndTeam"] = "投資經理： Alex Chan"
    report["companyStockCodeDate"] = format_company_section(facts["trade"])
    report["detailsOfProposal"] = format_details_section(facts["trade"])
    return report


def format_company_section(trade: dict) -> str:
    date_text = format_chinese_date(trade.get("tradeDate", ""))
    return f"公司： {trade.get('company', '')}\n股票代號： {trade.get('stockCode', '')}\n日期： {date_text}"


def format_chinese_date(value: str) -> str:
    try:
        date = datetime.strptime(str(value), "%Y-%m-%d")
        return f"{date.year} 年 {date.month} 月 {date.day} 日"
    except ValueError:
        return str(value)


def format_details_section(trade: dict) -> list[str]:
    trade_type = format_trade_type_for_report(trade.get("type", ""))
    return [
        f"交易類型： {trade_type}",
        trade.get("expectedPriceText", ""),
        f"數量： {trade.get('quantity', '')} 股",
        f"經紀商： {trade.get('broker', '')}",
    ]


def format_trade_type_for_report(value: str) -> str:
    normalized = str(value or "").strip().lower()
    if normalized == "bo" or "buy" in normalized:
        return "BUY"
    if normalized in {"ss", "sh"} or "sell" in normalized:
        return "SELL"
    return str(value or "").upper()


def pdf_bytes(report: dict, facts: dict) -> bytes:
    try:
        from reportlab.lib import colors
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
        from reportlab.pdfbase.cidfonts import UnicodeCIDFont
        from reportlab.pdfbase import pdfmetrics
        from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer
    except Exception as exc:  # pragma: no cover - deployment dependency guard
        raise RuntimeError("PDF library is not installed on the server.") from exc

    from io import BytesIO

    pdfmetrics.registerFont(UnicodeCIDFont("STSong-Light"))
    output = BytesIO()
    doc = SimpleDocTemplate(output, pagesize=A4, rightMargin=42, leftMargin=42, topMargin=42, bottomMargin=42)
    styles = getSampleStyleSheet()
    base = ParagraphStyle("BaseTC", parent=styles["BodyText"], fontName="STSong-Light", fontSize=10.5, leading=15)
    section = ParagraphStyle("SectionTC", parent=base, fontSize=12, leading=16, textColor=colors.HexColor("#111827"), spaceBefore=10, spaceAfter=5)

    story = []

    def add_section(title: str) -> None:
        story.append(Paragraph(title, section))

    def add_para(text: str) -> None:
        story.append(Paragraph(str(text).replace("\n", "<br/>"), base))
        story.append(Spacer(1, 5))

    add_section("1. Investment Manager & Team")
    add_para(report["investmentManagerAndTeam"])
    add_section("2. Company Name / Stock Code / Date")
    add_para(report["companyStockCodeDate"])
    add_section("3. Details of Proposal")
    for item in report["detailsOfProposal"]:
        add_para(item)
    add_section("4. Investment Strategy")
    for paragraph in report["investmentStrategyParagraphs"]:
        add_para(paragraph)
    add_section("5. Risk")
    for item in report["risks"]:
        add_para(item)
    doc.build(story)
    return output.getvalue()


class Handler(BaseHTTPRequestHandler):
    server_version = "ROTransactionAPI/1.0"

    def do_GET(self):
        if self.path.rstrip("/") == "/RO_transaction/api/health":
            json_response(self, 200, {"ok": True})
            return
        json_response(self, 404, {"error": "Not found"})

    def do_POST(self):
        if self.path.rstrip("/") != "/RO_transaction/api/strategy-report":
            json_response(self, 404, {"error": "Not found"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            transaction = payload.get("transaction") or {}
            if not is_open_position_type(transaction.get("type", "")):
                raise ValueError("Strategy report is only available for open positions.")
            if not is_stock_security(transaction.get("security", "")):
                raise ValueError("Strategy report is only available for stock trades.")
            env = load_env()
            if not env.get("FMP_API_KEY") or not env.get("GEMINI_API_KEY"):
                raise RuntimeError("Server API keys are not configured.")
            facts = build_facts(transaction, env["FMP_API_KEY"])
            report = generate_report(facts, env["GEMINI_API_KEY"])
            pdf = pdf_bytes(report, facts)
            filename = safe_filename(f"{facts['trade']['stockCode']}_{facts['trade']['tradeDate']}_strategy_report.pdf")
            self.send_response(200)
            self.send_header("Content-Type", "application/pdf")
            self.send_header("Content-Disposition", f'attachment; filename="{filename}"')
            self.send_header("Content-Length", str(len(pdf)))
            self.end_headers()
            self.wfile.write(pdf)
        except (ValueError, RuntimeError) as exc:
            json_response(self, 400, {"error": str(exc)})
        except urllib.error.HTTPError as exc:
            json_response(self, 502, {"error": f"External API error: HTTP {exc.code}"})
        except Exception as exc:
            print(f"Unhandled error: {exc}", file=sys.stderr)
            json_response(self, 500, {"error": "Failed to generate strategy report."})

    def log_message(self, format: str, *args) -> None:
        print(f"{self.address_string()} - {format % args}", file=sys.stderr)


def safe_filename(value: str) -> str:
    cleaned = re.sub(r'[\\/:*?"<>|\s]+', "_", value.strip())
    return cleaned.strip("_") or "strategy_report.pdf"


if __name__ == "__main__":
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"RO transaction API listening on http://{HOST}:{PORT}", flush=True)
    server.serve_forever()
