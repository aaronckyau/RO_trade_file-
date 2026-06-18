const TRANSACTIONS_PER_PAGE = 20;

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
  page: 1,
  executedSignature: "",
  roSignature: "",
  defaultChecklistChecked: true
};

const els = {
  mainPage: document.getElementById("mainPage"),
  settingsPage: document.getElementById("settingsPage"),
  settingsBtn: document.getElementById("settingsBtn"),
  backMainBtn: document.getElementById("backMainBtn"),
  saveSettingsBtn: document.getElementById("saveSettingsBtn"),
  excelInput: document.getElementById("excelInput"),
  fileMeta: document.getElementById("fileMeta"),
  companyInput: document.getElementById("companyInput"),
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
  prevPageBtn: document.getElementById("prevPageBtn"),
  nextPageBtn: document.getElementById("nextPageBtn"),
  pageSelect: document.getElementById("pageSelect"),
  statusText: document.getElementById("statusText"),
  settingsStatus: document.getElementById("settingsStatus"),
  table: document.getElementById("transactionTable"),
  thead: document.querySelector("#transactionTable thead"),
  tbody: document.querySelector("#transactionTable tbody")
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
  els.defaultChecklistCheckedInput.addEventListener("change", () => {
    state.defaultChecklistChecked = els.defaultChecklistCheckedInput.checked;
  });
  els.prevPageBtn.addEventListener("click", () => setPage(state.page - 1));
  els.nextPageBtn.addEventListener("click", () => setPage(state.page + 1));
  els.pageSelect.addEventListener("change", (event) => setPage(Number(event.target.value)));
  els.executedSigInput.addEventListener("change", (event) => loadSignature(event, "executedSignature", els.executedSigPreview));
  els.roSigInput.addEventListener("change", (event) => loadSignature(event, "roSignature", els.roSigPreview));

  renderBlankState();
}

function showPage(page) {
  const isSettings = page === "settings";
  els.mainPage.classList.toggle("hidden", isSettings);
  els.settingsPage.classList.toggle("hidden", !isSettings);
}

async function onExcelUpload(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const buffer = await file.arrayBuffer();
  parseWorkbook(buffer, file.name);
}

function parseWorkbook(buffer, filename) {
  try {
    const workbook = XLSX.read(buffer, { type: "array", cellDates: false });
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });
    if (!rows.length) throw new Error("這份 workbook 沒有任何資料列。");

    const headers = rows[0].map((value) => String(value || "").trim());
    const dataRows = rows.slice(1).filter((row) => row.some((cell) => String(cell ?? "").trim() !== ""));
    const transactions = dataRows.map((row) => mapTransaction(headers, row));

    state.transactions = transactions;
    state.sourceFile = filename;
    state.page = 1;
    updateSummary();
    renderPager();
    renderTable();
    els.downloadPdfBtn.disabled = !transactions.length;
    setStatus(`已從 ${filename} 載入 ${transactions.length} 筆交易。產生 PDF 前可以直接修改表格內容。`);
  } catch (error) {
    state.transactions = [];
    state.sourceFile = "";
    updateSummary();
    renderBlankState();
    els.downloadPdfBtn.disabled = true;
    setStatus(error.message, true);
  }
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
  const map = {
    BO: "BUY OPEN",
    BC: "BUY CLOSE",
    SH: "SELL",
    SS: "SHORT SELL"
  };
  return map[code] || cleanText(value);
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
  els.fileMeta.textContent = state.sourceFile ? `已載入：${state.sourceFile}` : "尚未載入檔案。";
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
}

function renderTable() {
  if (!state.transactions.length) {
    renderBlankState();
    return;
  }

  const pageInfo = getTransactionPages()[state.page - 1];
  const rows = pageInfo ? pageInfo.rows : [];

  els.thead.innerHTML = `<tr>${FIELDS.map((field) => `<th>${field.label}</th>`).join("")}</tr>`;
  els.tbody.innerHTML = rows.map(({ transaction, index }) => {
    return `<tr>${FIELDS.map((field) => renderCell(transaction, field, index)).join("")}</tr>`;
  }).join("");

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

function renderCell(transaction, field, sourceIndex) {
  const value = transaction[field.key] ?? "";
  const negative = isNegative(value) ? " negative" : "";
  const numeric = field.numeric ? " numeric" : "";
  return `<td class="${numeric}${negative}" contenteditable="true" data-index="${sourceIndex}" data-key="${field.key}">${escapeHtml(value)}</td>`;
}

function onCellEdit(event) {
  const cell = event.currentTarget;
  const index = Number(cell.dataset.index);
  const key = cell.dataset.key;
  state.transactions[index][key] = cell.textContent.trim();
  renderPager();
  renderTable();
  setStatus("表格已更新。PDF 會使用修改後的數值。");
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

function generatePdf() {
  if (!state.transactions.length) {
    setStatus("目前沒有可匯出的交易資料。", true);
    return;
  }

  const { jsPDF } = window.jspdf;
  const transactionGroups = getTransactionGroups();
  const company = els.companyInput.value.trim() || "Transaction Order";
  const source = state.sourceFile || "Uploaded Excel";
  const zipFiles = transactionGroups.map((group) => {
    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    const dayPages = getPagesForTransactionGroup(group);
    const pages = dayPages.length;

    drawPreTradeCompliancePage(doc, { company, tradeDate: group.tradeDate });

    dayPages.forEach((pageInfo, index) => {
      const page = index + 1;
      doc.addPage("a4", "landscape");
      const chunk = pageInfo.rows.map(({ transaction }) => transaction);
      drawPdfPage(doc, { company, source, page, pages, tradeDate: pageInfo.tradeDate, chunk });
    });

    doc.addPage("a4", "landscape");
    drawPostTradeCompliancePage(doc, { company, tradeDate: group.tradeDate });

    return {
      name: buildPdfFilename(company, group.tradeDate),
      data: new Uint8Array(doc.output("arraybuffer"))
    };
  });

  const zipName = `${sanitizeFilenamePart(company)}_transaction_order_pdfs.zip`;
  downloadBlob(createZipBlob(zipFiles), zipName);
  setStatus(`PDF ZIP 已產生，共 ${zipFiles.length} 個交易日期檔案。`);
}

function buildPdfFilename(company, tradeDate) {
  return `${sanitizeFilenamePart(company)}_${formatTradeDateForFilename(tradeDate)}.pdf`;
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

  return new Blob([...localParts, ...centralParts, endHeader], { type: "application/zip" });
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
    "In accordance with the Code of Conduct for Persons Licensed by or Registered with the Securities and Futures Commission, all trade orders must pass the following compliance checklist before execution. The Responsible Officer (RO) must independently review each transaction.",
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
    "Whether the trade is consistent with the investment objectives of the account / fund.",
    "Whether the trade breaches any prohibition or restriction in the fund offering documents for specific industries, such as gambling or tobacco, or regions, such as emerging markets.",
    "Whether the counterparty or issuer is a connected party of the company, and whether all required approvals have been obtained.",
    "Whether the trader considered price, cost, speed, and the quality of the execution venue.",
    "Whether the trade is on a restricted list or watch list."
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
    "Conditional approval / exception execution: a minor breach exists. Complete the Exception Explanation below and obtain approval from the Responsible Officer (RO) and Chief Compliance Officer.",
    "Rejected for execution: a material breach of investment restrictions exists and the instruction has been cancelled."
  ].forEach((item) => {
    y = drawCheckItem(doc, item, margin, y, contentWidth);
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
    "Whether the executed trade quantity, price, and limit price are consistent with the pre-trade instruction, or are within a reasonable slippage range.",
    "Where the same trade order was executed across multiple accounts as a block trade, whether the allocation was fair, such as by holding proportion or agreed method, and fully recorded.",
    "Whether any erroneous trade occurred. If yes, whether it has been recorded and handled in accordance with internal procedures."
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

  const roName = els.roNameInput.value.trim();
  const roDate = els.roDateInput.value.trim();
  const meta = [roName, roDate].filter(Boolean).join("  |  ");
  if (meta) {
    doc.setFontSize(8);
    doc.setTextColor(75, 85, 99);
    doc.text(fitPdfText(doc, meta, width - labelWidth - boxWidth - 28), boxX + boxWidth + 12, y + 13);
  }
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
      if (data.section === "body" && [8, 10].includes(data.column.index)) {
        const text = Array.isArray(data.cell.text) ? data.cell.text.join("") : String(data.cell.text || "");
        if (text.includes("(") || text.trim().startsWith("-")) {
          data.cell.styles.textColor = [220, 38, 38];
        }
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

  addSignatureImage(doc, state.executedSignature, x + labelWidth + nameWidth - 78, y + 5, 70, 28);
  addSignatureImage(doc, state.roSignature, x + labelWidth + nameWidth - 78, y + rowHeight + 5, 70, 28);

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
    doc.addImage(dataUrl, format, x, y, maxWidth, maxHeight, undefined, "FAST");
  } catch {
    // Keep PDF generation usable even if the browser rejects an uncommon image type.
  }
}

function buildPdfRows(chunk) {
  return chunk.map((transaction) => FIELDS.map((field) => transaction[field.key] ?? ""));
}

init();
