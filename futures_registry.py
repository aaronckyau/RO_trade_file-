from __future__ import annotations

import re
from typing import Iterable


REGISTRY_VERSION = "2026-08-06"
MONTH_CODES = frozenset("FGHJKMNQUVXZ")
MONTH_NAME_CODES = {
    "JAN": "F", "FEB": "G", "MAR": "H", "APR": "J",
    "MAY": "K", "JUN": "M", "JUL": "N", "AUG": "Q",
    "SEP": "U", "OCT": "V", "NOV": "X", "DEC": "Z",
}
ROOT_PATTERN = re.compile(r"^[A-Z0-9]{1,8}$")
COMPACT_CONTRACT_PATTERN = re.compile(
    r"^(?P<root>[A-Z0-9]+?)(?P<month>[FGHJKMNQUVXZ])(?P<year>\d{1,4})$"
)

CME_SOURCE = "https://www.cmegroup.com/markets/products"
ICE_SOURCE = "https://www.ice.com/products/Futures-Options/"
EUREX_SOURCE = "https://www.eurex.com/ex-en/markets/productSearch"


def _product(
    root: str,
    name: str,
    exposure: str,
    volatility: str,
    exchange: str,
    source_url: str,
    market_data_symbol: str = "",
) -> dict[str, str]:
    return {
        "productRoot": root,
        "productName": name,
        "marketExposure": exposure,
        "volatilityRisk": volatility,
        "exchange": exchange,
        "sourceUrl": source_url,
        "sourceAsOf": REGISTRY_VERSION,
        "marketDataSymbol": market_data_symbol or root,
    }


_PRODUCTS = [
    # CME equity index futures
    _product("ES", "E-mini S&P 500 Futures", "the S&P 500 market", "broad-market volatility", "CME", CME_SOURCE, "SPY"),
    _product("MES", "Micro E-mini S&P 500 Futures", "the S&P 500 market", "broad-market volatility", "CME", CME_SOURCE, "SPY"),
    _product("NQ", "E-mini Nasdaq-100 Futures", "the Nasdaq-100 market", "technology and growth-stock volatility", "CME", CME_SOURCE, "QQQ"),
    _product("MNQ", "Micro E-mini Nasdaq-100 Futures", "the Nasdaq-100 market", "technology and growth-stock volatility", "CME", CME_SOURCE, "QQQ"),
    _product("RTY", "E-mini Russell 2000 Futures", "the U.S. small-cap equity market", "small-cap equity volatility", "CME", CME_SOURCE, "IWM"),
    _product("M2K", "Micro E-mini Russell 2000 Futures", "the U.S. small-cap equity market", "small-cap equity volatility", "CME", CME_SOURCE, "IWM"),
    _product("YM", "E-mini Dow Futures", "the Dow Jones Industrial Average market", "U.S. blue-chip equity volatility", "CBOT", CME_SOURCE, "DIA"),
    _product("MYM", "Micro E-mini Dow Futures", "the Dow Jones Industrial Average market", "U.S. blue-chip equity volatility", "CBOT", CME_SOURCE, "DIA"),

    # COMEX metals. These roots are deliberately distinct products.
    _product("GC", "Gold Futures", "the gold market", "gold price volatility", "COMEX", CME_SOURCE),
    _product("MGC", "Micro Gold Futures", "the gold market", "gold price volatility", "COMEX", CME_SOURCE),
    _product("1OZ", "1-Ounce Gold Futures", "the gold market", "gold price volatility", "COMEX", CME_SOURCE),
    _product("SI", "Silver Futures", "the silver market", "silver price volatility", "COMEX", CME_SOURCE),
    _product("SIL", "Micro Silver Futures", "the silver market", "silver price volatility", "COMEX", CME_SOURCE),
    _product("HG", "Copper Futures", "the copper market", "copper price volatility", "COMEX", CME_SOURCE),
    _product("MHG", "Micro Copper Futures", "the copper market", "copper price volatility", "COMEX", CME_SOURCE),
    _product("QC", "E-mini Copper Futures", "the copper market", "copper price volatility", "COMEX", CME_SOURCE),
    _product("PL", "Platinum Futures", "the platinum market", "platinum price volatility", "NYMEX", CME_SOURCE),
    _product("PA", "Palladium Futures", "the palladium market", "palladium price volatility", "NYMEX", CME_SOURCE),

    # NYMEX energy futures
    _product("CL", "Crude Oil Futures", "the crude oil market", "crude oil price volatility", "NYMEX", CME_SOURCE),
    _product("MCL", "Micro WTI Crude Oil Futures", "the crude oil market", "crude oil price volatility", "NYMEX", CME_SOURCE),
    _product("QM", "E-mini Crude Oil Futures", "the crude oil market", "crude oil price volatility", "NYMEX", CME_SOURCE),
    _product("NG", "Henry Hub Natural Gas Futures", "the natural gas market", "natural gas price volatility", "NYMEX", CME_SOURCE),
    _product("QG", "E-mini Natural Gas Futures", "the natural gas market", "natural gas price volatility", "NYMEX", CME_SOURCE),
    _product("RB", "RBOB Gasoline Futures", "the gasoline market", "gasoline price volatility", "NYMEX", CME_SOURCE),
    _product("HO", "NY Harbor ULSD Futures", "the distillate fuel market", "distillate fuel price volatility", "NYMEX", CME_SOURCE),

    # CBOT rates and agriculture
    _product("ZT", "2-Year U.S. Treasury Note Futures", "the short-term U.S. Treasury market", "interest-rate volatility", "CBOT", CME_SOURCE),
    _product("ZF", "5-Year U.S. Treasury Note Futures", "the intermediate U.S. Treasury market", "interest-rate volatility", "CBOT", CME_SOURCE),
    _product("ZN", "10-Year U.S. Treasury Note Futures", "the 10-year U.S. Treasury market", "interest-rate volatility", "CBOT", CME_SOURCE),
    _product("TN", "Ultra 10-Year U.S. Treasury Note Futures", "the long-duration U.S. Treasury market", "interest-rate volatility", "CBOT", CME_SOURCE),
    _product("ZB", "U.S. Treasury Bond Futures", "the long-term U.S. Treasury market", "interest-rate volatility", "CBOT", CME_SOURCE),
    _product("UB", "Ultra U.S. Treasury Bond Futures", "the ultra-long U.S. Treasury market", "interest-rate volatility", "CBOT", CME_SOURCE),
    _product("SR3", "Three-Month SOFR Futures", "the U.S. short-term interest-rate market", "short-term interest-rate volatility", "CME", CME_SOURCE),
    _product("ZC", "Corn Futures", "the corn market", "corn price volatility", "CBOT", CME_SOURCE),
    _product("ZW", "Chicago SRW Wheat Futures", "the wheat market", "wheat price volatility", "CBOT", CME_SOURCE),
    _product("ZS", "Soybean Futures", "the soybean market", "soybean price volatility", "CBOT", CME_SOURCE),
    _product("ZM", "Soybean Meal Futures", "the soybean meal market", "soybean meal price volatility", "CBOT", CME_SOURCE),
    _product("ZL", "Soybean Oil Futures", "the soybean oil market", "soybean oil price volatility", "CBOT", CME_SOURCE),

    # CME cryptocurrency futures
    _product("BTC", "Bitcoin Futures", "the bitcoin market", "digital-asset price volatility", "CME", CME_SOURCE),
    _product("MBT", "Micro Bitcoin Futures", "the bitcoin market", "digital-asset price volatility", "CME", CME_SOURCE),
    _product("ETH", "Ether Futures", "the ether market", "digital-asset price volatility", "CME", CME_SOURCE),
    _product("MET", "Micro Ether Futures", "the ether market", "digital-asset price volatility", "CME", CME_SOURCE),

    # Common ICE Futures U.S. and ICE Futures Europe products
    _product("B", "Brent Crude Futures", "the Brent crude oil market", "crude oil price volatility", "ICE", ICE_SOURCE),
    _product("DX", "U.S. Dollar Index Futures", "the U.S. Dollar Index market", "foreign-exchange volatility", "ICE US", ICE_SOURCE),
    _product("KC", "Coffee C Futures", "the arabica coffee market", "coffee price volatility", "ICE US", ICE_SOURCE),
    _product("CC", "Cocoa Futures", "the cocoa market", "cocoa price volatility", "ICE US", ICE_SOURCE),
    _product("CT", "Cotton No. 2 Futures", "the cotton market", "cotton price volatility", "ICE US", ICE_SOURCE),
    _product("SB", "Sugar No. 11 Futures", "the raw sugar market", "sugar price volatility", "ICE US", ICE_SOURCE),
    _product("OJ", "FCOJ-A Futures", "the frozen concentrated orange juice market", "orange juice price volatility", "ICE US", ICE_SOURCE),
    _product("RS", "Canola Futures", "the canola market", "canola price volatility", "ICE Canada", ICE_SOURCE),

    # Common Eurex product IDs / IB local-symbol roots
    _product("FESX", "EURO STOXX 50 Index Futures", "the EURO STOXX 50 market", "European equity-index volatility", "EUREX", EUREX_SOURCE),
    _product("FDAX", "DAX Futures", "the German large-cap equity market", "German equity-index volatility", "EUREX", EUREX_SOURCE),
    _product("FDXM", "Mini-DAX Futures", "the German large-cap equity market", "German equity-index volatility", "EUREX", EUREX_SOURCE),
    _product("FGBL", "Euro-Bund Futures", "the long-term German government bond market", "European interest-rate volatility", "EUREX", EUREX_SOURCE),
    _product("FGBM", "Euro-Bobl Futures", "the medium-term German government bond market", "European interest-rate volatility", "EUREX", EUREX_SOURCE),
    _product("FGBS", "Euro-Schatz Futures", "the short-term German government bond market", "European interest-rate volatility", "EUREX", EUREX_SOURCE),
]

FUTURES_PRODUCTS = {item["productRoot"]: item for item in _PRODUCTS}


def parse_contract_code(security: str, known_roots: Iterable[str] = ()) -> dict[str, str]:
    text = str(security or "").strip().upper()
    if not text:
        return {"contractCode": "", "productRoot": "", "contractMonth": "", "contractYear": ""}

    tokens = [re.sub(r"[^A-Z0-9]", "", token) for token in text.split()]
    tokens = [token for token in tokens if token]
    first_token = tokens[0]
    roots = sorted({root.upper() for root in known_roots if root}, key=len, reverse=True)

    if first_token in roots:
        month = ""
        year = ""
        if len(tokens) > 1:
            compact_expiry = re.fullmatch(r"([FGHJKMNQUVXZ])(\d{1,4})", tokens[1])
            named_expiry = re.fullmatch(r"([A-Z]{3})(\d{1,4})", tokens[1])
            if compact_expiry:
                month, year = compact_expiry.groups()
            elif named_expiry and named_expiry.group(1) in MONTH_NAME_CODES:
                month = MONTH_NAME_CODES[named_expiry.group(1)]
                year = named_expiry.group(2)
            elif tokens[1] in MONTH_NAME_CODES and len(tokens) > 2 and re.fullmatch(r"\d{1,4}", tokens[2]):
                month = MONTH_NAME_CODES[tokens[1]]
                year = tokens[2]
        return {
            "contractCode": first_token,
            "productRoot": first_token,
            "contractMonth": month,
            "contractYear": year,
        }

    for root in roots:
        if not first_token.startswith(root):
            continue
        suffix = first_token[len(root):]
        match = re.fullmatch(r"([FGHJKMNQUVXZ])(\d{1,4})", suffix)
        if match:
            return {
                "contractCode": first_token,
                "productRoot": root,
                "contractMonth": match.group(1),
                "contractYear": match.group(2),
            }

    match = COMPACT_CONTRACT_PATTERN.fullmatch(first_token)
    if match:
        return {
            "contractCode": first_token,
            "productRoot": match.group("root"),
            "contractMonth": match.group("month"),
            "contractYear": match.group("year"),
        }

    return {
        "contractCode": first_token,
        "productRoot": first_token,
        "contractMonth": "",
        "contractYear": "",
    }


def normalize_overrides(overrides: object) -> dict[str, dict[str, str]]:
    if not isinstance(overrides, list):
        return {}
    if len(overrides) > 200:
        raise ValueError("A maximum of 200 futures product overrides is allowed.")

    normalized: dict[str, dict[str, str]] = {}
    for raw in overrides:
        if not isinstance(raw, dict):
            raise ValueError("Each futures product override must be an object.")
        root = str(raw.get("productRoot", "")).strip().upper()
        name = str(raw.get("productName", "")).strip()
        exposure = str(raw.get("marketExposure", "")).strip()
        volatility = str(raw.get("volatilityRisk", "")).strip()
        exchange = str(raw.get("exchange", "CUSTOM")).strip().upper() or "CUSTOM"
        values = (name, exposure, volatility, exchange)
        if not ROOT_PATTERN.fullmatch(root):
            raise ValueError(f"Invalid futures product root: {root or '[blank]'}.")
        if not name or not exposure:
            raise ValueError(f"Futures override {root} requires a product name and market exposure.")
        if any(len(value) > 120 for value in values):
            raise ValueError(f"Futures override {root} contains a value longer than 120 characters.")
        normalized[root] = _product(
            root,
            name,
            exposure,
            volatility or "market volatility",
            exchange,
            "user-setting",
        )
        normalized[root]["sourceAsOf"] = "user-setting"
    return normalized


def resolve_futures_product(security: str, overrides: object = None) -> dict[str, str]:
    custom = normalize_overrides(overrides)
    products = {**FUTURES_PRODUCTS, **custom}
    parsed = parse_contract_code(security, products)
    root = parsed["productRoot"]
    product = products.get(root)
    if not product:
        return {
            **parsed,
            "mappingStatus": "unmapped",
            "productName": "",
            "marketExposure": "",
            "volatilityRisk": "",
            "exchange": "",
            "sourceUrl": "",
            "sourceAsOf": "",
            "marketDataSymbol": "",
        }
    return {**parsed, **product, "mappingStatus": "mapped"}


def public_registry() -> list[dict[str, str]]:
    return [dict(FUTURES_PRODUCTS[root]) for root in sorted(FUTURES_PRODUCTS)]
