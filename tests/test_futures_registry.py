import json
import unittest
from unittest.mock import patch

import api_server
from futures_registry import parse_contract_code, resolve_futures_product


def gemini_response(rows):
    return {
        "candidates": [{
            "content": {
                "parts": [{"text": json.dumps({"rows": rows})}],
            },
        }],
    }


class FuturesRegistryTests(unittest.TestCase):
    def test_distinct_copper_contract_roots(self):
        cases = {
            "MHGN6": ("MHG", "Micro Copper Futures"),
            "HGN6": ("HG", "Copper Futures"),
            "QCN6": ("QC", "E-mini Copper Futures"),
        }
        for security, expected in cases.items():
            with self.subTest(security=security):
                product = resolve_futures_product(security)
                self.assertEqual(
                    (product["productRoot"], product["productName"]),
                    expected,
                )

    def test_contract_root_is_parsed_from_the_right(self):
        self.assertEqual(resolve_futures_product("MNQM6")["productRoot"], "MNQ")
        self.assertEqual(resolve_futures_product("M2KM6")["productRoot"], "M2K")
        self.assertEqual(resolve_futures_product("1OZM6")["productRoot"], "1OZ")
        self.assertEqual(resolve_futures_product("MYMU6")["productRoot"], "MYM")

    def test_excel_stype_description_is_authoritative(self):
        self.assertEqual(api_server.security_kind("MYMU6 Index", "Futures"), "future")
        self.assertEqual(api_server.security_kind("PL US Equity", "Common Stock"), "stock")

    @patch("api_server.http_json")
    def test_mym_classification_does_not_require_gemini(self, http_json):
        result = api_server.classify_transactions(
            [{
                "security": "MYMU6 Index",
                "description": "Micro E-mini Dow Futures",
                "stypeDescription": "Futures",
            }],
            "",
        )[0]
        http_json.assert_not_called()
        self.assertEqual(result["kind"], "future")
        self.assertEqual(result["underlyingSymbol"], "DIA")
        self.assertEqual(result["futuresProduct"]["productRoot"], "MYM")

    def test_spaced_eurex_local_symbol(self):
        parsed = parse_contract_code("FGBL MAR 26", ["FGBL"])
        self.assertEqual(parsed["productRoot"], "FGBL")
        self.assertEqual(parsed["contractMonth"], "H")
        self.assertEqual(parsed["contractYear"], "26")

    def test_unknown_code_is_not_guessed(self):
        product = resolve_futures_product("ZZZN6")
        self.assertEqual(product["productRoot"], "ZZZ")
        self.assertEqual(product["mappingStatus"], "unmapped")
        self.assertEqual(product["productName"], "")

    def test_user_override_maps_an_unknown_root(self):
        overrides = [{
            "productRoot": "ZZZ",
            "productName": "Custom Index Futures",
            "marketExposure": "the custom index market",
            "volatilityRisk": "custom index volatility",
            "exchange": "TEST",
        }]
        product = resolve_futures_product("ZZZN6", overrides)
        self.assertEqual(product["mappingStatus"], "mapped")
        self.assertEqual(product["productName"], "Custom Index Futures")

    @patch("api_server.http_json")
    def test_registry_overrides_incorrect_gemini_underlying(self, http_json):
        http_json.return_value = gemini_response([{
            "index": 0,
            "kind": "future",
            "underlyingSymbol": "HG",
        }])
        result = api_server.classify_transactions(
            [{"security": "MHGN6", "description": "Micro Copper Futures"}],
            "test-key",
        )[0]
        self.assertEqual(result["kind"], "future")
        self.assertEqual(result["underlyingSymbol"], "MHG")
        self.assertEqual(result["futuresProduct"]["productRoot"], "MHG")

    @patch("api_server.http_json")
    def test_equity_ticker_matching_a_future_root_stays_stock(self, http_json):
        http_json.return_value = gemini_response([{
            "index": 0,
            "kind": "future",
            "underlyingSymbol": "PLATINUM",
        }])
        result = api_server.classify_transactions(
            [{"security": "PL US Equity", "description": "Planet Labs PBC"}],
            "test-key",
        )[0]
        self.assertEqual(result["kind"], "stock")
        self.assertEqual(result["underlyingSymbol"], "PL")
        self.assertEqual(result["futuresProduct"], {})

    @patch("api_server.http_json")
    def test_micro_copper_reason_uses_mhg_product(self, http_json):
        http_json.return_value = gemini_response([])
        result = api_server.generate_pretrade_reasons(
            [{
                "index": 0,
                "tradeDate": "2026-07-01",
                "type": "Buy to Open",
                "security": "MHGN6",
                "description": "Micro Copper Futures",
                "kind": "future",
            }],
            "test-key",
        )[0]
        self.assertIn("Micro Copper Futures (MHG)", result["reason"])
        self.assertIn("the copper market", result["reason"])
        self.assertNotIn("exposure to HG", result["reason"])
        http_json.assert_not_called()

    def test_mym_reason_uses_locked_pretrade_technical_signal(self):
        item = {
            "tradeDate": "2026-07-02",
            "type": "Buy to Open",
            "security": "MYMU6",
            "kind": "future",
            "futuresTechnicalContext": {
                "marketDataSymbol": "DIA",
                "technical": {
                    "date": "2026-07-01",
                    "closeVsSma20Pct": 1.5,
                    "closeVsSma50Pct": 2.5,
                    "rsi14": 58,
                },
            },
        }
        reason = api_server.build_directional_futures_reason(item)
        self.assertIn("Micro E-mini Dow Futures (MYM)", reason)
        self.assertIn("As of 2026-07-01", reason)
        self.assertIn("indicated upward momentum", reason)
        self.assertIn("supporting the Directional Long position", reason)
        self.assertNotIn("company-specific", reason)
        self.assertNotIn("without changing individual holdings", reason)

    def test_future_reason_rejects_same_day_technical_data(self):
        item = {
            "tradeDate": "2026-07-02",
            "type": "Sell to Open",
            "security": "MYMU6",
            "kind": "future",
            "futuresTechnicalContext": {
                "marketDataSymbol": "DIA",
                "technical": {
                    "date": "2026-07-02",
                    "closeVsSma20Pct": -1.5,
                    "closeVsSma50Pct": -2.5,
                    "rsi14": 42,
                },
            },
        }
        reason = api_server.build_directional_futures_reason(item)
        self.assertNotIn("As of 2026-07-02", reason)
        self.assertIn("liquid and capital-efficient", reason)
        self.assertNotIn("without changing individual holdings", reason)

    def test_sell_future_reason_uses_downward_signal(self):
        item = {
            "tradeDate": "2026-07-02",
            "type": "Sell to Open",
            "security": "MYMU6",
            "kind": "future",
            "futuresTechnicalContext": {
                "marketDataSymbol": "DIA",
                "technical": {
                    "date": "2026-07-01",
                    "closeVsSma20Pct": -1.5,
                    "closeVsSma50Pct": -2.5,
                    "rsi14": 42,
                },
            },
        }
        reason = api_server.build_directional_futures_reason(item)
        self.assertIn("Directional Short", reason)
        self.assertIn("indicated downward momentum", reason)
        self.assertIn("supporting the Directional Short position", reason)

    @patch("api_server.http_json")
    def test_unknown_future_reason_fails_closed(self, http_json):
        http_json.return_value = gemini_response([])
        result = api_server.generate_pretrade_reasons(
            [{
                "index": 0,
                "tradeDate": "2026-07-01",
                "type": "Sell to Open",
                "security": "ZZZN6",
                "description": "Unknown Futures",
                "kind": "future",
            }],
            "test-key",
        )[0]
        self.assertEqual(result["reason"], "")
        self.assertEqual(result["futuresProduct"]["mappingStatus"], "unmapped")
        self.assertIn("is not mapped", result["error"])


if __name__ == "__main__":
    unittest.main()
