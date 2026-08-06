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
