# RO_trade_file-

Local web app for generating RO transaction order PDF forms from uploaded Excel transaction files.

## Features

- Upload `.xlsx`, `.xls`, or `.csv` transaction files
- Preview and edit transaction rows in the browser
- Configure fund/entity name, executed-by details, RO review details, dates, signatures, and notes
- Export daily pre-trade and post-trade PDF or Word report bundles
- Resolve supported futures contract roots through a server-side product registry
- Prefer Excel `STYPE_DESCRIPTION` for deterministic stock, option, and futures classification
- Support futures reasons with moving-average and RSI signals dated before the trade
- Block unknown futures codes until a validated Settings override is supplied

## Usage

Start a local static server in this folder:

```powershell
python -m http.server 8787 --bind 127.0.0.1
```

Open:

```text
http://127.0.0.1:8787/
```

The API must also be available through `/RO_transaction/api/` in production. Its endpoints include health, transaction classification, pre-trade reasons, strategy reports, and the read-only futures product registry.

## Data Handling

Actual transaction spreadsheets, signed outputs, PDFs, and image attachments are excluded from git by default.
