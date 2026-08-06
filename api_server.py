#!/usr/bin/env python3
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed
import json
import math
import os
import re
import ssl
import sys
import threading
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from statistics import mean

from futures_registry import REGISTRY_VERSION, public_registry, resolve_futures_product


HOST = "127.0.0.1"
PORT = int(os.environ.get("RO_TRANSACTION_API_PORT", "8788"))
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-3.1-flash-lite")
ENV_PATHS = (
    os.environ.get("RO_TRANSACTION_ENV", ""),
    "/etc/ro-transaction.env",
    os.path.join(os.path.dirname(__file__), ".env"),
)
PRETRADE_CONTEXT_WORKERS = 6
_PRETRADE_CONTEXT_CACHE: dict[tuple[str, str], dict] = {}
_PRETRADE_CONTEXT_CACHE_LOCK = threading.Lock()


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


def security_kind(security: str) -> str | None:
    text = f" {str(security or '').strip().lower()} "
    if " curncy" in text or " index" in text or " cmdty" in text:
        return None
    if " future" in text or " futures" in text:
        return "future"
    if " option" in text or " call " in text or " put " in text:
        return "option"
    if " equity" in text:
        return "stock"
    return None


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


def same_quarter_prior_year(rows: list[dict], latest: dict, cutoff_date: str = "") -> dict | None:
    try:
        target_year = str(int(str(latest.get("date", ""))[:4]) - 1)
    except ValueError:
        return None
    period = latest.get("period")
    for row in rows:
        marker = str(row.get("filingDate") or row.get("date") or "")
        if cutoff_date and (not marker or marker > cutoff_date):
            continue
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


def build_facts(transaction: dict, fmp_api_key: str, kind: str = "stock", underlying_symbol: str = "") -> dict:
    if kind != "stock":
        return build_derivative_facts(transaction, fmp_api_key, kind, underlying_symbol)
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
    prior = same_quarter_prior_year(income_rows, latest, data_cutoff_date) if latest else None
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
        "kind": "stock",
        "technicalDataAvailableBeforeTradeDate": technicals,
    }


def optional_float(value) -> float | None:
    if value is None or str(value).strip() == "":
        return None
    number = as_float(value, math.nan)
    return number if math.isfinite(number) else None


def is_evidence_date_allowed(value: str, cutoff_date: str) -> bool:
    try:
        evidence_date = datetime.strptime(str(value), "%Y-%m-%d")
        cutoff = datetime.strptime(str(cutoff_date), "%Y-%m-%d")
    except ValueError:
        return False
    return evidence_date <= cutoff


def evidence_date(evidence: dict) -> str:
    return str(evidence.get("filingDate") or evidence.get("asOfDate") or "")


def filter_locked_evidence(evidence_rows: list[dict], cutoff_date: str) -> list[dict]:
    locked = []
    seen_ids = set()
    for row in evidence_rows:
        evidence_id = str(row.get("id", "")).strip()
        statement = str(row.get("statement", "")).strip()
        marker = evidence_date(row)
        if not evidence_id or evidence_id in seen_ids or not statement:
            continue
        if not is_evidence_date_allowed(marker, cutoff_date):
            continue
        seen_ids.add(evidence_id)
        locked.append({**row, "id": evidence_id, "statement": statement})
    return locked


def build_pretrade_evidence(fundamental: dict, technical: dict, cutoff_date: str) -> list[dict]:
    evidence = []
    filing_date = str(fundamental.get("filingDate") or "")
    if is_evidence_date_allowed(filing_date, cutoff_date):
        revenue_yoy = optional_float(fundamental.get("revenueYoYPct"))
        if revenue_yoy is not None:
            direction = "increased" if revenue_yoy >= 0 else "decreased"
            evidence.append({
                "id": "fundamental_revenue_yoy",
                "kind": "fundamental",
                "stance": "positive" if revenue_yoy > 0 else "negative" if revenue_yoy < 0 else "neutral",
                "filingDate": filing_date,
                "statement": (
                    f"The latest quarterly results filed on {filing_date} showed revenue "
                    f"{direction} {abs(revenue_yoy):.1f}% year over year."
                ),
            })

        net_income = optional_float(fundamental.get("netIncome"))
        prior_net_income = optional_float(fundamental.get("priorYearSameQuarterNetIncome"))
        if net_income is not None and prior_net_income is not None:
            if prior_net_income > 0 and net_income >= 0:
                change_pct = (net_income / prior_net_income - 1) * 100
                direction = "increased" if change_pct >= 0 else "decreased"
                evidence.append({
                    "id": "fundamental_net_income_yoy",
                    "kind": "fundamental",
                    "stance": "positive" if change_pct > 0 else "negative" if change_pct < 0 else "neutral",
                    "filingDate": filing_date,
                    "statement": (
                        f"The latest quarterly results filed on {filing_date} showed net income "
                        f"{direction} {abs(change_pct):.1f}% year over year."
                    ),
                })
            elif prior_net_income < 0 < net_income:
                evidence.append({
                    "id": "fundamental_returned_to_profit",
                    "kind": "fundamental",
                    "stance": "positive",
                    "filingDate": filing_date,
                    "statement": f"The latest quarterly results filed on {filing_date} showed the company returned to net profit from a prior-year loss.",
                })
            elif prior_net_income > 0 > net_income:
                evidence.append({
                    "id": "fundamental_moved_to_loss",
                    "kind": "fundamental",
                    "stance": "negative",
                    "filingDate": filing_date,
                    "statement": f"The latest quarterly results filed on {filing_date} showed the company moved from a prior-year net profit to a net loss.",
                })

    as_of_date = str(technical.get("date") or "")
    if is_evidence_date_allowed(as_of_date, cutoff_date):
        vs_sma20 = optional_float(technical.get("closeVsSma20Pct"))
        vs_sma50 = optional_float(technical.get("closeVsSma50Pct"))
        comparisons = []
        if vs_sma20 is not None:
            comparisons.append(f"{abs(vs_sma20):.1f}% {'above' if vs_sma20 >= 0 else 'below'} its 20-day moving average")
        if vs_sma50 is not None:
            comparisons.append(f"{abs(vs_sma50):.1f}% {'above' if vs_sma50 >= 0 else 'below'} its 50-day moving average")
        if comparisons:
            if vs_sma20 is not None and vs_sma50 is not None and vs_sma20 > 0 and vs_sma50 > 0:
                stance = "positive"
            elif vs_sma20 is not None and vs_sma50 is not None and vs_sma20 < 0 and vs_sma50 < 0:
                stance = "negative"
            else:
                stance = "neutral"
            evidence.append({
                "id": "technical_moving_averages",
                "kind": "technical",
                "stance": stance,
                "asOfDate": as_of_date,
                "statement": f"As of {as_of_date}, the closing price was {' and '.join(comparisons)}.",
            })

    return filter_locked_evidence(evidence, cutoff_date)


def build_pretrade_stock_context(item: dict, fmp_api_key: str) -> dict:
    symbol = parse_symbol(item.get("security", ""))
    if not symbol:
        return {}
    trade_dt = parse_trade_date(item.get("tradeDate", ""))
    data_cutoff_date = (trade_dt - timedelta(days=1)).strftime("%Y-%m-%d")
    cache_key = (symbol, data_cutoff_date)
    with _PRETRADE_CONTEXT_CACHE_LOCK:
        cached = _PRETRADE_CONTEXT_CACHE.get(cache_key)
    if cached is not None:
        return cached

    facts = build_facts(
        {
            "security": item.get("security"),
            "description": item.get("description"),
            "tradeDate": item.get("tradeDate"),
            "price": item.get("price"),
            "ccy": item.get("ccy"),
            "type": item.get("type"),
            "qty": item.get("qty"),
            "counterpart": item.get("counterpart"),
        },
        fmp_api_key,
    )
    fundamental = facts.get("fundamentalDataAvailableBeforeTradeDate") or {}
    technical = facts.get("technicalDataAvailableBeforeTradeDate") or {}
    business = facts.get("business") or {}

    context = {
        "company": facts.get("trade", {}).get("company") or item.get("description") or symbol,
        "symbol": symbol,
        "sector": business.get("sector"),
        "industry": business.get("industry"),
        "businessDescription": business.get("description"),
        "dataCutoffDate": data_cutoff_date,
        "evidence": build_pretrade_evidence(fundamental, technical, data_cutoff_date),
    }
    with _PRETRADE_CONTEXT_CACHE_LOCK:
        _PRETRADE_CONTEXT_CACHE[cache_key] = context
    return context


def enrich_pretrade_reason_items(items: list[dict], fmp_api_key: str) -> list[dict]:
    enriched = []
    for item in items:
        clean_item = dict(item)
        clean_item.pop("stockContext", None)
        enriched.append(clean_item)
    if not fmp_api_key:
        return enriched

    grouped: dict[tuple[str, str], list[int]] = {}
    for position, item in enumerate(enriched):
        if str(item.get("kind", "")).lower() != "stock" or not is_open_position_type(item.get("type", "")):
            continue
        key = (parse_symbol(item.get("security", "")), str(item.get("tradeDate", "")))
        if key[0] and key[1]:
            grouped.setdefault(key, []).append(position)

    if not grouped:
        return enriched

    workers = min(PRETRADE_CONTEXT_WORKERS, len(grouped))
    with ThreadPoolExecutor(max_workers=workers) as executor:
        futures = {
            executor.submit(build_pretrade_stock_context, enriched[positions[0]], fmp_api_key): positions
            for positions in grouped.values()
        }
        for future in as_completed(futures):
            positions = futures[future]
            try:
                context = future.result()
            except Exception as exc:
                security = enriched[positions[0]].get("security", "unknown security")
                print(f"Pre-trade stock context unavailable for {security}: {exc}", file=sys.stderr)
                continue
            if context:
                for position in positions:
                    enriched[position]["stockContext"] = context
    return enriched


def locked_evidence_for_item(item: dict) -> list[dict]:
    if str(item.get("kind", "")).lower() != "stock" or not is_open_position_type(item.get("type", "")):
        return []
    try:
        trade_dt = parse_trade_date(item.get("tradeDate", ""))
    except ValueError:
        return []
    cutoff_date = (trade_dt - timedelta(days=1)).strftime("%Y-%m-%d")
    context = item.get("stockContext") or {}
    if str(context.get("dataCutoffDate", "")) != cutoff_date:
        return []
    return filter_locked_evidence(context.get("evidence") or [], cutoff_date)


def select_locked_evidence(item: dict, requested_evidence_id: str = "") -> dict | None:
    evidence_rows = locked_evidence_for_item(item)
    requested = str(requested_evidence_id or "").strip()
    is_buy = "buy" in str(item.get("type", "")).lower()
    preferred_stance = "positive" if is_buy else "negative"
    for evidence in evidence_rows:
        if evidence.get("id") == requested and evidence.get("stance") == preferred_stance:
            return evidence

    for evidence in evidence_rows:
        if evidence.get("stance") == preferred_stance:
            return evidence
    return None


def general_stock_thesis(context: dict, is_buy: bool) -> tuple[str, str]:
    business_text = " ".join(
        str(context.get(key) or "")
        for key in ("company", "sector", "industry", "businessDescription")
    ).lower()

    themes = [
        (
            ("mp materials", "rare earth", "critical mineral", "magnet manufacturing", "magnetics"),
            "the rare-earth and critical-materials supply chain",
            "I believe long-term demand from advanced manufacturing, electrification, and defence applications can support the company's business outlook and provide additional diversification to the fund.",
            "I believe commodity-price volatility, operational execution requirements, and policy dependence can create downside risk for the company's business outlook.",
            "I will monitor commodity-price volatility, operational execution, and policy-related risks.",
        ),
        (
            ("basic materials", "materials", "mining", "metals", "chemical", "steel"),
            "the materials sector",
            "I believe long-term demand from industrial production, infrastructure, and supply-chain investment can support the company's business outlook and diversify the fund's sector exposure.",
            "I believe commodity-price movements, cyclical demand, and operating-cost pressure can create downside risk for the stock.",
            "I will monitor commodity prices, production execution, and regulatory risk.",
        ),
        (
            ("semiconductor", "software", "technology", "computer", "electronic"),
            "technology and digital infrastructure",
            "I believe continued demand for computing, digitalisation, and enterprise technology can support the company's medium-to-long-term business outlook and diversify the fund's sector exposure.",
            "I believe competitive pressure, product-cycle risk, and demanding growth expectations can create downside risk for the stock.",
            "I will monitor product execution, competitive conditions, and valuation risk.",
        ),
        (
            ("healthcare", "biotechnology", "pharmaceutical", "medical"),
            "healthcare innovation",
            "I believe demand for new treatments and healthcare solutions can support the company's medium-to-long-term opportunity and broaden the fund's healthcare exposure.",
            "I believe clinical, regulatory, and commercialisation risks can create downside risk for the company's outlook.",
            "I will monitor regulatory progress, product execution, and funding risk.",
        ),
        (
            ("energy", "oil", "gas", "uranium", "solar", "renewable"),
            "the energy sector",
            "I believe changing energy demand and continued investment in supply capacity can support the company's medium-to-long-term opportunity and diversify the fund's industry exposure.",
            "I believe commodity-price movements, project execution, and changes in energy demand can create downside risk for the stock.",
            "I will monitor commodity prices, operating execution, and policy risk.",
        ),
        (
            ("financial", "bank", "insurance", "asset management"),
            "the financial sector",
            "I believe the company's financial-services franchise can participate in long-term economic and capital-market activity while broadening the fund's sector exposure.",
            "I believe credit conditions, interest-rate changes, and market volatility can create downside risk for the company's outlook.",
            "I will monitor asset quality, funding conditions, and regulatory risk.",
        ),
        (
            ("consumer", "retail", "automotive", "restaurant", "apparel"),
            "the consumer sector",
            "I believe the company's consumer franchise can benefit from medium-to-long-term demand in its market and provide additional diversification to the fund.",
            "I believe changing consumer demand, competitive pressure, and margin risk can create downside risk for the stock.",
            "I will monitor demand trends, operating margins, and competitive conditions.",
        ),
        (
            ("industrial", "aerospace", "defense", "transportation", "construction"),
            "industrial activity and infrastructure investment",
            "I believe long-term investment in infrastructure, manufacturing, and supply-chain capacity can support the company's business outlook and diversify the fund's sector exposure.",
            "I believe cyclical demand, cost pressure, and execution risk can create downside risk for the company's outlook.",
            "I will monitor order demand, cost control, and operational execution.",
        ),
        (
            ("communication", "media", "telecom", "internet"),
            "communications and digital services",
            "I believe continued demand for connectivity, digital content, and online services can support the company's business outlook and broaden the fund's exposure.",
            "I believe competition, customer-acquisition costs, and changing user demand can create downside risk for the stock.",
            "I will monitor user trends, competitive conditions, and regulatory risk.",
        ),
        (
            ("real estate", "reit", "property"),
            "the real-estate sector",
            "I believe the company's property exposure can contribute income and diversification across the fund's portfolio over the medium to long term.",
            "I believe financing costs, occupancy trends, and asset-value changes can create downside risk for the stock.",
            "I will monitor interest rates, occupancy, and refinancing risk.",
        ),
    ]

    for keywords, exposure, buy_view, sell_view, risk in themes:
        if any(keyword in business_text for keyword in keywords):
            return exposure, f"{buy_view if is_buy else sell_view} {risk}"

    exposure = "the company's industry and long-term development"
    if is_buy:
        view = "I believe the company's business profile offers medium-to-long-term participation in its industry and can provide additional diversification to the fund."
    else:
        view = "I believe industry pressure and company execution risks can create downside risk for the stock."
    return exposure, f"{view} I will monitor operating execution, industry conditions, and market risk."


def build_evidence_locked_stock_reason(item: dict, requested_evidence_id: str = "") -> tuple[str, dict | None]:
    if str(item.get("kind", "")).lower() != "stock" or not is_open_position_type(item.get("type", "")):
        return "", None

    context = item.get("stockContext") or {}
    security = str(item.get("security") or "the security").strip()
    company = str(context.get("company") or item.get("description") or security).strip()
    position_name = company if company.lower() == security.lower() else f"{company} ({security})"
    is_buy = "buy" in str(item.get("type", "")).lower()
    action = "BUY" if is_buy else "SELL"
    purpose = (
        "to add or increase the fund's exposure to the company"
        if is_buy
        else "to establish or increase the fund's short exposure to the company"
    )
    evidence = select_locked_evidence(item, requested_evidence_id)
    if evidence:
        evidence_sentence = evidence["statement"]
        reason = (
            f"I plan to {action} {position_name} {purpose}. "
            f"{evidence_sentence}"
        )
        return reason, evidence

    thesis_context = {**context, "company": company, "symbol": parse_symbol(security)}
    exposure, general_view = general_stock_thesis(thesis_context, is_buy)
    general_purpose = (
        f"to gain exposure to {exposure}"
        if is_buy
        else f"to establish or increase short exposure to {exposure}"
    )
    reason = f"I plan to {action} {position_name} {general_purpose}. {general_view}"
    return reason, None


def build_directional_futures_reason(item: dict, futures_overrides: object = None) -> str:
    if str(item.get("kind", "")).lower() != "future" or not is_open_position_type(item.get("type", "")):
        return ""

    security = str(item.get("security") or "the futures contract").strip()
    product = resolve_futures_product(security, futures_overrides)
    if product["mappingStatus"] != "mapped":
        return ""

    is_buy = "buy" in str(item.get("type", "")).lower()
    action = "BUY" if is_buy else "SELL"
    direction = "Directional Long" if is_buy else "Directional Short"
    product_label = f"{product['productName']} ({product['productRoot']})"
    market_exposure = product["marketExposure"]
    volatility_risk = product["volatilityRisk"]

    if is_buy:
        portfolio_effect = (
            f"The contract provides a liquid and capital-efficient way to increase participation in "
            f"{market_exposure} without changing individual holdings."
        )
    else:
        portfolio_effect = (
            f"The contract provides a liquid and capital-efficient way to express a cautious view on "
            f"{market_exposure} without changing individual holdings."
        )

    return (
        f"I plan to {action} {security} to establish {direction} exposure through {product_label}. "
        f"{portfolio_effect} "
        f"I will monitor leverage, {volatility_risk}, margin requirements, and contract expiry."
    )


# Index futures rarely return EOD data under their own/root symbol on FMP.
# Fall back to a tradable ETF proxy that tracks the same index.
INDEX_PROXY = {
    "NQ": "QQQ", "MNQ": "QQQ", "NDX": "QQQ", "^NDX": "QQQ",
    "ES": "SPY", "MES": "SPY", "SPX": "SPY", "^GSPC": "SPY", "^SPX": "SPY",
    "YM": "DIA", "MYM": "DIA", "DJI": "DIA", "^DJI": "DIA",
    "RTY": "IWM", "M2K": "IWM", "RUT": "IWM", "^RUT": "IWM",
}


def fetch_history(symbol: str, from_date: str, to_date: str, fmp_api_key: str) -> list[dict]:
    if not symbol:
        return []
    try:
        return fmp_get("historical-price-eod/full", {"symbol": symbol, "from": from_date, "to": to_date}, fmp_api_key) or []
    except urllib.error.HTTPError:
        return []


def resolve_market_symbol(underlying: str, raw_symbol: str, from_date: str, to_date: str, fmp_api_key: str):
    """Pick a symbol that actually returns pre-trade EOD data.

    Try the AI-provided underlying first, then an ETF proxy for index futures,
    then the raw contract root. Returns (history, used_symbol) or ([], "").
    """
    candidates = []
    for candidate in (underlying, INDEX_PROXY.get(underlying.upper()), raw_symbol):
        if candidate and candidate not in candidates:
            candidates.append(candidate)
    for candidate in candidates:
        history = fetch_history(candidate, from_date, to_date, fmp_api_key)
        if history:
            return history, candidate
    return [], ""


def build_derivative_facts(transaction: dict, fmp_api_key: str, kind: str, underlying_symbol: str = "") -> dict:
    """Option / future report tracks the UNDERLYING's pre-trade price action.

    FMP cannot price broker contract codes like MNQH6, so we use the underlying
    (AI-provided) symbol, with an ETF proxy fallback for index futures.
    Company fundamentals do not apply; this is technicals-only.
    """
    raw_symbol = parse_symbol(transaction.get("security", ""))
    underlying = (underlying_symbol or "").strip().upper()
    trade_dt = parse_trade_date(transaction.get("tradeDate", ""))
    trade_date = trade_dt.strftime("%Y-%m-%d")
    data_cutoff_date = (trade_dt - timedelta(days=1)).strftime("%Y-%m-%d")
    trade_price = as_float(transaction.get("price"))
    from_date = (trade_dt - timedelta(days=460)).strftime("%Y-%m-%d")
    history, used_symbol = resolve_market_symbol(underlying, raw_symbol, from_date, data_cutoff_date, fmp_api_key)
    if not history:
        raise ValueError("No pre-trade market data is available for the underlying.")
    technicals = compute_technicals(history, data_cutoff_date, trade_price)
    technicals["underlyingSymbolUsed"] = used_symbol

    transaction_type = str(transaction.get("type", "")).strip()
    is_buy = "buy" in transaction_type.lower()
    price_label = "預期買入價格" if is_buy else "預期賣出價格"

    return {
        "trade": {
            "investmentManager": "Alex Chan",
            "company": transaction.get("description") or raw_symbol,
            "stockCode": transaction.get("security") or raw_symbol,
            "tradeDate": trade_date,
            "dataCutoffDate": data_cutoff_date,
            "type": transaction_type,
            "expectedPriceText": f"{price_label}： 約 {transaction.get('ccy') or 'USD'} {round1(trade_price)}，允許價格範圍 ±0.5%",
            "quantity": transaction.get("qty"),
            "broker": transaction.get("counterpart"),
            "underlyingSymbol": used_symbol,
        },
        "business": {"sector": None, "industry": None, "description": None},
        "fundamentalDataAvailableBeforeTradeDate": None,
        "kind": kind,
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
這是一份向公司內部說明的「下單理由」：當時為什麼決定在那個時間、用那個價格買入或賣出這檔股票。
這不是 equity research 或分析報告，而是把交易判斷講清楚的說明。請用自然、像真人撰寫的繁體中文。

寫作風格（最重要）：
- 不要使用第一人稱「我」「我們」，也不要用「本人」。改用無人稱的自然敘述，
  例如「買入 USAR 的主要考量是…」「選擇在這個價位進場，是因為…」「之所以在此時建立部位，原因在於…」。
- 像人說話，不要像報表。用完整、流暢的句子，段落之間要有邏輯銜接，不要條列數據。
- 數字要融進敘述、服務於理由，不要把指標一個個列出來。例如不要寫「RSI14 為 45.2、SMA20 為 180」，
  而要寫「當時股價剛回落到 20 日均線附近、動能轉趨溫和，屬於相對從容的進場點」。
- 重點始終是「為什麼是這檔、為什麼這個價、為什麼這個時間」，圍繞 trade.expectedPriceText 的價格展開。
- 可帶判斷與取捨的語氣（值得留意的是…、讓這個價位具吸引力的是…、選擇在此價位的原因是…）。
- 避免生硬的標題式句子和制式結論。

硬性要求：
- 只能根據提供的 JSON 事實，不要杜撰新聞、price target、分析師評等。
- 不要提任何資料來源或資料供應商名稱。
- 絕對不要出現「截至…可取得資料」「資料截止日」「data cutoff」之類的字眼，也不要寫任何資料截止日期。
- 不要寫成 Valuation / Position Review 或 Conclusion 段落，也不要加報告標題。
- 投資經理固定寫「投資經理： Alex Chan」。
- 交易類型只說 BUY 或 SELL。
- Details of Proposal 的價格用 trade.expectedPriceText，不要用「建議」二字。

investmentStrategyParagraphs 內容：
- 4-5 段，連貫地把買/賣這檔股票的理由講清楚。
- 先談公司與產業面（為什麼這檔值得持有/減持），再說明為什麼這個價位與時機合適
  （把進場價和當時的近期股價走勢、均線位置、回檔或突破、量能、波動自然地連起來說）。
- 用交易發生前能掌握的資訊來說明判斷，語氣是回顧當時的決定，不要聲稱用了成交當天或之後的價格。

Data JSON:
{json.dumps(facts, ensure_ascii=False, indent=2)}
"""
    body = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0.7,
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


def classify_transactions(items: list[dict], gemini_api_key: str, futures_overrides: object = None) -> list[dict]:
    """Classify each row's security kind and underlying symbol with the LLM.

    The model only picks from a closed set of kinds and extracts a likely
    underlying ticker. It never alters trade numbers. Rule-based security_kind
    is the fallback per row if the model omits or returns an invalid kind.
    """
    rows = [
        {
            "index": index,
            "security": str(item.get("security", "")),
            "description": str(item.get("description", "")),
        }
        for index, item in enumerate(items)
    ]
    schema = {
        "type": "object",
        "properties": {
            "rows": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "index": {"type": "integer"},
                        "kind": {"type": "string", "enum": ["stock", "option", "future", "unsupported"]},
                        "underlyingSymbol": {"type": "string"},
                    },
                    "required": ["index", "kind", "underlyingSymbol"],
                },
            }
        },
        "required": ["rows"],
    }
    prompt = (
        "你是金融交易資料分類助手。下面每一列有 security 代號與 description。\n"
        "請判斷每列的證券型別，kind 只能是 stock / option / future / unsupported：\n"
        "- stock：個股 / 股票 / equity。\n"
        "- option：股票或指數選擇權 (call / put)。\n"
        "- future：期貨合約 (例如 MNQH6、MNQ 20MAR26、ES、NQ 等代號)。\n"
        "- unsupported：貨幣 (curncy)、指數本身 (index)、商品 (cmdty) 或無法判斷。\n"
        "underlyingSymbol：標的物可在美股市場查到的代號 (期權/期貨填標的，股票填自身)，"
        "無法判斷則填空字串。指數型期貨請填可交易的對應 ETF (Nasdaq-100→QQQ、"
        "S&P500→SPY、Dow→DIA、Russell2000→IWM)；個股期權填標的股票代號。"
        "不要更動任何其他資料。\n\n"
        f"Data JSON:\n{json.dumps(rows, ensure_ascii=False)}"
    )
    body = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0,
            "maxOutputTokens": 4000,
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
    parsed = json.loads(text)

    by_index = {}
    for row in parsed.get("rows", []):
        try:
            by_index[int(row.get("index"))] = row
        except (TypeError, ValueError):
            continue

    results = []
    for index, item in enumerate(items):
        row = by_index.get(index, {})
        kind = row.get("kind")
        rule_kind = security_kind(item.get("security", ""))
        if rule_kind in {"stock", "option", "future"}:
            kind = rule_kind
        elif kind not in {"stock", "option", "future"}:
            kind = rule_kind
        underlying = str(row.get("underlyingSymbol", "")).strip().upper()
        futures_product = resolve_futures_product(item.get("security", ""), futures_overrides)
        text_hint = f"{item.get('security', '')} {item.get('description', '')}".lower()
        is_future = (
            kind == "future"
            or " future" in f" {text_hint}"
            or bool(futures_product.get("contractMonth"))
        )
        if is_future and futures_product["mappingStatus"] == "mapped":
            kind = "future"
            underlying = futures_product["marketDataSymbol"]
        elif not is_future:
            futures_product = {}
            if kind == "stock":
                underlying = parse_symbol(item.get("security", ""))
        else:
            kind = "future"
            underlying = ""
        results.append({
            "index": index,
            "kind": kind,
            "underlyingSymbol": underlying,
            "futuresProduct": futures_product,
        })
    return results


def generate_pretrade_reasons(
    items: list[dict],
    gemini_api_key: str,
    futures_overrides: object = None,
) -> list[dict]:
    rows = [
        {
            "index": item.get("index", index),
            "tradeDate": str(item.get("tradeDate", "")),
            "type": str(item.get("type", "")),
            "security": str(item.get("security", "")),
            "description": str(item.get("description", "")),
            "ccy": str(item.get("ccy", "")),
            "gross": str(item.get("gross", "")),
            "counterpart": str(item.get("counterpart", "")),
            "kind": str(item.get("kind", "")),
            "underlyingSymbol": str(item.get("underlyingSymbol", "")),
            "stockContext": item.get("stockContext") or None,
        }
        for index, item in enumerate(items)
    ]
    schema = {
        "type": "object",
        "properties": {
            "rows": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "index": {"type": "integer"},
                        "evidenceId": {"type": "string"},
                        "reason": {"type": "string"},
                    },
                    "required": ["index", "evidenceId", "reason"],
                },
            }
        },
        "required": ["rows"],
    }
    prompt = (
        "You are selecting locked pre-trade evidence and preparing concise English support text for internal fund compliance records.\n"
        "For every open stock trade, inspect only stockContext.evidence and return exactly one evidenceId from that list whose stance best supports the BUY or SELL direction. Never invent or alter an evidence ID. Set reason to an empty string for stock trades because the backend will compose the final wording from the locked evidence statement.\n"
        "If a stock trade has no evidence, return an empty evidenceId and an empty reason. Never introduce earnings announcements, news, analyst views, market expectations, events, figures, dates, or company claims.\n"
        "For option trades only, set evidenceId to an empty string and write 2-3 first-person professional sentences using only the submitted transaction fields. Futures reasons are composed deterministically by the backend as Directional Long or Directional Short and any model-written futures reason will be ignored. Use BUY and SELL. Do not mention quantity, price, proposed price range, data vendors, JSON field names, unprovided events, analyst ratings, price targets, or news.\n"
        "Keep all wording neutral and suitable for an internal compliance record, not investment advice to outside investors.\n\n"
        f"Data JSON:\n{json.dumps(rows, ensure_ascii=False)}"
    )
    body = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0.1,
            "maxOutputTokens": 8000,
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
    parsed = json.loads(text)

    ai_rows = {}
    for row in parsed.get("rows", []):
        try:
            index = int(row.get("index"))
        except (TypeError, ValueError):
            continue
        ai_rows[index] = row

    results = []
    for position, item in enumerate(items):
        try:
            index = int(item.get("index", position))
        except (TypeError, ValueError):
            index = position
        ai_row = ai_rows.get(index, {})
        futures_product = resolve_futures_product(item.get("security", ""), futures_overrides)
        if str(item.get("kind", "")).lower() == "future" and is_open_position_type(item.get("type", "")):
            if futures_product["mappingStatus"] != "mapped":
                root = futures_product.get("productRoot") or parse_symbol(item.get("security", ""))
                results.append({
                    "index": index,
                    "reason": "",
                    "evidenceId": "",
                    "evidenceDate": "",
                    "error": f"Futures product code {root or '[blank]'} is not mapped.",
                    "futuresProduct": futures_product,
                })
                continue
        futures_reason = build_directional_futures_reason(item, futures_overrides)
        if futures_reason:
            results.append({
                "index": index,
                "reason": futures_reason,
                "evidenceId": "",
                "evidenceDate": "",
                "futuresProduct": futures_product,
            })
            continue
        locked_reason, selected_evidence = build_evidence_locked_stock_reason(
            item,
            str(ai_row.get("evidenceId", "")),
        )
        if locked_reason:
            results.append({
                "index": index,
                "reason": locked_reason,
                "evidenceId": selected_evidence.get("id", "") if selected_evidence else "",
                "evidenceDate": evidence_date(selected_evidence) if selected_evidence else "",
            })
            continue

        reason = str(ai_row.get("reason", "")).strip()
        if reason:
            results.append({"index": index, "reason": reason, "evidenceId": "", "evidenceDate": ""})
    return results


class Handler(BaseHTTPRequestHandler):
    server_version = "ROTransactionAPI/1.0"

    def do_GET(self):
        if self.path.rstrip("/") == "/RO_transaction/api/health":
            json_response(self, 200, {"ok": True})
            return
        if self.path.rstrip("/") == "/RO_transaction/api/futures-products":
            json_response(self, 200, {
                "registryVersion": REGISTRY_VERSION,
                "products": public_registry(),
            })
            return
        json_response(self, 404, {"error": "Not found"})

    def do_POST(self):
        route = self.path.rstrip("/")
        if route == "/RO_transaction/api/classify-transactions":
            self.handle_classify()
            return
        if route == "/RO_transaction/api/pretrade-reasons":
            self.handle_pretrade_reasons()
            return
        if route != "/RO_transaction/api/strategy-report":
            json_response(self, 404, {"error": "Not found"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            transaction = payload.get("transaction") or {}
            if not is_open_position_type(transaction.get("type", "")):
                raise ValueError("Strategy report is only available for open positions.")
            kind = payload.get("kind") if payload.get("kind") in {"stock", "option", "future"} else None
            if kind is None:
                kind = security_kind(transaction.get("security", ""))
            if kind != "stock":
                raise ValueError("Strategy report is only available for stock trades.")
            env = load_env()
            if not env.get("FMP_API_KEY") or not env.get("GEMINI_API_KEY"):
                raise RuntimeError("Server API keys are not configured.")
            facts = build_facts(transaction, env["FMP_API_KEY"], kind, str(payload.get("underlyingSymbol", "")))
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

    def handle_classify(self) -> None:
        try:
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            items = payload.get("transactions")
            if not isinstance(items, list) or not items:
                raise ValueError("No transactions to classify.")
            env = load_env()
            if not env.get("GEMINI_API_KEY"):
                raise RuntimeError("Server API keys are not configured.")
            results = classify_transactions(
                items,
                env["GEMINI_API_KEY"],
                payload.get("futuresOverrides"),
            )
            json_response(self, 200, {"results": results})
        except (ValueError, RuntimeError) as exc:
            json_response(self, 400, {"error": str(exc)})
        except urllib.error.HTTPError as exc:
            json_response(self, 502, {"error": f"External API error: HTTP {exc.code}"})
        except Exception as exc:
            print(f"Unhandled classify error: {exc}", file=sys.stderr)
            json_response(self, 500, {"error": "Failed to classify transactions."})

    def handle_pretrade_reasons(self) -> None:
        try:
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            items = payload.get("transactions")
            if not isinstance(items, list) or not items:
                raise ValueError("No transactions for reason generation.")
            env = load_env()
            if not env.get("GEMINI_API_KEY"):
                raise RuntimeError("Server API keys are not configured.")
            enriched_items = enrich_pretrade_reason_items(items, env.get("FMP_API_KEY", ""))
            results = generate_pretrade_reasons(
                enriched_items,
                env["GEMINI_API_KEY"],
                payload.get("futuresOverrides"),
            )
            json_response(self, 200, {"results": results})
        except (ValueError, RuntimeError) as exc:
            json_response(self, 400, {"error": str(exc)})
        except urllib.error.HTTPError as exc:
            json_response(self, 502, {"error": f"External API error: HTTP {exc.code}"})
        except Exception as exc:
            print(f"Unhandled pretrade reason error: {exc}", file=sys.stderr)
            json_response(self, 500, {"error": "Failed to generate pre-trade reasons."})

    def log_message(self, format: str, *args) -> None:
        print(f"{self.address_string()} - {format % args}", file=sys.stderr)


def safe_filename(value: str) -> str:
    cleaned = re.sub(r'[\\/:*?"<>|\s]+', "_", value.strip())
    return cleaned.strip("_") or "strategy_report.pdf"


if __name__ == "__main__":
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"RO transaction API listening on http://{HOST}:{PORT}", flush=True)
    server.serve_forever()
