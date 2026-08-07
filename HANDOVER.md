# RO Transaction App Handover

## Purpose

This app converts uploaded Excel / CSV transaction sheets into RO compliance report ZIP files.

Current production behavior:

- Current application version: `v2026.08.07.2`. The version is displayed beside the Settings button in the top band. Production remains on the previous version until this change is explicitly deployed.

- User uploads one or more Excel / CSV transaction files in the browser.
- The app parses the first worksheet in each file, merges all rows, and previews editable transaction rows.
- The fund name / dealing account is inferred from filenames like `X Squared Capital Management LPF - Securities transactions - 2026-1-1 - 2026-3-31.xlsx`.
- The inferred fund name can be amended in Settings.
- Transactions are grouped by `Trade Date`.
- The Transaction tab exports two ZIP options:
  - `PDF ZIP`: one folder per trade date, containing one `Pre_{Deal No.}.pdf` per transaction and one daily post-trade PDF.
  - `Word ZIP`: one folder per trade date, containing one `Pre_{Deal No.}.docx` per transaction and one daily post-trade `.docx`.
- Pre-trade output has one separate file per transaction. Duplicate deal numbers receive `_2`, `_3`, and subsequent suffixes.
- Post-trade output has one portrait form per trade date and does not include a transaction schedule or transaction-table attachment.
- PDF key/value fields wrap to show full content without ellipsis and rows expand automatically.
- Post-trade PDF and Word output follows the supplied professional sign-off form without adding landscape attachment pages.
- The post-trade form contains seven checkboxes (two confirmations and five conclusion checks). All seven follow the Settings default-checklist option, which is enabled by default.
- Settings includes a `Post-Trade RO Comments` text area. Its content appears immediately above `Approved By RO`; the PDF output uses an editable, printable multiline AcroForm text field, while the Word output uses a normally editable table cell. The field remains visible when left blank.
- Settings provides separate `Fund Name` and `Dealing Account` fields. Both initially use the entity inferred from the uploaded filename, can be amended independently, and appear separately in Post-Trade PDF/Word output; a blank Dealing Account falls back to Fund Name.
- Every transaction row in the Transaction tab has individual `Pre PDF` and `Pre Word` download buttons, including opening and closing trades.
- The transaction-date toolbar has individual `Post PDF` and `Post Word` buttons for the selected trade date. If a date spans multiple preview pages, the post-trade report still includes the complete daily group.
- All report text in the generated pre/post templates is English.
- Pre-Trade `Reason` is deterministic for closing positions: positive `REALISED_PROFIT` produces a concise take-profit explanation, negative `REALISED_PROFIT` produces a concise stop-loss explanation, and zero/blank produces a neutral exposure-exit explanation. Closing reasons do not display the realised amount, quantity, or proposed price. A stable variant is selected from the Deal No., security, trade date, and transaction type so wording differs across trades without changing when the same trade is exported again.
- Pre-Trade reports use the financial terms `BUY` and `SELL` (never `sale`), display quantity as an absolute positive value, and display Proposed Price as a one-decimal range calculated from -1% to +1% around the source price without printing the percentage wording. Open-position Investment Supporting text is written in the fund portfolio manager's first-person voice as two or three natural professional sentences about the security; closing-position text uses the concise deterministic wording described above. Neither repeats quantity or proposed price. Open-stock facts are evidence-locked: client-supplied context is discarded, each server-built fact carries a `filingDate` or `asOfDate` no later than the day before the trade date, Gemini can only select a supplied evidence ID, and the backend composes the final reason from that exact statement. Invalid, future-dated, or invented evidence is ignored. When no eligible evidence is available, the backend writes a general company/sector thesis and relevant risk factors instead of displaying an evidence failure disclaimer or inventing an event, metric, or catalyst. The API does not expose data-provider or JSON field names in the report.
- Opening futures use deterministic `Directional Long` wording for BUY OPEN and `Directional Short` wording for SELL OPEN; they are never described as hedges unless a separate future strategy-purpose control is introduced later. Excel `STYPE_DESCRIPTION` is retained and takes priority during asset classification, so a futures row does not fall back to stock wording when Gemini is unavailable. Futures contract roots are parsed from the right-hand expiry suffix and resolved by exact match against the server-side registry in `futures_registry.py`. Product variants remain distinct (`MHG` Micro Copper, `HG` Copper, and `QC` E-mini Copper). Gemini cannot replace a mapped root or product name. Unknown roots fail closed and block the affected pre-trade export until a validated override is entered in Settings. Settings displays the supported registry and accepts overrides in `ROOT | Product Name | Market Exposure | Volatility Risk | Exchange` format. When pre-trade market data is available, futures reasons state whether moving-average and RSI indicators showed upward, downward, or mixed momentum using data dated no later than the day before the trade; otherwise they use the neutral directional wording. Futures reasons never repeat quantity or proposed price and do not say that exposure is obtained without changing individual holdings.

## Output Templates

The old combined daily transaction-order PDF flow has been replaced for the Transaction tab.

Pre-trade report:

- Title: `Transaction Pre-Trade Record`
- Fund Portfolio Manager / PM
- Fund Name
- Stock code
- Date
- Details:
  - Type of Transaction: normalized to `BUY` or `SELL`
  - Proposed Price
  - Proposed Quantity
- Investment Supporting:
  - Opening-trade `Reason` generated through the server-side Gemini API; closing-trade `Reason` uses deterministic take-profit, stop-loss, or neutral wording
- Signed By PM
- Confirmation statement
- Checked By

Post-trade report:

- Title: `Transaction Post-Trade Record`
- Fund Name
- Dealing Account
- Trade Date
- Checked statement: `The complete daily transaction record has been attached.`
- Signed By Trader
- Checked statement that no executed trade breached the trading instruction
- Confirmed By PM
- Five-item checked Conclusion checklist
- Editable RO Comments field
- Approved By RO

## Important Instruction For New Sessions

Do not change the core app system unless the user explicitly asks for it.

Core system means:

- Excel / CSV parsing and transaction field mapping.
- Multiple-file upload and merge behavior.
- Fund/dealing account inference from filename.
- Grouping by `Trade Date`.
- Pre-trade one file per transaction, named from its deal number.
- Post-trade one report per trade date.
- ZIP generation.
- Existing VPS route `/RO_transaction/`.
- Existing API proxy route `/RO_transaction/api/`.

When adding new functions, prefer adding isolated UI controls or helper functions around the current flow. Avoid changing routes, upload contracts, generated filename conventions, or API key handling unless the user clearly requests that.

## Local Environment

Project path:

```text
C:\Users\aaron\Documents\license9\nav
```

Main files:

- `index.html` - app shell and UI.
- `styles.css` - styling.
- `app.js` - Excel parsing, preview table, PDF/DOCX generation, ZIP generation.
- `vendor/xlsx.full.min.js` - Excel parser.
- `vendor/jspdf.umd.min.js` - PDF generator.
- `vendor/jspdf.plugin.autotable.min.js` - PDF table renderer.
- `api_server.py` - server-side Gemini/FMP API.
- `requirements-api.txt` - Python dependencies for the API.

This is a static browser app. There is no build step and no package manager currently required.

API keys must stay server-side. Do not put API keys in front-end JavaScript.

Local development server:

```powershell
python -m http.server 8787
```

Local URL:

```text
http://127.0.0.1:8787/
```

Useful checks:

```powershell
node --check app.js
python -m py_compile api_server.py
git status --short
```

## Server API

Existing public proxy root:

```text
/RO_transaction/api/
```

Relevant endpoints:

- `/RO_transaction/api/health`
- `/RO_transaction/api/classify-transactions`
- `/RO_transaction/api/futures-products`
- `/RO_transaction/api/strategy-report`
- `/RO_transaction/api/pretrade-reasons`

`/pretrade-reasons` uses `GEMINI_API_KEY` from the server env and returns English pre-trade support text. The frontend calls this endpoint in batches before building PDF or Word ZIP files. If Gemini fails, the browser uses neutral fallback reason text so the export can still complete.

The stock strategy report feature still exists in the Strategy Report tab. It is separate from the new Transaction tab pre/post output.

## GitHub

Repository:

```text
https://github.com/aaronckyau/RO_trade_file-.git
```

Branch:

```text
main
```

Only stage files that were intentionally changed.

Standard commit flow:

```powershell
git status --short
git add index.html app.js styles.css HANDOVER.md api_server.py
git commit -m "<clear commit message>"
git push
```

## VPS / Production

Production URL:

```text
https://www.4mstrategy.com/RO_transaction/
```

VPS app directory:

```text
/RO_transaction
```

SSH host:

```text
root@www.4mstrategy.com
```

SSH key path on this Windows host:

```text
C:\Users\aaron\.ssh\codex_contabo_ed25519
```

Known hosts file used in previous deploys:

```text
C:\tmp\ro_transaction_known_hosts
```

Deploy command pattern:

```powershell
$sshKey='C:\Users\aaron\.ssh\codex_contabo_ed25519'
$knownHosts='C:\tmp\ro_transaction_known_hosts'
$remote='root@www.4mstrategy.com'
$remoteDir='/RO_transaction'
scp -i $sshKey -o StrictHostKeyChecking=accept-new -o UserKnownHostsFile=$knownHosts index.html app.js styles.css HANDOVER.md api_server.py requirements-api.txt ${remote}:${remoteDir}/
ssh -i $sshKey -o StrictHostKeyChecking=accept-new -o UserKnownHostsFile=$knownHosts $remote "systemctl restart ro-transaction-api && systemctl is-active ro-transaction-api"
```

Before every production deployment, increment the visible version in `index.html` using `vYYYY.MM.DD.N`, where `N` starts at `1` each day and increments for additional deployments on the same date. Use the matching compact value in the `app.js?v=` and `styles.css?v=` cache keys. Report the deployed version to the user after verification.

Server-side API secrets are stored outside the web root:

```text
/etc/ro-transaction.env
```

This file should be root-readable only and should contain `FMP_API_KEY` and `GEMINI_API_KEY`.

API service:

```text
systemd service: ro-transaction-api
local listen: http://127.0.0.1:8788
public proxy: /RO_transaction/api/
health: https://www.4mstrategy.com/RO_transaction/api/health
```

Verify deployed files:

```powershell
$sshKey='C:\Users\aaron\.ssh\codex_contabo_ed25519'
$knownHosts='C:\tmp\ro_transaction_known_hosts'
$remote='root@www.4mstrategy.com'
ssh -i $sshKey -o StrictHostKeyChecking=accept-new -o UserKnownHostsFile=$knownHosts $remote "cd /RO_transaction && ls -la && grep -n 'app.js?v=' index.html && grep -n 'styles.css?v=' index.html"
```

Verify public URL:

```powershell
curl.exe -s https://www.4mstrategy.com/RO_transaction/ | Select-String -Pattern 'app-version|app.js|styles.css'
curl.exe -s https://www.4mstrategy.com/RO_transaction/api/health
```

If `index.html` changes cache-busting query strings, verify the new versions are visible from the public URL.

## Current App Flow In app.js

Key areas:

- `parseUploadedWorkbooks()` parses multiple selected files and merges the transactions.
- `renderFileMeta()` shows uploaded filenames line by line, defaults to the first three, and provides Show more / Show less when more files are loaded.
- `inferCompanyFromFilename()` reads the fund/dealing account name from the transaction filename.
- `mapTransaction()` maps Excel columns into normalized transaction objects.
- `getTransactionGroups()` groups rows by trade date.
- `generatePdf()` creates the pre/post PDF ZIP.
- `generateWord()` creates the pre/post `.docx` ZIP.
- `generateSinglePreTradeReport()` downloads one pre-trade PDF or Word file for any transaction row.
- `generateCurrentPostTradeReport()` downloads the complete daily post-trade PDF or Word file for the selected trade date.
- `ensurePreTradeReasons()` first assigns deterministic closing-trade reasons, then calls `/RO_transaction/api/pretrade-reasons` in batches for transactions that still need a reason and stores the returned text on each transaction.
- `buildDailyPdfReportFiles()` builds one dated ZIP folder containing a `Pre_{Deal No.}.pdf` for every transaction and one post-trade PDF per trade date.
- `drawProfessionalPreTradePage()` draws the new pre-trade template.
- `drawProfessionalPostTradeReport()` draws the new post-trade template.
- `buildDailyWordReportFiles()` builds the matching dated folder structure with one `Pre_{Deal No.}.docx` per transaction and one daily post-trade `.docx`.
- `drawCjkCellText()` renders table cells containing Chinese as canvas images before inserting them into jsPDF.
- `reserveCjkCellHeight()` measures wrapped height for multi-line Chinese descriptions.
- `addSignatureImage()` preserves uploaded signature aspect ratio and centers the image inside the available signature box.
- `createZipBlob()` creates the ZIP in-browser without adding dependencies.
- Strategy Report tab calls `/RO_transaction/api/strategy-report` for open stock / equity positions and downloads the returned PDF.
- Strategy report market and company data must be available before the trade date. The API uses a cutoff of one calendar day before the trade date, then falls back to the latest available trading day before the trade date if needed.

## Development Notes

- Keep the app static unless the user specifically requests a backend change.
- Do not add dependencies unless necessary.
- Prefer existing `jsPDF`, `autoTable`, and `xlsx` utilities.
- Word output uses generated `.docx` OpenXML packages without adding a frontend dependency.
- Be careful with browser cache. Update the `app.js?v=...` and `styles.css?v=...` query strings in `index.html` after changing those files.
- The project has some previous Traditional Chinese UI strings. Do not mass-rewrite UI text unless requested.
- Generated report body text should be English for the new pre/post templates.
- PDF body text is mostly English because jsPDF default fonts handle English reliably.
- Do not upload sample Excel files, generated PDFs, or private transaction outputs to GitHub or the VPS unless the user explicitly asks.
- Do not print secrets or private VPS config contents in chat.

## Recommended Workflow For Future Changes

1. Inspect relevant files first.
2. Make the smallest focused change.
3. Run:

```powershell
node --check app.js
python -m py_compile api_server.py
git diff --stat
```

4. Commit and push when requested.
5. Deploy to VPS when requested.
6. Verify public URL after deployment.
7. Final response should include:
   - Summary of changes.
   - Files changed.
   - Checks run.
   - Deploy result if deployment was requested.
   - Git commit hash if committed.
