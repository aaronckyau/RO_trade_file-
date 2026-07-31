const TRANSACTIONS_PER_PAGE = 20;
const PRE_TRADE_REASON_BATCH_SIZE = 40;

const TYPE_LABELS = {
  BO: "Buy to Open",
  SS: "Sell to Open",
  SH: "Sell to Close",
  BC: "Buy to Close"
};

const TYPE_SORT_ORDER = {
  "Buy to Open": 1,
  "Sell to Open": 2,
  "Sell to Close": 3,
  "Buy to Close": 4,
  "BUY TO OPEN": 1,
  "SELL TO OPEN": 2,
  "SELL TO CLOSE": 3,
  "BUY TO CLOSE": 4,
  "BUY OPEN": 1,
  "SHORT SELL": 2,
  SELL: 3,
  "BUY CLOSE": 4
};

const CJK_PATTERN = /[\u3400-\u9fff\uf900-\ufaff]/;
const PDF_CJK_FONT_SCALE = 1.35;
const PDF_CJK_LINE_HEIGHT_SCALE = 1.2;
const PDF_CJK_EXTRA_VERTICAL_PADDING = 4;
const PDF_COLUMN_WIDTHS = {
  0: 50,
  1: 50,
  2: 56,
  3: 82,
  4: 116,
  5: 44,
  6: 58,
  7: 28,
  8: 66,
  9: 42,
  10: 56,
  11: 88,
  12: 60
};

const FIELDS = [
  { key: "tradeDate", label: "交易日期", pdf: "Trade Date" },
  { key: "settleDate", label: "交收日期", pdf: "Settle Date" },
  { key: "type", label: "類型", pdf: "Type" },
  { key: "security", label: "證券", pdf: "Security" },
  { key: "description", label: "描述", pdf: "Description" },
  { key: "qty", label: "數量", pdf: "Qty", numeric: true },
  { key: "price", label: "價格", pdf: "Price", numeric: true },
  { key: "ccy", label: "幣別", pdf: "Ccy" },
  { key: "gross", label: "交易總額", pdf: "Gross Amount", numeric: true },
  { key: "comm", label: "佣金", pdf: "Comm.", numeric: true },
  { key: "realised", label: "已實現盈虧", pdf: "Realised P/L", numeric: true },
  { key: "counterpart", label: "交易對手", pdf: "Counterpart" },
  { key: "deal", label: "交易編號", pdf: "Deal No.", numeric: true }
];

const state = {
  transactions: [],
  sourceFile: "",
  sourceFiles: [],
  sourceFilesExpanded: false,
  page: 1,
  pmSignature: "",
  checkedBySignature: "",
  executedSignature: "",
  roSignature: "",
  defaultChecklistChecked: true,
  activeMainTab: "transaction",
  transactionTypeSort: "none",
  strategyTypeSort: "none"
};

const els = {
  mainPage: document.getElementById("mainPage"),
  settingsPage: document.getElementById("settingsPage"),
  settingsBtn: document.getElementById("settingsBtn"),
  backMainBtn: document.getElementById("backMainBtn"),
  saveSettingsBtn: document.getElementById("saveSettingsBtn"),
  excelInput: document.getElementById("excelInput"),
  fileMeta: document.getElementById("fileMeta"),
  mainTabButtons: document.querySelectorAll("[data-main-tab]"),
  transactionPanel: document.getElementById("transactionPanel"),
  strategyPanel: document.getElementById("strategyPanel"),
  companyInput: document.getElementById("companyInput"),
  pmNameInput: document.getElementById("pmNameInput"),
  pmSigInput: document.getElementById("pmSigInput"),
  pmSigPreview: document.getElementById("pmSigPreview"),
  checkedByNameInput: document.getElementById("checkedByNameInput"),
  checkedBySigInput: document.getElementById("checkedBySigInput"),
  checkedBySigPreview: document.getElementById("checkedBySigPreview"),
  executedNameInput: document.getElementById("executedNameInput"),
  executedDateInput: document.getElementById("executedDateInput"),
  executedSigInput: document.getElementById("executedSigInput"),
  executedSigPreview: document.getElementById("executedSigPreview"),
  roNameInput: document.getElementById("roNameInput"),
  roDateInput: document.getElementById("roDateInput"),
  roSigInput: document.getElementById("roSigInput"),
  roSigPreview: document.getElementById("roSigPreview"),
  defaultChecklistCheckedInput: document.getElementById("defaultChecklistCheckedInput"),
  notesInput: document.getElementById("notesInput"),
  rowCount: document.getElementById("rowCount"),
  pageCount: document.getElementById("pageCount"),
  downloadPdfBtn: document.getElementById("downloadPdfBtn"),
  downloadWordBtn: document.getElementById("downloadWordBtn"),
  prevPageBtn: document.getElementById("prevPageBtn"),
  nextPageBtn: document.getElementById("nextPageBtn"),
  pageSelect: document.getElementById("pageSelect"),
  statusText: document.getElementById("statusText"),
  strategyStatusText: document.getElementById("strategyStatusText"),
  generateAllReportsBtn: document.getElementById("generateAllReportsBtn"),
  settingsStatus: document.getElementById("settingsStatus"),
  table: document.getElementById("transactionTable"),
  thead: document.querySelector("#transactionTable thead"),
  tbody: document.querySelector("#transactionTable tbody"),
  strategyThead: document.querySelector("#strategyTable thead"),
  strategyTbody: document.querySelector("#strategyTable tbody")
};

function init() {
  els.settingsBtn.addEventListener("click", () => showPage("settings"));
  els.backMainBtn.addEventListener("click", () => showPage("main"));
  els.saveSettingsBtn.addEventListener("click", () => {
    els.settingsStatus.textContent = "設定已儲存，會套用到下一次 PDF 匯出。";
    showPage("main");
  });
  els.excelInput.addEventListener("change", onExcelUpload);
  els.downloadPdfBtn.addEventListener("click", generatePdf);
  els.downloadWordBtn.addEventListener("click", generateWord);
  els.generateAllReportsBtn.addEventListener("click", generateAllReports);
  els.mainTabButtons.forEach((button) => {
    button.addEventListener("click", () => setMainTab(button.dataset.mainTab));
  });
  els.defaultChecklistCheckedInput.addEventListener("change", () => {
    state.defaultChecklistChecked = els.defaultChecklistCheckedInput.checked;
  });
  els.prevPageBtn.addEventListener("click", () => setPage(state.page - 1));
  els.nextPageBtn.addEventListener("click", () => setPage(state.page + 1));
  els.pageSelect.addEventListener("change", (event) => setPage(Number(event.target.value)));
  els.pmSigInput.addEventListener("change", (event) => loadSignature(event, "pmSignature", els.pmSigPreview));
  els.checkedBySigInput.addEventListener("change", (event) => loadSignature(event, "checkedBySignature", els.checkedBySigPreview));
  els.executedSigInput.addEventListener("change", (event) => loadSignature(event, "executedSignature", els.executedSigPreview));
  els.roSigInput.addEventListener("change", (event) => loadSignature(event, "roSignature", els.roSigPreview));

  renderBlankState();
  renderMainTabs();
}

function showPage(page) {
  const isSettings = page === "settings";
  els.mainPage.classList.toggle("hidden", isSettings);
  els.settingsPage.classList.toggle("hidden", !isSettings);
}

function setMainTab(tab) {
  state.activeMainTab = tab === "strategy" ? "strategy" : "transaction";
  renderMainTabs();
}

function renderMainTabs() {
  els.mainTabButtons.forEach((button) => {
    const selected = button.dataset.mainTab === state.activeMainTab;
    button.classList.toggle("is-active", selected);
    button.setAttribute("aria-selected", String(selected));
  });
  els.transactionPanel.classList.toggle("hidden", state.activeMainTab !== "transaction");
  els.strategyPanel.classList.toggle("hidden", state.activeMainTab !== "strategy");
}

async function onExcelUpload(event) {
  const files = Array.from(event.target.files || []);
  if (!files.length) return;
  await parseUploadedWorkbooks(files);
}

async function parseUploadedWorkbooks(files) {
  try {
    const parsedFiles = [];
    for (const file of files) {
      const buffer = await file.arrayBuffer();
      parsedFiles.push(parseWorkbook(buffer, file.name));
    }
    const transactions = parsedFiles.flatMap((parsed) => parsed.transactions);
    if (!transactions.length) throw new Error("已選擇的 workbook 沒有任何交易資料列。");
    const companyNames = [...new Set(parsedFiles.map((parsed) => parsed.inferredCompany).filter(Boolean))];
    if (companyNames.length > 1) {
      throw new Error(`多個檔案的基金 / 實體名稱不同：${companyNames.join("、")}。請分開處理。`);
    }
    const sourceFiles = parsedFiles.map((parsed) => parsed.filename);

    state.transactions = transactions;
    state.sourceFile = formatSourceFiles(sourceFiles);
    state.sourceFiles = sourceFiles;
    state.sourceFilesExpanded = false;
    state.page = 1;
    if (companyNames.length === 1) {
      els.companyInput.value = companyNames[0];
    }
    updateSummary();
    renderPager();
    renderTable();
    renderStrategyTable();
    els.downloadPdfBtn.disabled = !transactions.length;
    els.downloadWordBtn.disabled = !transactions.length;
    setStatus(`已從 ${sourceFiles.length} 個檔案載入 ${transactions.length} 筆交易。產生 report 前可以直接修改表格內容。`);
    classifyTransactions();
  } catch (error) {
    state.transactions = [];
    state.sourceFile = "";
    state.sourceFiles = [];
    state.sourceFilesExpanded = false;
    updateSummary();
    renderBlankState();
    renderStrategyBlankState();
    els.downloadPdfBtn.disabled = true;
    els.downloadWordBtn.disabled = true;
    setStatus(error.message, true);
  }
}

function parseWorkbook(buffer, filename) {
  const workbook = XLSX.read(buffer, { type: "array", cellDates: false });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) throw new Error(`${filename} 沒有 worksheet。`);
  const worksheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });
  if (!rows.length) throw new Error(`${filename} 沒有任何資料列。`);

  const headers = rows[0].map((value) => String(value || "").trim());
  const dataRows = rows.slice(1).filter((row) => row.some((cell) => String(cell ?? "").trim() !== ""));
  return {
    filename,
    inferredCompany: inferCompanyFromFilename(filename),
    transactions: dataRows.map((row) => mapTransaction(headers, row))
  };
}

function formatSourceFiles(filenames) {
  if (filenames.length <= 3) return filenames.join(", ");
  return `${filenames.slice(0, 3).join(", ")} 等 ${filenames.length} 個檔案`;
}

function renderFileMeta() {
  if (!state.sourceFiles.length) {
    els.fileMeta.textContent = "尚未載入檔案。";
    return;
  }

  const visibleFiles = state.sourceFilesExpanded ? state.sourceFiles : state.sourceFiles.slice(0, 3);
  const hiddenCount = state.sourceFiles.length - visibleFiles.length;
  const fileItems = visibleFiles
    .map((filename) => `<li>${escapeHtml(filename)}</li>`)
    .join("");
  const toggle = hiddenCount > 0 || state.sourceFilesExpanded
    ? `<button class="file-meta-toggle" type="button" data-file-meta-toggle>${state.sourceFilesExpanded ? "Show less" : `Show more (${hiddenCount})`}</button>`
    : "";

  els.fileMeta.innerHTML = `
    <div>已載入：</div>
    <ol class="file-meta-list">
      ${fileItems}
    </ol>
    ${toggle}
  `;

  const toggleButton = els.fileMeta.querySelector("[data-file-meta-toggle]");
  if (toggleButton) {
    toggleButton.addEventListener("click", () => {
      state.sourceFilesExpanded = !state.sourceFilesExpanded;
      renderFileMeta();
    });
  }
}

function inferCompanyFromFilename(filename) {
  const name = String(filename || "").replace(/\.[^.]+$/, "").trim();
  const match = name.match(/^(.+?)\s+-\s+Securities transactions(?:\s+-|$)/i);
  return match ? match[1].trim() : "";
}

function mapTransaction(headers, row) {
  const get = (...names) => {
    for (const name of names) {
      const index = headers.findIndex((header) => normalizeHeader(header) === normalizeHeader(name));
      if (index >= 0) return row[index];
    }
    return "";
  };

  const tradeTypeRaw = cleanText(get("TRADE_TYPE", "TYPE", "Trade Type"));
  return {
    tradeDate: formatExcelDate(get("TRADE_DATE", "Trade Date")),
    settleDate: formatExcelDate(get("SETTLEMENT_DATE", "Settlement Date", "Settle Date")),
    type: mapTradeType(tradeTypeRaw),
    security: cleanText(get("SNAME", "Security", "Security Code", "Ticker")),
    description: cleanText(get("sec_description", "description", "Description")),
    qty: formatNumber(get("TSNUMBER", "Quantity", "Qty")),
    price: formatNumber(get("PRICE", "Price")),
    ccy: cleanText(get("CURRENCY_CODE", "Currency", "Ccy")),
    gross: formatNumber(get("GROSS_AMOUNT", "Gross Amount")),
    comm: formatNumber(get("COMMISSION", "Commission", "Comm.")),
    realised: formatNumber(get("REALISED_PROFIT", "Realised P/L", "Realised Profit")),
    counterpart: cleanText(get("counterpart", "Broker", "Counterpart")),
    deal: cleanText(get("DEAL_NUMBER", "Deal No.", "Deal Number"))
  };
}

function normalizeHeader(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function cleanText(value) {
  return String(value ?? "").trim();
}

function mapTradeType(value) {
  const code = cleanText(value).toUpperCase();
  return TYPE_LABELS[code] || cleanText(value);
}

function formatExcelDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const utc = Math.round((value - 25569) * 86400 * 1000);
    return new Date(utc).toISOString().slice(0, 10);
  }
  const text = cleanText(value);
  if (!text) return "";
  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return text;
}

function formatNumber(value) {
  if (value === "" || value === null || value === undefined) return "";
  if (typeof value === "number" && Number.isFinite(value)) return trimNumber(value);
  const text = cleanText(value).replace(/,/g, "");
  const number = Number(text);
  if (Number.isFinite(number)) return trimNumber(number);
  return cleanText(value);
}

function trimNumber(number) {
  return Number(number.toFixed(8)).toLocaleString("en-US", {
    maximumFractionDigits: 8,
    useGrouping: false
  });
}

function updateSummary() {
  const pages = getPageCount();
  els.rowCount.textContent = state.transactions.length;
  els.pageCount.textContent = pages;
  renderFileMeta();
}

function getTransactionGroups() {
  const groups = [];
  const byDate = new Map();

  state.transactions.forEach((transaction, index) => {
    const tradeDate = transaction.tradeDate || "No date";
    if (!byDate.has(tradeDate)) {
      const group = { tradeDate, rows: [] };
      byDate.set(tradeDate, group);
      groups.push(group);
    }
    byDate.get(tradeDate).rows.push({ transaction, index });
  });

  return groups;
}

function getPagesForTransactionGroup(group) {
  const totalParts = Math.ceil(group.rows.length / TRANSACTIONS_PER_PAGE);
  const pages = [];
  for (let offset = 0; offset < group.rows.length; offset += TRANSACTIONS_PER_PAGE) {
    pages.push({
      tradeDate: group.tradeDate,
      part: Math.floor(offset / TRANSACTIONS_PER_PAGE) + 1,
      totalParts,
      rows: group.rows.slice(offset, offset + TRANSACTIONS_PER_PAGE)
    });
  }
  return pages;
}

function getTransactionPages() {
  return getTransactionGroups().flatMap(getPagesForTransactionGroup);
}

function getPageCount() {
  return getTransactionPages().length || 0;
}

function renderPager() {
  const transactionPages = getTransactionPages();
  const pages = transactionPages.length;
  els.pageSelect.innerHTML = "";
  transactionPages.forEach((pageInfo, index) => {
    const page = index + 1;
    const option = document.createElement("option");
    option.value = String(page);
    const partLabel = pageInfo.totalParts > 1 ? ` (${pageInfo.part}/${pageInfo.totalParts})` : "";
    option.textContent = `第 ${page} 頁：${pageInfo.tradeDate}${partLabel}`;
    els.pageSelect.appendChild(option);
  });
  els.pageSelect.disabled = pages === 0;
  els.prevPageBtn.disabled = state.page <= 1 || pages === 0;
  els.nextPageBtn.disabled = state.page >= pages || pages === 0;
  if (pages > 0) els.pageSelect.value = String(state.page);
}

function setPage(page) {
  const pages = getPageCount();
  state.page = Math.max(1, Math.min(page, pages));
  renderPager();
  renderTable();
}

function renderBlankState() {
  els.thead.innerHTML = "";
  els.tbody.innerHTML = `<tr><td class="blank-state" colspan="${FIELDS.length}">請上傳 Excel，或載入範例 Excel，以預覽交易指令表。</td></tr>`;
  renderPager();
  renderStrategyBlankState();
}

function renderTable() {
  if (!state.transactions.length) {
    renderBlankState();
    return;
  }

  const pageInfo = getTransactionPages()[state.page - 1];
  const rows = pageInfo ? sortRowsByType(pageInfo.rows, state.transactionTypeSort) : [];

  els.thead.innerHTML = `<tr>${FIELDS.map((field) => renderHeaderCell(field, "transaction")).join("")}</tr>`;
  els.tbody.innerHTML = rows.map(({ transaction, index }) => {
    return `<tr>${FIELDS.map((field) => renderCell(transaction, field, index)).join("")}</tr>`;
  }).join("");
  bindSortButtons(els.thead);

  els.tbody.querySelectorAll("td[contenteditable='true']").forEach((cell) => {
    cell.addEventListener("blur", onCellEdit);
    cell.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        cell.blur();
      }
    });
  });
}

function renderStrategyBlankState() {
  els.strategyThead.innerHTML = "";
  els.strategyTbody.innerHTML = `<tr><td class="blank-state" colspan="${FIELDS.length + 2}">請先上傳 Excel 檔案，以建立 strategy report 清單。</td></tr>`;
  refreshGenerateAllButton();
}

function renderStrategyTable() {
  if (!state.transactions.length) {
    renderStrategyBlankState();
    return;
  }

  const rows = sortRowsByType(
    state.transactions.map((transaction, index) => ({ transaction, index })),
    state.strategyTypeSort
  );

  els.strategyThead.innerHTML = `<tr><th>Report</th><th>型別</th>${FIELDS.map((field) => renderHeaderCell(field, "strategy")).join("")}</tr>`;
  els.strategyTbody.innerHTML = rows.map(({ transaction, index }) => {
    return `<tr>${renderStrategyActionCell(transaction, index)}${renderKindCell(transaction, index)}${FIELDS.map((field) => renderReadOnlyCell(transaction, field)).join("")}</tr>`;
  }).join("");
  bindSortButtons(els.strategyThead);
  bindStrategyReportButtons();
  bindKindSelects();
  refreshGenerateAllButton();
}

function renderKindCell(transaction, sourceIndex) {
  const current = resolvedKind(transaction) || "";
  const options = [
    { value: "", label: "不支援" },
    { value: "stock", label: "股票" },
    { value: "option", label: "期權" },
    { value: "future", label: "期貨" }
  ];
  const select = options.map((opt) =>
    `<option value="${opt.value}"${opt.value === current ? " selected" : ""}>${opt.label}</option>`
  ).join("");
  return `<td><select class="kind-select" data-kind-index="${sourceIndex}">${select}</select></td>`;
}

function bindKindSelects() {
  els.strategyTbody.querySelectorAll("[data-kind-index]").forEach((select) => {
    select.addEventListener("change", () => {
      const index = Number(select.dataset.kindIndex);
      const transaction = state.transactions[index];
      if (!transaction) return;
      transaction.kind = select.value || "unsupported";
      renderStrategyTable();
    });
  });
}

function renderHeaderCell(field, tableName) {
  if (field.key !== "type") return `<th>${field.label}</th>`;
  const direction = tableName === "strategy" ? state.strategyTypeSort : state.transactionTypeSort;
  const suffix = direction === "asc" ? " ▲" : direction === "desc" ? " ▼" : "";
  return `<th><button class="sort-header" type="button" data-sort-table="${tableName}" data-sort-key="type">${field.label}${suffix}</button></th>`;
}

function bindSortButtons(container) {
  container.querySelectorAll("[data-sort-key='type']").forEach((button) => {
    button.addEventListener("click", () => cycleTypeSort(button.dataset.sortTable));
  });
}

function cycleTypeSort(tableName) {
  const key = tableName === "strategy" ? "strategyTypeSort" : "transactionTypeSort";
  state[key] = state[key] === "none" ? "asc" : state[key] === "asc" ? "desc" : "none";
  renderTable();
  renderStrategyTable();
}

function sortRowsByType(rows, direction) {
  if (direction === "none") return rows;
  const multiplier = direction === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const typeDiff = (getTypeRank(a.transaction.type) - getTypeRank(b.transaction.type)) * multiplier;
    if (typeDiff !== 0) return typeDiff;
    return String(a.transaction.security || "").localeCompare(String(b.transaction.security || ""));
  });
}

function getTypeRank(value) {
  return TYPE_SORT_ORDER[cleanText(value).toUpperCase()] || TYPE_SORT_ORDER[cleanText(value)] || 99;
}

function renderCell(transaction, field, sourceIndex) {
  const value = transaction[field.key] ?? "";
  const negative = isNegative(value) ? " negative" : "";
  const numeric = field.numeric ? " numeric" : "";
  return `<td class="${numeric}${negative}" contenteditable="true" data-index="${sourceIndex}" data-key="${field.key}">${escapeHtml(value)}</td>`;
}

function renderReadOnlyCell(transaction, field) {
  const value = transaction[field.key] ?? "";
  const negative = isNegative(value) ? " negative" : "";
  const numeric = field.numeric ? " numeric" : "";
  return `<td class="${numeric}${negative}">${escapeHtml(value)}</td>`;
}

function renderStrategyActionCell(transaction, sourceIndex) {
  if (!canGenerateStrategyReport(transaction)) {
    return `<td><span class="muted-label">N/A</span></td>`;
  }
  return `<td><button class="small-action-btn" type="button" data-report-index="${sourceIndex}">生成 PDF</button></td>`;
}

function bindStrategyReportButtons() {
  els.strategyTbody.querySelectorAll("[data-report-index]").forEach((button) => {
    button.addEventListener("click", () => generateStrategyReport(Number(button.dataset.reportIndex), button));
  });
}

function isOpenPosition(transaction) {
  const type = cleanText(transaction.type).toLowerCase();
  return ["bo", "buy open", "buy to open", "ss", "short sell", "sell open", "sell to open"].includes(type);
}

function securityKind(transaction) {
  const security = ` ${cleanText(transaction.security).toLowerCase()} `;
  if (security.includes(" curncy") || security.includes(" index") || security.includes(" cmdty")) {
    return null;
  }
  if (security.includes(" future") || security.includes(" futures")) {
    return "future";
  }
  if (security.includes(" option") || security.includes(" call ") || security.includes(" put ")) {
    return "option";
  }
  if (security.includes(" equity")) {
    return "stock";
  }
  return null;
}

function resolvedKind(transaction) {
  if (["stock", "option", "future"].includes(transaction.kind)) {
    return transaction.kind;
  }
  return securityKind(transaction);
}

function canGenerateStrategyReport(transaction) {
  return isOpenPosition(transaction) && resolvedKind(transaction) === "stock";
}

async function classifyTransactions() {
  const items = state.transactions.map((t) => ({ security: t.security, description: t.description }));
  if (!items.length) return;
  setStrategyStatus("正在用 AI 判斷證券型別與標的...");
  try {
    const response = await fetch(getClassifyApiUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transactions: items })
    });
    if (!response.ok) throw new Error("classify failed");
    const data = await response.json();
    (data.results || []).forEach((row) => {
      const transaction = state.transactions[row.index];
      if (!transaction) return;
      transaction.kind = row.kind;
      transaction.underlyingSymbol = row.underlyingSymbol || "";
    });
    renderStrategyTable();
    setStrategyStatus("已完成型別判斷。可在「型別」欄手動修正。");
  } catch {
    // Keep rule-based fallback; do not block the user.
    setStrategyStatus("AI 型別判斷未完成，改用代號規則判斷。可在「型別」欄手動修正。", true);
  }
}

function getClassifyApiUrl() {
  return window.location.pathname.startsWith("/RO_transaction/")
    ? "/RO_transaction/api/classify-transactions"
    : "/api/classify-transactions";
}

async function fetchReportBlob(transaction) {
  const response = await fetch(getStrategyReportApiUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transaction, kind: resolvedKind(transaction), underlyingSymbol: transaction.underlyingSymbol || "" })
  });
  if (!response.ok) {
    let message = "Strategy report generation failed.";
    try {
      const error = await response.json();
      message = error.error || message;
    } catch {
      // Keep the generic message if the server did not return JSON.
    }
    throw new Error(message);
  }
  const blob = await response.blob();
  return { blob, filename: getDownloadFilename(response, transaction) };
}

async function generateStrategyReport(index, button) {
  const transaction = state.transactions[index];
  if (!transaction || !canGenerateStrategyReport(transaction)) return;

  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = "生成中...";
  setStrategyStatus(`正在生成 ${transaction.security} strategy report...`);

  try {
    const { blob, filename } = await fetchReportBlob(transaction);
    downloadBlob(blob, filename);
    setStrategyStatus(`${transaction.security} strategy report PDF 已生成。`);
  } catch (error) {
    setStrategyStatus(error.message, true);
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
}

function eligibleStrategyTransactions() {
  return state.transactions
    .map((transaction, index) => ({ transaction, index }))
    .filter(({ transaction }) => canGenerateStrategyReport(transaction));
}

async function generateAllReports() {
  const eligible = eligibleStrategyTransactions();
  if (!eligible.length) return;

  const button = els.generateAllReportsBtn;
  button.disabled = true;
  const originalText = button.textContent;
  button.textContent = "生成中...";

  const files = [];
  const usedNames = new Set();
  let failed = 0;
  for (let i = 0; i < eligible.length; i += 1) {
    const { transaction } = eligible[i];
    setStrategyStatus(`正在生成第 ${i + 1} / ${eligible.length} 份報告：${transaction.security}...`);
    try {
      const { blob, filename } = await fetchReportBlob(transaction);
      let name = filename;
      let suffix = 2;
      while (usedNames.has(name)) {
        name = filename.replace(/\.pdf$/i, `_${suffix}.pdf`);
        suffix += 1;
      }
      usedNames.add(name);
      files.push({ name, data: new Uint8Array(await blob.arrayBuffer()) });
    } catch {
      failed += 1;
    }
  }

  if (files.length) {
    const zipBlob = createZipBlob(files);
    const company = sanitizeFilenamePart(els.companyInput.value || "strategy");
    downloadBlob(zipBlob, `${company}_strategy_reports.zip`);
    const failNote = failed ? `，${failed} 份失敗` : "";
    setStrategyStatus(`已產生 ${files.length} 份報告並打包為 ZIP${failNote}。`, failed > 0);
  } else {
    setStrategyStatus("沒有任何報告成功生成。", true);
  }

  button.disabled = false;
  button.textContent = originalText;
  refreshGenerateAllButton();
}

function refreshGenerateAllButton() {
  if (!els.generateAllReportsBtn) return;
  els.generateAllReportsBtn.disabled = eligibleStrategyTransactions().length === 0;
}

function getStrategyReportApiUrl() {
  return window.location.pathname.startsWith("/RO_transaction/")
    ? "/RO_transaction/api/strategy-report"
    : "/api/strategy-report";
}

function getDownloadFilename(response, transaction) {
  const disposition = response.headers.get("Content-Disposition") || "";
  const match = disposition.match(/filename="?([^"]+)"?/i);
  if (match) return match[1];
  return `${sanitizeFilenamePart(transaction.security || "strategy")}_${formatTradeDateForFilename(transaction.tradeDate)}_strategy_report.pdf`;
}

function setStrategyStatus(message, isError = false) {
  els.strategyStatusText.textContent = message;
  els.strategyStatusText.style.color = isError ? "#b91c1c" : "";
}

function onCellEdit(event) {
  const cell = event.currentTarget;
  const index = Number(cell.dataset.index);
  const key = cell.dataset.key;
  state.transactions[index][key] = cell.textContent.trim();
  renderPager();
  renderTable();
  renderStrategyTable();
  setStatus("表格已更新。Report 會使用修改後的數值。");
}

function isNegative(value) {
  const number = Number(String(value).replace(/[(),]/g, "").replace(/-/g, "-"));
  return String(value).includes("(") || number < 0;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function loadSignature(event, stateKey, preview) {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    state[stateKey] = String(reader.result);
    preview.src = state[stateKey];
    preview.classList.add("has-image");
  };
  reader.readAsDataURL(file);
}

function setStatus(message, isError = false) {
  els.statusText.textContent = message;
  els.statusText.style.color = isError ? "#b91c1c" : "";
}

async function generatePdf() {
  if (!state.transactions.length) {
    setStatus("目前沒有可匯出的交易資料。", true);
    return;
  }

  const originalText = els.downloadPdfBtn.textContent;
  els.downloadPdfBtn.disabled = true;
  els.downloadWordBtn.disabled = true;
  els.downloadPdfBtn.textContent = "生成中...";
  try {
    await ensurePreTradeReasons();
    const files = buildDailyPdfReportFiles();
    const company = getConfiguredFundName();
    downloadBlob(createZipBlob(files), `${sanitizeFilenamePart(company)}_daily_pre_post_trade_reports_pdf.zip`);
    setStatus(`PDF ZIP 已產生，共 ${files.length} 個 pre/post trade report 檔案。`);
  } catch (error) {
    setStatus(error.message || "PDF report generation failed.", true);
  } finally {
    els.downloadPdfBtn.textContent = originalText;
    els.downloadPdfBtn.disabled = !state.transactions.length;
    els.downloadWordBtn.disabled = !state.transactions.length;
  }
}

async function generateWord() {
  if (!state.transactions.length) {
    setStatus("目前沒有可匯出的交易資料。", true);
    return;
  }

  const originalText = els.downloadWordBtn.textContent;
  els.downloadPdfBtn.disabled = true;
  els.downloadWordBtn.disabled = true;
  els.downloadWordBtn.textContent = "生成中...";
  try {
    await ensurePreTradeReasons();
    const files = buildDailyWordReportFiles();
    const company = getConfiguredFundName();
    downloadBlob(createZipBlob(files), `${sanitizeFilenamePart(company)}_daily_pre_post_trade_reports_word.zip`);
    setStatus(`Word ZIP 已產生，共 ${files.length} 個 pre/post trade report 檔案。`);
  } catch (error) {
    setStatus(error.message || "Word report generation failed.", true);
  } finally {
    els.downloadWordBtn.textContent = originalText;
    els.downloadPdfBtn.disabled = !state.transactions.length;
    els.downloadWordBtn.disabled = !state.transactions.length;
  }
}

function buildDailyPdfReportFiles() {
  const { jsPDF } = window.jspdf;
  const transactionGroups = getTransactionGroups();
  const company = getConfiguredFundName();
  return transactionGroups.flatMap((group) => {
    const preDoc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
    group.rows.forEach(({ transaction }, index) => {
      if (index > 0) preDoc.addPage("a4", "portrait");
      drawProfessionalPreTradePage(preDoc, { company, tradeDate: group.tradeDate, transaction });
    });

    const postDoc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    drawProfessionalPostTradeReport(postDoc, { company, tradeDate: group.tradeDate, rows: group.rows });

    return [
      {
        name: buildDailyReportFilename(company, group.tradeDate, "Pre-Trade", "pdf"),
        data: new Uint8Array(preDoc.output("arraybuffer"))
      },
      {
        name: buildDailyReportFilename(company, group.tradeDate, "Post-Trade", "pdf"),
        data: new Uint8Array(postDoc.output("arraybuffer"))
      }
    ];
  });
}

function buildPdfFilename(company, tradeDate) {
  return `${sanitizeFilenamePart(company)}_${formatTradeDateForFilename(tradeDate)}.pdf`;
}

function buildDailyReportFilename(company, tradeDate, label, extension) {
  return `${sanitizeFilenamePart(company)}_${formatTradeDateForFilename(tradeDate)}_${label}_Record.${extension}`;
}

function getConfiguredFundName() {
  return els.companyInput.value.trim() || "Transaction Order";
}

async function ensurePreTradeReasons() {
  const missing = state.transactions
    .map((transaction, index) => ({ transaction, index }))
    .filter(({ transaction }) => !cleanText(transaction.reason));
  if (!missing.length) return;

  setStatus(`正在用 Gemini 生成 ${missing.length} 筆 pre-trade reason...`);
  try {
    for (let start = 0; start < missing.length; start += PRE_TRADE_REASON_BATCH_SIZE) {
      const batch = missing.slice(start, start + PRE_TRADE_REASON_BATCH_SIZE);
      const response = await fetch(getPreTradeReasonsApiUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transactions: batch.map(({ transaction, index }) => ({
            index,
            tradeDate: transaction.tradeDate,
            type: transaction.type,
            security: transaction.security,
            description: transaction.description,
            qty: transaction.qty,
            price: transaction.price,
            ccy: transaction.ccy,
            gross: transaction.gross,
            counterpart: transaction.counterpart,
            kind: resolvedKind(transaction) || "unsupported"
          }))
        })
      });
      if (!response.ok) throw new Error("reason generation failed");
      const data = await response.json();
      (data.results || []).forEach((row) => {
        const transaction = state.transactions[row.index];
        if (transaction && row.reason) {
          transaction.reason = cleanText(row.reason);
        }
      });
    }
  } catch {
    missing.forEach(({ transaction }) => {
      transaction.reason = fallbackPreTradeReason(transaction);
    });
    setStatus("Gemini reason generation failed; fallback reason text was used.", true);
  }
}

function getPreTradeReasonsApiUrl() {
  return window.location.pathname.startsWith("/RO_transaction/")
    ? "/RO_transaction/api/pretrade-reasons"
    : "/api/pretrade-reasons";
}

function fallbackPreTradeReason(transaction) {
  const action = normalizeReportTradeType(transaction.type);
  const security = transaction.security || "the security";
  const price = formatMoney(transaction.price, transaction.ccy);
  const quantity = transaction.qty || "the proposed quantity";
  return `The proposed ${action} transaction in ${security} is recorded for pre-trade review based on the submitted order details, including proposed price ${price} and quantity ${quantity}. The portfolio manager should confirm that the transaction is consistent with the fund mandate, investment restrictions, and execution requirements before the order is released.`;
}

function drawProfessionalPreTradePage(doc, context) {
  const margin = 42;
  const width = doc.internal.pageSize.getWidth() - margin * 2;
  const transaction = context.transaction;
  let y = drawProfessionalTitle(doc, "Transaction Pre-Trade Record", margin, 36, width);

  y = drawPdfKeyValueGrid(doc, [
    ["Fund Portfolio Manager:", els.pmNameInput.value.trim()],
    ["Fund Name:", context.company],
    ["Stock code:", transaction.security || ""],
    ["Date:", formatDisplayTradeDate(context.tradeDate)]
  ], margin, y + 12, width, { columns: 2 });

  y = drawPdfSectionBand(doc, "Details", margin, y + 14, width);
  y = drawPdfKeyValueGrid(doc, [
    ["Type of Transaction:", normalizeReportTradeType(transaction.type)],
    ["Proposed Price:", formatMoney(transaction.price, transaction.ccy)],
    ["Proposed Quantity:", transaction.qty || ""]
  ], margin, y, width, { columns: 1 });

  y = drawPdfSectionBand(doc, "Investment Supporting", margin, y + 14, width);
  y = drawPdfReasonBox(doc, transaction.reason || fallbackPreTradeReason(transaction), margin, y, width);

  y = drawPdfSignerRow(doc, "Signed By PM:", els.pmNameInput.value.trim(), state.pmSignature, margin, y + 16, width);
  y = drawPdfStatementBox(
    doc,
    "I confirm that this investment has gone through pre-trade checks, does not exceed the fund's investment scope, does not violate any investment restrictions, and has taken climate impact into account as a risk factor.",
    margin,
    y + 10,
    width
  );
  drawPdfSignerRow(doc, "Checked By:", els.checkedByNameInput.value.trim(), state.checkedBySignature, margin, y + 16, width);
}

function drawProfessionalPostTradeReport(doc, context) {
  const margin = 28;
  const width = doc.internal.pageSize.getWidth() - margin * 2;
  let y = drawProfessionalTitle(doc, "Transaction Post-Trade Record", margin, 26, width);

  y = drawPdfKeyValueGrid(doc, [
    ["Fund Name:", context.company],
    ["Dealing Account:", context.company],
    ["Trade Date:", formatDisplayTradeDate(context.tradeDate)]
  ], margin, y + 10, width, { columns: 1, rowHeight: 22 });

  y = drawPdfSectionBand(doc, "Transaction records are fully displayed in the attached schedule.", margin, y + 12, width);
  const body = context.rows.map(({ transaction }) => FIELDS.map((field) => transaction[field.key] ?? ""));
  doc.autoTable({
    startY: y + 8,
    head: [FIELDS.map((field) => field.pdf)],
    body,
    margin: { left: margin, right: margin },
    tableWidth: width,
    theme: "grid",
    styles: {
      font: "helvetica",
      fontSize: 7,
      cellPadding: 2.4,
      lineColor: [207, 213, 221],
      lineWidth: 0.5,
      overflow: "linebreak",
      valign: "middle"
    },
    headStyles: {
      fillColor: [31, 41, 55],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      halign: "center"
    },
    columnStyles: {
      0: { cellWidth: 50 },
      1: { cellWidth: 50 },
      2: { cellWidth: 56 },
      3: { cellWidth: 82 },
      4: { cellWidth: 116 },
      5: { cellWidth: 44, halign: "right" },
      6: { cellWidth: 58, halign: "right" },
      7: { cellWidth: 28 },
      8: { cellWidth: 66, halign: "right" },
      9: { cellWidth: 42, halign: "right" },
      10: { cellWidth: 56, halign: "right" },
      11: { cellWidth: 88 },
      12: { cellWidth: 60, halign: "right" }
    },
    didParseCell(data) {
      if (data.section === "body" && containsCjk(data.cell.raw)) {
        reserveCjkCellHeight(data);
        data.cell.text = [""];
      }
      if (data.section === "body" && [8, 10].includes(data.column.index)) {
        const text = Array.isArray(data.cell.text) ? data.cell.text.join("") : String(data.cell.text || "");
        if (text.includes("(") || text.trim().startsWith("-")) {
          data.cell.styles.textColor = [220, 38, 38];
        }
      }
    },
    didDrawCell(data) {
      if (data.section === "body" && containsCjk(data.cell.raw)) {
        drawCjkCellText(doc, String(data.cell.raw ?? ""), data.cell, data.cell.styles);
      }
    }
  });

  y = Math.min((doc.lastAutoTable?.finalY || 320) + 18, doc.internal.pageSize.getHeight() - 128);
  y = drawPdfSignerRow(doc, "Signed By Trader:", els.executedNameInput.value.trim(), state.executedSignature, margin, y, width);
  y = drawPdfStatementBox(doc, "No executed trade in the transaction record has breached the trading instruction.", margin, y + 8, width);
  y = drawPdfSignerRow(doc, "Confirmed By PM:", els.pmNameInput.value.trim(), state.pmSignature, margin, y + 10, width);
  y = drawPdfSectionBand(doc, "Conclusion:", margin, y + 10, width);
  y = drawPdfBullets(doc, [
    "No connected-party transactions were identified.",
    "All trades were executed fairly and on the best available terms.",
    "Any conflicts of interest have been disclosed to investors where applicable.",
    "Executed trades are within the fund's investment scope.",
    "No cross trades were identified."
  ], margin, y + 8, width);
  drawPdfSignerRow(doc, "Approved By RO:", els.roNameInput.value.trim(), state.roSignature, margin, y + 10, width);
}

function drawProfessionalTitle(doc, title, x, y, width) {
  doc.setFillColor(31, 41, 55);
  doc.rect(x, y, width, 32, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text(title, x + width / 2, y + 21, { align: "center" });
  doc.setTextColor(17, 24, 39);
  return y + 38;
}

function drawPdfSectionBand(doc, text, x, y, width) {
  doc.setFillColor(229, 231, 235);
  doc.setDrawColor(154, 164, 178);
  doc.rect(x, y, width, 22, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(17, 24, 39);
  doc.text(text, x + 8, y + 15);
  return y + 22;
}

function drawPdfKeyValueGrid(doc, rows, x, y, width, options = {}) {
  const columns = options.columns || 1;
  const rowHeight = options.rowHeight || 28;
  const labelWidth = columns === 2 ? 130 : 150;
  const colWidth = width / columns;
  doc.setFontSize(9.5);
  rows.forEach((row, index) => {
    const rowIndex = Math.floor(index / columns);
    const colIndex = index % columns;
    const cellX = x + colIndex * colWidth;
    const cellY = y + rowIndex * rowHeight;
    doc.setDrawColor(154, 164, 178);
    doc.rect(cellX, cellY, colWidth, rowHeight);
    doc.setFillColor(243, 244, 246);
    doc.rect(cellX, cellY, labelWidth, rowHeight, "F");
    doc.setFont("helvetica", "bold");
    doc.text(row[0], cellX + 6, cellY + 18);
    doc.setFont("helvetica", "normal");
    doc.text(fitPdfText(doc, row[1] || "", colWidth - labelWidth - 12), cellX + labelWidth + 6, cellY + 18);
  });
  return y + Math.ceil(rows.length / columns) * rowHeight;
}

function drawPdfReasonBox(doc, reason, x, y, width) {
  const lines = doc.splitTextToSize(reason, width - 20);
  const height = Math.max(90, lines.length * 13 + 24);
  doc.setDrawColor(154, 164, 178);
  doc.rect(x, y, width, height);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Reason:", x + 8, y + 18);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.text(lines, x + 8, y + 36);
  return y + height;
}

function drawPdfSignerRow(doc, label, name, signature, x, y, width) {
  const rowHeight = 44;
  const labelWidth = 130;
  const nameWidth = 180;
  doc.setDrawColor(154, 164, 178);
  doc.rect(x, y, width, rowHeight);
  doc.line(x + labelWidth, y, x + labelWidth, y + rowHeight);
  doc.line(x + labelWidth + nameWidth, y, x + labelWidth + nameWidth, y + rowHeight);
  doc.setFillColor(243, 244, 246);
  doc.rect(x, y, labelWidth, rowHeight, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.text(label, x + 6, y + 26);
  doc.setFont("helvetica", "normal");
  doc.text(name || "", x + labelWidth + 6, y + 26);
  addSignatureImage(doc, signature, x + labelWidth + nameWidth + 10, y + 6, width - labelWidth - nameWidth - 20, rowHeight - 12);
  return y + rowHeight;
}

function drawPdfStatementBox(doc, text, x, y, width) {
  const lines = doc.splitTextToSize(text, width - 18);
  const height = Math.max(38, lines.length * 13 + 18);
  doc.setDrawColor(154, 164, 178);
  doc.rect(x, y, width, height);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.text(lines, x + 8, y + 18);
  return y + height;
}

function drawPdfBullets(doc, items, x, y, width) {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.3);
  items.forEach((item) => {
    const lines = doc.splitTextToSize(item, width - 26);
    doc.text("-", x + 8, y);
    doc.text(lines, x + 20, y);
    y += Math.max(14, lines.length * 12);
  });
  return y;
}

function buildDailyWordReportFiles() {
  const company = getConfiguredFundName();
  return getTransactionGroups().flatMap((group) => {
    return [
      {
        name: buildDailyReportFilename(company, group.tradeDate, "Pre-Trade", "docx"),
        data: buildPreTradeDocxBytes({ company, tradeDate: group.tradeDate, rows: group.rows })
      },
      {
        name: buildDailyReportFilename(company, group.tradeDate, "Post-Trade", "docx"),
        data: buildPostTradeDocxBytes({ company, tradeDate: group.tradeDate, rows: group.rows })
      }
    ];
  });
}

function buildPreTradeDocxBytes(context) {
  const docx = { images: [] };
  const pages = context.rows.map(({ transaction }) => [
    docxTitle("Transaction Pre-Trade Record"),
    docxKeyValueTable([
      ["Fund Portfolio Manager:", els.pmNameInput.value.trim()],
      ["Fund Name:", context.company],
      ["Stock code:", transaction.security || ""],
      ["Date:", formatDisplayTradeDate(context.tradeDate)]
    ], 10460),
    docxSectionBand("Details"),
    docxKeyValueTable([
      ["Type of Transaction:", normalizeReportTradeType(transaction.type)],
      ["Proposed Price:", formatMoney(transaction.price, transaction.ccy)],
      ["Proposed Quantity:", transaction.qty || ""]
    ], 10460),
    docxSectionBand("Investment Supporting"),
    docxTable([[{ text: `Reason:\n${transaction.reason || fallbackPreTradeReason(transaction)}`, boldFirstLine: true }]], [10460]),
    docxSignerTable("Signed By PM:", els.pmNameInput.value.trim(), state.pmSignature, docx, 10460),
    docxTable([["I confirm that this investment has gone through pre-trade checks, does not exceed the fund's investment scope, does not violate any investment restrictions, and has taken climate impact into account as a risk factor."]], [10460]),
    docxSignerTable("Checked By:", els.checkedByNameInput.value.trim(), state.checkedBySignature, docx, 10460)
  ].join("")).join(docxPageBreak());

  return createDocxPackage(docxDocumentXml(pages, { landscape: false }), docx.images);
}

function buildPostTradeDocxBytes(context) {
  const docx = { images: [] };
  const rows = [
    FIELDS.map((field) => ({ text: field.pdf, fill: "1F2937", color: "FFFFFF", bold: true, align: "center", size: 14 })),
    ...context.rows.map(({ transaction }) => FIELDS.map((field) => ({
      text: transaction[field.key] ?? "",
      size: 13,
      align: field.numeric ? "right" : "left",
      color: field.numeric && isNegative(transaction[field.key]) ? "DC2626" : "111827"
    })))
  ];
  const body = [
    docxTitle("Transaction Post-Trade Record"),
    docxKeyValueTable([
      ["Fund Name:", context.company],
      ["Dealing Account:", context.company],
      ["Trade Date:", formatDisplayTradeDate(context.tradeDate)]
    ], 15398),
    docxSectionBand("Transaction records are fully displayed in the attached schedule."),
    docxTable(rows, [900, 900, 1050, 1500, 2600, 900, 1100, 650, 1300, 800, 1100, 1700, 898]),
    docxSignerTable("Signed By Trader:", els.executedNameInput.value.trim(), state.executedSignature, docx, 15398),
    docxTable([["No executed trade in the transaction record has breached the trading instruction."]], [15398]),
    docxSignerTable("Confirmed By PM:", els.pmNameInput.value.trim(), state.pmSignature, docx, 15398),
    docxSectionBand("Conclusion:"),
    docxBulletList([
      "No connected-party transactions were identified.",
      "All trades were executed fairly and on the best available terms.",
      "Any conflicts of interest have been disclosed to investors where applicable.",
      "Executed trades are within the fund's investment scope.",
      "No cross trades were identified."
    ]),
    docxSignerTable("Approved By RO:", els.roNameInput.value.trim(), state.roSignature, docx, 15398)
  ].join("");

  return createDocxPackage(docxDocumentXml(body, { landscape: true }), docx.images);
}

function docxDocumentXml(body, options) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>${body}${docxSectionProperties(options)}</w:body></w:document>`;
}

function docxSectionProperties(options = {}) {
  const landscape = Boolean(options.landscape);
  const width = landscape ? 16838 : 11906;
  const height = landscape ? 11906 : 16838;
  return `<w:sectPr><w:pgSz w:w="${width}" w:h="${height}"${landscape ? ' w:orient="landscape"' : ""}/><w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720" w:header="360" w:footer="360" w:gutter="0"/></w:sectPr>`;
}

function docxTitle(text) {
  return docxParagraph(text, { align: "center", bold: true, size: 32, color: "FFFFFF", fill: "1F2937", after: 180 });
}

function docxSectionBand(text) {
  return docxParagraph(text, { bold: true, size: 20, fill: "E5E7EB", before: 160, after: 80 });
}

function docxKeyValueTable(rows, totalWidth) {
  return docxTable(rows.map(([label, value]) => [
    { text: label, fill: "F3F4F6", bold: true },
    { text: value || "" }
  ]), [Math.round(totalWidth * 0.28), Math.round(totalWidth * 0.72)]);
}

function docxSignerTable(label, name, signature, context, totalWidth) {
  const labelWidth = Math.round(totalWidth * 0.22);
  const nameWidth = Math.round(totalWidth * 0.28);
  const signatureWidth = totalWidth - labelWidth - nameWidth;
  return docxTable([[
    { text: label, fill: "F3F4F6", bold: true },
    { text: name || "" },
    { raw: docxImageParagraph(signature, context) }
  ]], [labelWidth, nameWidth, signatureWidth]);
}

function docxBulletList(items) {
  return items.map((item) => docxParagraph(`- ${item}`, { indent: 360, hanging: 180 })).join("");
}

function docxPageBreak() {
  return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
}

function docxTable(rows, widths) {
  const grid = widths.map((width) => `<w:gridCol w:w="${width}"/>`).join("");
  const body = rows.map((row) => `<w:tr>${row.map((cell, index) => docxCell(cell, widths[index] || widths[0])).join("")}</w:tr>`).join("");
  return `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders><w:top w:val="single" w:sz="6" w:color="9AA4B2"/><w:left w:val="single" w:sz="6" w:color="9AA4B2"/><w:bottom w:val="single" w:sz="6" w:color="9AA4B2"/><w:right w:val="single" w:sz="6" w:color="9AA4B2"/><w:insideH w:val="single" w:sz="6" w:color="9AA4B2"/><w:insideV w:val="single" w:sz="6" w:color="9AA4B2"/></w:tblBorders><w:tblCellMar><w:top w:w="90" w:type="dxa"/><w:left w:w="90" w:type="dxa"/><w:bottom w:w="90" w:type="dxa"/><w:right w:w="90" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${grid}</w:tblGrid>${body}</w:tbl>`;
}

function docxCell(cell, width) {
  const data = typeof cell === "object" && cell !== null ? cell : { text: cell };
  const fill = data.fill ? `<w:shd w:fill="${data.fill}"/>` : "";
  const content = data.raw !== undefined ? (data.raw || docxParagraph("")) : docxParagraph(data.text || "", data);
  return `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/><w:vAlign w:val="center"/>${fill}</w:tcPr>${content}</w:tc>`;
}

function docxParagraph(text, options = {}) {
  const props = [
    options.align ? `<w:jc w:val="${options.align}"/>` : "",
    options.fill ? `<w:shd w:fill="${options.fill}"/>` : "",
    options.before || options.after ? `<w:spacing w:before="${options.before || 0}" w:after="${options.after || 0}"/>` : "",
    options.indent || options.hanging ? `<w:ind w:left="${options.indent || 0}" w:hanging="${options.hanging || 0}"/>` : ""
  ].join("");
  const lines = String(text ?? "").split(/\r?\n/);
  const runs = lines.map((line, index) => {
    const runProps = docxRunProperties({ ...options, bold: options.bold || (options.boldFirstLine && index === 0) });
    return `<w:r>${runProps}${index ? "<w:br/>" : ""}<w:t xml:space="preserve">${xmlEscape(line)}</w:t></w:r>`;
  }).join("");
  return `<w:p>${props ? `<w:pPr>${props}</w:pPr>` : ""}${runs}</w:p>`;
}

function docxRunProperties(options = {}) {
  const bold = options.bold ? "<w:b/>" : "";
  const size = options.size ? `<w:sz w:val="${options.size}"/>` : '<w:sz w:val="18"/>';
  const color = options.color ? `<w:color w:val="${options.color}"/>` : "";
  return `<w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Microsoft JhengHei"/>${bold}${size}${color}</w:rPr>`;
}

function docxImageParagraph(dataUrl, context) {
  const image = parseSignatureImage(dataUrl);
  if (!image) return docxParagraph("");
  const imageIndex = context.images.length + 1;
  const relationshipId = `rId${imageIndex}`;
  const filename = `signature-${imageIndex}.${image.extension}`;
  const extent = containImageExtent(image.width, image.height, 1828800, 411480);
  context.images.push({ relationshipId, filename, data: image.bytes, contentType: image.contentType });
  return `<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${extent.cx}" cy="${extent.cy}"/><wp:docPr id="${imageIndex}" name="${xmlEscape(filename)}"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${imageIndex}" name="${xmlEscape(filename)}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${relationshipId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${extent.cx}" cy="${extent.cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
}

function parseSignatureImage(dataUrl) {
  const match = String(dataUrl || "").match(/^data:(image\/png|image\/jpe?g);base64,(.+)$/i);
  if (!match) return null;
  const contentType = match[1].toLowerCase() === "image/jpg" ? "image/jpeg" : match[1].toLowerCase();
  const binary = atob(match[2]);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  const size = getImagePixelSize(bytes, contentType);
  return {
    bytes,
    contentType,
    extension: contentType === "image/png" ? "png" : "jpg",
    width: size.width,
    height: size.height
  };
}

function getImagePixelSize(bytes, contentType) {
  if (contentType === "image/png" && bytes.length >= 24) {
    return {
      width: readUint32Be(bytes, 16) || 600,
      height: readUint32Be(bytes, 20) || 180
    };
  }
  if (contentType === "image/jpeg") {
    for (let index = 2; index < bytes.length - 9;) {
      if (bytes[index] !== 0xff) break;
      const marker = bytes[index + 1];
      const length = (bytes[index + 2] << 8) + bytes[index + 3];
      if (marker >= 0xc0 && marker <= 0xc3) {
        return {
          height: (bytes[index + 5] << 8) + bytes[index + 6],
          width: (bytes[index + 7] << 8) + bytes[index + 8]
        };
      }
      index += Math.max(length + 2, 2);
    }
  }
  return { width: 600, height: 180 };
}

function readUint32Be(bytes, offset) {
  return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
}

function containImageExtent(width, height, maxCx, maxCy) {
  const safeWidth = Math.max(1, Number(width) || 1);
  const safeHeight = Math.max(1, Number(height) || 1);
  const scale = Math.min(maxCx / safeWidth, maxCy / safeHeight);
  return {
    cx: Math.round(safeWidth * scale),
    cy: Math.round(safeHeight * scale)
  };
}

function createDocxPackage(documentXml, images) {
  const encoder = new TextEncoder();
  const files = [
    { name: "[Content_Types].xml", data: encoder.encode(docxContentTypes(images)) },
    { name: "_rels/.rels", data: encoder.encode(docxRootRels()) },
    { name: "word/document.xml", data: encoder.encode(documentXml) },
    { name: "word/_rels/document.xml.rels", data: encoder.encode(docxDocumentRels(images)) },
    ...images.map((image) => ({ name: `word/media/${image.filename}`, data: image.data }))
  ];
  return createZipBytes(files);
}

function docxContentTypes(images) {
  const defaults = new Set(images.map((image) => image.contentType === "image/png" ? '<Default Extension="png" ContentType="image/png"/>' : '<Default Extension="jpg" ContentType="image/jpeg"/>'));
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${Array.from(defaults).join("")}<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`;
}

function docxRootRels() {
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>';
}

function docxDocumentRels(images) {
  const rels = images.map((image) => `<Relationship Id="${image.relationshipId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${xmlEscape(image.filename)}"/>`).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}</Relationships>`;
}

function xmlEscape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function normalizeReportTradeType(value) {
  const text = cleanText(value);
  const lower = text.toLowerCase();
  if (lower.includes("buy")) return "BUY";
  if (lower.includes("sell") || lower === "ss" || lower === "sh") return "SELL";
  return text.toUpperCase();
}

function formatMoney(price, ccy) {
  const currency = cleanText(ccy) || "USD";
  const text = cleanText(price);
  if (!text) return currency;
  const number = Number(text.replace(/,/g, ""));
  const value = Number.isFinite(number) ? number.toFixed(4).replace(/\.?0+$/, "") : text;
  return `${currency} ${value}`;
}

function sanitizeFilenamePart(value) {
  return String(value || "")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "") || "Transaction_Order";
}

function formatTradeDateForFilename(tradeDate) {
  const value = String(tradeDate || "").trim();
  if (!value || value === "No date") return "no_date";

  const isoMatch = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return `${day.padStart(2, "0")}${month.padStart(2, "0")}${year}`;
  }

  const shortDateMatch = value.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (shortDateMatch) {
    const [, day, month, year] = shortDateMatch;
    return `${day.padStart(2, "0")}${month.padStart(2, "0")}${year}`;
  }

  return sanitizeFilenamePart(value);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function createZipBlob(files) {
  return new Blob([createZipBytes(files)], { type: "application/zip" });
}

function createZipBytes(files) {
  const localParts = [];
  const centralParts = [];
  const encoder = new TextEncoder();
  const { dosDate, dosTime } = getDosDateTime(new Date());
  let offset = 0;

  files.forEach((file) => {
    const data = file.data instanceof Uint8Array ? file.data : new Uint8Array(file.data);
    const filename = encoder.encode(file.name);
    const crc = crc32(data);

    const localHeader = new Uint8Array(30 + filename.length);
    const localView = new DataView(localHeader.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0x0800, true);
    localView.setUint16(8, 0, true);
    localView.setUint16(10, dosTime, true);
    localView.setUint16(12, dosDate, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, data.length, true);
    localView.setUint32(22, data.length, true);
    localView.setUint16(26, filename.length, true);
    localView.setUint16(28, 0, true);
    localHeader.set(filename, 30);

    const centralHeader = new Uint8Array(46 + filename.length);
    const centralView = new DataView(centralHeader.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0x0800, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, dosTime, true);
    centralView.setUint16(14, dosDate, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, data.length, true);
    centralView.setUint32(24, data.length, true);
    centralView.setUint16(28, filename.length, true);
    centralView.setUint16(30, 0, true);
    centralView.setUint16(32, 0, true);
    centralView.setUint16(34, 0, true);
    centralView.setUint16(36, 0, true);
    centralView.setUint32(38, 0, true);
    centralView.setUint32(42, offset, true);
    centralHeader.set(filename, 46);

    localParts.push(localHeader, data);
    centralParts.push(centralHeader);
    offset += localHeader.length + data.length;
  });

  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const endHeader = new Uint8Array(22);
  const endView = new DataView(endHeader.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(4, 0, true);
  endView.setUint16(6, 0, true);
  endView.setUint16(8, files.length, true);
  endView.setUint16(10, files.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, offset, true);
  endView.setUint16(20, 0, true);

  const parts = [...localParts, ...centralParts, endHeader];
  const totalLength = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(totalLength);
  let cursor = 0;
  parts.forEach((part) => {
    output.set(part, cursor);
    cursor += part.length;
  });
  return output;
}

function getDosDateTime(date) {
  const year = Math.max(1980, date.getFullYear());
  return {
    dosDate: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
    dosTime: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2)
  };
}

function crc32(data) {
  let crc = 0xffffffff;
  data.forEach((byte) => {
    crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ byte) & 0xff];
  });
  return (crc ^ 0xffffffff) >>> 0;
}

const CRC32_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function drawPreTradeCompliancePage(doc, context) {
  const margin = 48;
  const pageWidth = doc.internal.pageSize.getWidth();
  const contentWidth = pageWidth - margin * 2;
  let y = drawComplianceHeader(doc, context, "Fund Transaction Compliance Report");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(17, 24, 39);
  doc.text("Part I: Pre-Trade Compliance Check", margin, y);
  y += 20;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  y = drawWrappedText(
    doc,
    "In accordance with the Code of Conduct for Persons Licensed by or Registered with the Securities and Futures Commission, the Responsible Officer (RO) should tick each item only when the transaction fulfils the requirement and is acceptable for execution.",
    margin,
    y,
    contentWidth,
    13
  ) + 16;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.text("1. Authorization and Investment Restriction Check", margin, y);
  y += 18;

  [
    "The trade is consistent with the investment objectives of the account / fund.",
    "The trade complies with all prohibitions and restrictions in the fund offering documents, including restrictions on specific industries such as gambling or tobacco, and regions such as emerging markets.",
    "Connected-party status for the counterparty or issuer has been checked, and any required approvals have been obtained.",
    "The trader has considered price, cost, speed, and the quality of the execution venue.",
    "The trade has been checked against restricted lists and watch lists and is clear for execution."
  ].forEach((item) => {
    y = drawCheckItem(doc, item, margin, y, contentWidth, { checked: state.defaultChecklistChecked });
  });

  y += 8;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.text("2. Pre-Trade Check Decision", margin, y);
  y += 18;

  [
    "Approved for execution: all checklist items have passed.",
    "Any exception or minor issue has been documented below and approved by the Responsible Officer (RO) and Chief Compliance Officer before execution.",
    "No material breach of investment restrictions has been identified, and the instruction is cleared for execution."
  ].forEach((item) => {
    y = drawCheckItem(doc, item, margin, y, contentWidth, { checked: state.defaultChecklistChecked });
  });

  y += 10;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.text("Exception Explanation:", margin, y);
  y += 8;
  doc.setDrawColor(207, 213, 221);
  doc.rect(margin, y, contentWidth, 48);
}

function drawPostTradeCompliancePage(doc, context) {
  const margin = 48;
  const pageWidth = doc.internal.pageSize.getWidth();
  const contentWidth = pageWidth - margin * 2;
  let y = drawComplianceHeader(doc, context, "Fund Transaction Compliance Report");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(17, 24, 39);
  doc.text("Part III: Post-Trade Compliance Check", margin, y);
  y += 22;

  [
    "The executed trade quantity, price, and limit price have been checked and are consistent with the pre-trade instruction, or are within a reasonable slippage range.",
    "Where the same trade order was executed across multiple accounts as a block trade, the allocation has been checked, is fair based on holding proportion or agreed method, and is fully recorded.",
    "The trade has been checked for erroneous execution, and any erroneous trade identified has been recorded and handled in accordance with internal procedures."
  ].forEach((item) => {
    y = drawCheckItem(doc, item, margin, y, contentWidth, { checked: state.defaultChecklistChecked });
  });

  y += 24;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Signature Confirmation", margin, y);
  y += 22;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  y = drawWrappedText(
    doc,
    "I confirm that I have performed the pre-trade and post-trade checks for the above account / fund transactions on the above date in accordance with the relevant SFC guidelines and the company's internal control procedures, and that the relevant records have been retained for regulatory inspection.",
    margin,
    y,
    contentWidth,
    14
  ) + 24;

  drawRoSignatureArea(doc, margin, y, contentWidth);
}

function drawComplianceHeader(doc, context, title) {
  const margin = 48;
  const pageWidth = doc.internal.pageSize.getWidth();
  const contentWidth = pageWidth - margin * 2;

  doc.setFillColor(229, 231, 235);
  doc.rect(margin, 28, contentWidth, 34, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.setTextColor(17, 24, 39);
  doc.text(title, pageWidth / 2, 50, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Trade Date: ${formatDisplayTradeDate(context.tradeDate)}`, margin, 88);
  doc.text(`Fund Name: ${context.company}`, margin, 106);

  doc.setDrawColor(207, 213, 221);
  doc.line(margin, 120, margin + contentWidth, 120);
  return 146;
}

function drawWrappedText(doc, text, x, y, maxWidth, lineHeight) {
  const lines = doc.splitTextToSize(text, maxWidth);
  doc.text(lines, x, y);
  return y + lines.length * lineHeight;
}

function drawCheckItem(doc, text, x, y, maxWidth, options = {}) {
  const boxSize = 8;
  doc.setDrawColor(75, 85, 99);
  doc.rect(x, y - 7, boxSize, boxSize);
  if (options.checked) {
    doc.setDrawColor(17, 24, 39);
    doc.setLineWidth(1.1);
    doc.line(x + 1.5, y - 3.5, x + 3.4, y - 1.2);
    doc.line(x + 3.4, y - 1.2, x + 7, y - 7.6);
    doc.setLineWidth(0.2);
  }
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(17, 24, 39);
  const lines = doc.splitTextToSize(text, maxWidth - 20);
  doc.text(lines, x + 16, y);
  return y + Math.max(16, lines.length * 13);
}

function drawRoSignatureArea(doc, x, y, width) {
  const label = "Responsible Officer (RO) Signature:";
  const labelWidth = 172;
  const boxWidth = 260;
  const boxHeight = 56;
  const boxX = x + labelWidth + 10;
  const boxY = y - 18;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(17, 24, 39);
  doc.text(label, x, y + 13);

  doc.setDrawColor(107, 114, 128);
  doc.setFillColor(255, 255, 255);
  doc.rect(boxX, boxY, boxWidth, boxHeight, "FD");

  addSignatureImage(doc, state.roSignature, boxX + 10, boxY + 8, boxWidth - 20, boxHeight - 16);
}

function formatDisplayTradeDate(tradeDate) {
  const value = String(tradeDate || "").trim();
  return value === "No date" ? "" : value;
}

function drawPdfPage(doc, context) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;
  const fullWidth = pageWidth - margin * 2;

  doc.setFillColor(229, 231, 235);
  doc.rect(margin, 18, fullWidth, 34, "F");
  doc.setFont("helvetica", "bold");
  doc.setTextColor(17, 24, 39);
  doc.setFontSize(9);
  doc.text(fitPdfText(doc, context.company, fullWidth - 24), pageWidth / 2, 29, { align: "center" });
  doc.setFontSize(15);
  doc.text("Transaction Order Record", pageWidth / 2, 45, { align: "center" });

  drawSignatureBlock(doc, margin, 78, fullWidth);

  const body = buildPdfRows(context.chunk);
  while (body.length < TRANSACTIONS_PER_PAGE) {
    body.push(FIELDS.map(() => ""));
  }

  doc.autoTable({
    startY: 180,
    head: [FIELDS.map((field) => field.pdf)],
    body,
    margin: { left: margin, right: margin },
    tableWidth: fullWidth,
    theme: "grid",
    styles: {
      font: "helvetica",
      fontSize: 7.3,
      cellPadding: 2.2,
      lineColor: [207, 213, 221],
      lineWidth: 0.5,
      overflow: "linebreak",
      valign: "middle"
    },
    headStyles: {
      fillColor: [31, 41, 55],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      halign: "center"
    },
    columnStyles: {
      0: { cellWidth: 50 },
      1: { cellWidth: 50 },
      2: { cellWidth: 56 },
      3: { cellWidth: 82 },
      4: { cellWidth: 116 },
      5: { cellWidth: 44, halign: "right" },
      6: { cellWidth: 58, halign: "right" },
      7: { cellWidth: 28 },
      8: { cellWidth: 66, halign: "right" },
      9: { cellWidth: 42, halign: "right" },
      10: { cellWidth: 56, halign: "right" },
      11: { cellWidth: 88 },
      12: { cellWidth: 60, halign: "right" }
    },
    didParseCell(data) {
      if (data.section === "body" && containsCjk(data.cell.raw)) {
        reserveCjkCellHeight(data);
        data.cell.text = [""];
      }
      if (data.section === "body" && [8, 10].includes(data.column.index)) {
        const text = Array.isArray(data.cell.text) ? data.cell.text.join("") : String(data.cell.text || "");
        if (text.includes("(") || text.trim().startsWith("-")) {
          data.cell.styles.textColor = [220, 38, 38];
        }
      }
    },
    didDrawCell(data) {
      if (data.section === "body" && containsCjk(data.cell.raw)) {
        drawCjkCellText(doc, String(data.cell.raw ?? ""), data.cell, data.cell.styles);
      }
    }
  });

  const footerY = 535;
  doc.setFillColor(249, 250, 251);
  doc.rect(margin, footerY - 14, fullWidth, 38, "F");
  doc.setDrawColor(207, 213, 221);
  doc.rect(margin, footerY - 14, fullWidth, 38);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(17, 24, 39);
  doc.text("RO sign-off: I confirm that I have reviewed the above transaction order record and supporting details.", margin + 4, footerY + 8);
}

function containsCjk(value) {
  return CJK_PATTERN.test(String(value ?? ""));
}

function reserveCjkCellHeight(data) {
  const styles = data.cell.styles;
  const padding = getCellPadding(styles.cellPadding);
  const columnWidth = data.column.width || data.cell.width || PDF_COLUMN_WIDTHS[data.column.index] || 80;
  const usableWidth = Math.max(1, columnWidth - padding.left - padding.right);
  const metrics = getCjkTextMetrics(styles);
  const context = createCjkMeasureContext(metrics.font);
  const lineCount = context
    ? wrapCanvasText(context, String(data.cell.raw ?? ""), usableWidth).length
    : estimatePdfLineCount(String(data.cell.raw ?? ""), usableWidth, metrics.fontSize);
  styles.valign = "top";
  styles.minCellHeight = Math.max(
    Number(styles.minCellHeight || 0),
    lineCount * metrics.lineHeight + padding.top + padding.bottom + PDF_CJK_EXTRA_VERTICAL_PADDING
  );
}

function drawCjkCellText(doc, text, cell, styles) {
  const canvas = document.createElement("canvas");
  const padding = getCellPadding(styles.cellPadding);
  const width = Math.max(1, cell.width - padding.left - padding.right);
  const height = Math.max(1, cell.height - padding.top - padding.bottom);
  const scale = 3;
  canvas.width = Math.ceil(width * scale);
  canvas.height = Math.ceil(height * scale);
  const context = canvas.getContext("2d");
  if (!context) return;

  const metrics = getCjkTextMetrics(styles);
  context.scale(scale, scale);
  context.clearRect(0, 0, width, height);
  context.fillStyle = pdfColorToCss(styles.textColor, "#111827");
  context.font = metrics.font;
  context.textBaseline = "top";

  const lines = wrapCanvasText(context, text, width);
  lines.forEach((line, index) => {
    let x = 0;
    if (styles.halign === "right") {
      x = Math.max(0, width - context.measureText(line).width);
    } else if (styles.halign === "center") {
      x = Math.max(0, (width - context.measureText(line).width) / 2);
    }
    context.fillText(line, x, index * metrics.lineHeight);
  });

  doc.addImage(canvas.toDataURL("image/png"), "PNG", cell.x + padding.left, cell.y + padding.top, width, height, undefined, "FAST");
}

function getCjkTextMetrics(styles) {
  const fontSize = Number(styles.fontSize || 7.3);
  const fontPx = fontSize * PDF_CJK_FONT_SCALE;
  return {
    fontSize,
    fontPx,
    lineHeight: fontPx * PDF_CJK_LINE_HEIGHT_SCALE,
    font: `${fontPx}px "Microsoft JhengHei", "PingFang TC", "Noto Sans TC", Arial, sans-serif`
  };
}

function createCjkMeasureContext(font) {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.font = font;
  return context;
}

function estimatePdfLineCount(text, maxWidth, fontSize) {
  const approxCjkWidth = fontSize * 0.72;
  const maxUnits = Math.max(1, maxWidth / approxCjkWidth);
  let lines = 1;
  let currentUnits = 0;

  for (const char of Array.from(String(text || ""))) {
    const units = getTextUnitWidth(char);
    if (currentUnits > 0 && currentUnits + units > maxUnits) {
      lines += 1;
      currentUnits = units;
    } else {
      currentUnits += units;
    }
  }
  return lines;
}

function getTextUnitWidth(char) {
  if (CJK_PATTERN.test(char)) return 1;
  if (/\s/.test(char)) return 0.35;
  if (/[.,:;|/\\()[\]{}+\-]/.test(char)) return 0.45;
  return 0.58;
}

function getCellPadding(value) {
  if (typeof value === "number") {
    return { top: value, right: value, bottom: value, left: value };
  }
  if (value && typeof value === "object") {
    const vertical = Number(value.vertical ?? value.top ?? 0);
    const horizontal = Number(value.horizontal ?? value.right ?? 0);
    return {
      top: Number(value.top ?? vertical),
      right: Number(value.right ?? horizontal),
      bottom: Number(value.bottom ?? vertical),
      left: Number(value.left ?? horizontal)
    };
  }
  return { top: 0, right: 0, bottom: 0, left: 0 };
}

function pdfColorToCss(value, fallback) {
  if (Array.isArray(value) && value.length >= 3) {
    return `rgb(${value[0]}, ${value[1]}, ${value[2]})`;
  }
  if (typeof value === "number") {
    return `rgb(${value}, ${value}, ${value})`;
  }
  return fallback;
}

function wrapCanvasText(context, text, maxWidth) {
  const chars = Array.from(String(text || ""));
  const lines = [];
  let current = "";

  for (const char of chars) {
    const candidate = current + char;
    if (context.measureText(candidate).width <= maxWidth || !current) {
      current = candidate;
      continue;
    }
    lines.push(current);
    current = char;
  }
  if (current) {
    lines.push(current);
  }
  return lines;
}

function fitPdfText(doc, text, maxWidth) {
  const value = String(text || "").trim();
  if (!value || doc.getTextWidth(value) <= maxWidth) return value;

  let fitted = value;
  while (fitted.length > 1 && doc.getTextWidth(`${fitted}...`) > maxWidth) {
    fitted = fitted.slice(0, -1);
  }
  return `${fitted}...`;
}

function drawSignatureBlock(doc, x, y, width) {
  const leftWidth = width * 0.58;
  const notesWidth = width - leftWidth;
  const rowHeight = 38;
  const labelWidth = 76;
  const nameWidth = 190;
  const signatureSlotX = x + labelWidth + nameWidth;
  const signatureSlotWidth = leftWidth - labelWidth - nameWidth;
  const signatureMaxWidth = Math.max(80, signatureSlotWidth - 24);
  const signatureMaxHeight = rowHeight - 10;
  const signatureX = signatureSlotX + (signatureSlotWidth - signatureMaxWidth) / 2;

  doc.setDrawColor(154, 164, 178);
  doc.setLineWidth(0.7);
  doc.rect(x, y, width, rowHeight * 2);
  doc.line(x + leftWidth, y, x + leftWidth, y + rowHeight * 2);
  doc.line(x, y + rowHeight, x + leftWidth, y + rowHeight);
  doc.line(x + labelWidth, y, x + labelWidth, y + rowHeight * 2);
  doc.line(x + labelWidth + nameWidth, y, x + labelWidth + nameWidth, y + rowHeight * 2);

  doc.setFillColor(243, 244, 246);
  doc.rect(x, y, labelWidth, rowHeight, "F");
  doc.rect(x, y + rowHeight, labelWidth, rowHeight, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(17, 24, 39);
  doc.text("Executed by", x + 4, y + 23);
  doc.text("RO Review", x + 4, y + rowHeight + 23);
  doc.text("Notes", x + leftWidth + 4, y + 14);

  doc.setFont("helvetica", "normal");
  doc.text(els.executedNameInput.value.trim(), x + labelWidth + 4, y + 23);
  doc.text(els.roNameInput.value.trim(), x + labelWidth + 4, y + rowHeight + 23);

  addSignatureImage(doc, state.executedSignature, signatureX, y + 5, signatureMaxWidth, signatureMaxHeight);
  addSignatureImage(doc, state.roSignature, signatureX, y + rowHeight + 5, signatureMaxWidth, signatureMaxHeight);

  const notes = els.notesInput.value.trim();
  if (notes) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    const lines = doc.splitTextToSize(notes, notesWidth - 12).slice(0, 6);
    doc.text(lines, x + leftWidth + 6, y + 28);
  }
}

function addSignatureImage(doc, dataUrl, x, y, maxWidth, maxHeight) {
  if (!dataUrl) return;
  const format = dataUrl.includes("image/png") ? "PNG" : "JPEG";
  try {
    const props = doc.getImageProperties(dataUrl);
    const imageWidth = Number(props.width || maxWidth);
    const imageHeight = Number(props.height || maxHeight);
    const scale = Math.min(maxWidth / imageWidth, maxHeight / imageHeight);
    const drawWidth = imageWidth * scale;
    const drawHeight = imageHeight * scale;
    const drawX = x + (maxWidth - drawWidth) / 2;
    const drawY = y + (maxHeight - drawHeight) / 2;
    doc.addImage(dataUrl, format, drawX, drawY, drawWidth, drawHeight, undefined, "FAST");
  } catch {
    // Keep PDF generation usable even if the browser rejects an uncommon image type.
  }
}

function buildPdfRows(chunk) {
  return chunk.map((transaction) => FIELDS.map((field) => transaction[field.key] ?? ""));
}

init();
