# RO_trade_file-

Local web app for generating RO transaction order PDF forms from uploaded Excel transaction files.

## Features

- Upload `.xlsx`, `.xls`, or `.csv` transaction files
- Preview and edit transaction rows in the browser
- Configure fund/entity name, executed-by details, RO review details, dates, signatures, and notes
- Export a PDF with 20 transactions per page
- Runs locally with static files; no backend upload is required

## Usage

Start a local static server in this folder:

```powershell
python -m http.server 8787 --bind 127.0.0.1
```

Open:

```text
http://127.0.0.1:8787/
```

## Data Handling

Actual transaction spreadsheets, signed outputs, PDFs, and image attachments are excluded from git by default.
