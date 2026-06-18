# RO Transaction App Handover

## Purpose

This app converts an uploaded Excel transaction sheet into RO sign-off PDF files.

Current production behavior:

- User uploads an Excel transaction file in the browser.
- The app parses the first worksheet and previews editable transaction rows.
- Transactions are grouped by `Trade Date`.
- Each trade date produces one PDF.
- If one trade date has more than 20 transactions, that PDF contains multiple transaction table pages.
- Every daily PDF includes:
  - First page: English pre-trade compliance checklist.
  - Middle pages: transaction order record table, max 20 transactions per page.
  - Last page: English post-trade compliance checklist and RO signature confirmation.
- All daily PDFs are downloaded together as one ZIP file.
- PDF filename format:
  - `Fund_Entity_Name_DDMMYYYY.pdf`
  - Example: `X_Squared_Capital_Management_LPF_12012026.pdf`

## Important Instruction For New Sessions

Do not change the core app system unless the user explicitly asks for it.

Core system means:

- Excel parsing and transaction field mapping.
- Grouping by `Trade Date`.
- One PDF per trade date.
- 20 transactions per table page.
- ZIP generation and daily PDF filename logic.
- Existing PDF compliance page structure.
- Existing VPS route `/RO_transaction/`.
- Existing API proxy route `/RO_transaction/api/`.

When adding new functions, prefer adding isolated UI controls or helper functions around the current flow. Avoid rewriting the app, changing routes, changing file names, changing the upload contract, or replacing the PDF/ZIP generation approach unless the user clearly requests that.

## Local Environment

Project path:

```text
C:\Users\aaron\Documents\license9\nav
```

Main files:

- `index.html` - app shell and UI.
- `styles.css` - styling.
- `app.js` - Excel parsing, preview table, PDF generation, ZIP generation.
- `vendor/xlsx.full.min.js` - Excel parser.
- `vendor/jspdf.umd.min.js` - PDF generator.
- `vendor/jspdf.plugin.autotable.min.js` - PDF table renderer.
- `api_server.py` - server-side Gemini/FMP strategy report API.
- `requirements-api.txt` - Python dependencies for the strategy report API.

This is a static browser app. There is no build step and no package manager currently required.

The strategy report feature adds an isolated Python API for server-side key handling and PDF report generation. Do not put API keys in front-end JavaScript.

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
git status --short
```

## GitHub

Repository:

```text
https://github.com/aaronckyau/RO_trade_file-.git
```

Branch:

```text
main
```

Current known latest commit when this handover was written:

```text
c36b2d3 Add compliance checklist pages to PDFs
```

The user requested that future changes should be committed, pushed, and deployed every time unless they explicitly say otherwise.

Standard commit flow:

```powershell
git status --short
git add app.js index.html styles.css README.md HANDOVER.md
git commit -m "<clear commit message>"
git push
```

Only stage files that were intentionally changed.

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
scp -i $sshKey -o StrictHostKeyChecking=accept-new -o UserKnownHostsFile=$knownHosts index.html app.js styles.css ${remote}:${remoteDir}/
```

If `api_server.py` or `requirements-api.txt` changes, also deploy them and restart the API:

```powershell
scp -i $sshKey -o StrictHostKeyChecking=accept-new -o UserKnownHostsFile=$knownHosts api_server.py requirements-api.txt ${remote}:${remoteDir}/
ssh -i $sshKey -o StrictHostKeyChecking=accept-new -o UserKnownHostsFile=$knownHosts $remote "systemctl restart ro-transaction-api && systemctl is-active ro-transaction-api"
```

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
ssh -i $sshKey -o StrictHostKeyChecking=accept-new -o UserKnownHostsFile=$knownHosts $remote "cd /RO_transaction && ls -la && grep -n 'app.js?v=' index.html"
```

Verify public URL:

```powershell
curl.exe -s https://www.4mstrategy.com/RO_transaction/ | Select-String -Pattern 'app.js'
curl.exe -s https://www.4mstrategy.com/RO_transaction/api/health
```

If `index.html` changes the app.js cache-busting query string, verify the new version is visible from the public URL.

## Current App Flow In app.js

Key areas:

- Upload supports selecting multiple Excel / CSV files at once. `parseUploadedWorkbooks()` parses each selected file and merges the transactions into one working set.
- `parseWorkbook()` reads the first worksheet from one selected workbook.
- `mapTransaction()` maps Excel columns into normalized transaction objects.
- `getTransactionGroups()` groups rows by trade date.
- `getPagesForTransactionGroup()` splits one day into pages of 20 rows.
- `generatePdf()` creates one PDF per trade date and downloads a ZIP.
- `drawPreTradeCompliancePage()` draws the first page of each PDF.
- `drawPdfPage()` draws the transaction order record table pages.
- `drawPostTradeCompliancePage()` draws the last page of each PDF.
- `createZipBlob()` creates the ZIP in-browser without adding dependencies.
- `buildPdfFilename()` creates the daily PDF filename.
- Strategy Report tab calls `/RO_transaction/api/strategy-report` for open stock / equity positions and downloads the returned PDF.
- The stock strategy report template is not used for futures or options. Those rows should show `N/A` until a separate template is added.
- Strategy report market and company data must be available before the trade date. The API uses a cutoff of one calendar day before the trade date, then falls back to the latest available trading day before the trade date if needed.
- Strategy report Details of Proposal excludes Deal No. and displays transaction type as `BUY` or `SELL` only.

## Current PDF Structure

For each trade date:

1. First page: `Fund Transaction Compliance Report`
   - Trade Date
   - Fund Name
   - Part I: Pre-Trade Compliance Check
   - Authorization and investment restriction checklist
   - Pre-trade check decision

2. Middle pages: `Transaction Order Record`
   - Fund / entity name heading
   - Executed by and RO Review signature block
   - Notes
   - Transaction table
   - No date is shown in the signature block beside Executed by or RO Review

3. Last page:
   - Part III: Post-Trade Compliance Check
   - Signature Confirmation
   - Responsible Officer (RO) signature line

## Development Notes

- Keep the app static unless the user specifically requests a backend.
- Do not add dependencies unless necessary.
- Prefer existing `jsPDF`, `autoTable`, and `xlsx` utilities.
- Be careful with browser cache. Update the `app.js?v=...` query string in `index.html` after changing `app.js`.
- The project has some previous Traditional Chinese UI strings. Do not mass-rewrite UI text unless requested.
- PDF body text is mostly English because jsPDF default fonts handle English reliably.
- Do not upload sample Excel files, generated PDFs, or private transaction outputs to GitHub or the VPS unless the user explicitly asks.
- Do not print secrets or private VPS config contents in chat.

## Recommended Workflow For Future Changes

1. Inspect relevant files first.
2. Make the smallest focused change.
3. Run:

```powershell
node --check app.js
git diff --stat
```

4. Deploy to VPS.
5. Verify public URL.
6. Commit and push.
7. Final response should include:
   - Summary of changes.
   - Files changed.
   - Checks run.
   - Deploy result.
   - Git commit hash.
