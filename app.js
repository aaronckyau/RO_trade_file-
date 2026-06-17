const TRANSACTIONS_PER_PAGE = 20;

const FIELDS = [
  { key: "no", label: "序號", pdf: "No.", numeric: true },
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
  roSignature: ""
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
    const transactions = dataRows.map((row, index) => mapTransaction(headers, row, index + 1));

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

function mapTransaction(headers, row, rowNumber) {
  const get = (...names) => {
    for (const name of names) {
      const index = headers.findIndex((header) => normalizeHeader(header) === normalizeHeader(name));
      if (index >= 0) return row[index];
    }
    return "";
  };

  const tradeTypeRaw = cleanText(get("TRADE_TYPE", "TYPE", "Trade Type"));
  return {
    no: rowNumber,
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

function getPageCount() {
  return Math.ceil(state.transactions.length / TRANSACTIONS_PER_PAGE) || 0;
}

function renderPager() {
  const pages = getPageCount();
  els.pageSelect.innerHTML = "";
  for (let page = 1; page <= pages; page += 1) {
    const option = document.createElement("option");
    option.value = String(page);
    const start = (page - 1) * TRANSACTIONS_PER_PAGE + 1;
    const end = Math.min(page * TRANSACTIONS_PER_PAGE, state.transactions.length);
    option.textContent = `第 ${page} 頁：${start}-${end}`;
    els.pageSelect.appendChild(option);
  }
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

  const start = (state.page - 1) * TRANSACTIONS_PER_PAGE;
  const rows = state.transactions.slice(start, start + TRANSACTIONS_PER_PAGE);

  els.thead.innerHTML = `<tr>${FIELDS.map((field) => `<th>${field.label}</th>`).join("")}</tr>`;
  els.tbody.innerHTML = rows.map((transaction, visibleIndex) => {
    const sourceIndex = start + visibleIndex;
    return `<tr>${FIELDS.map((field) => renderCell(transaction, field, sourceIndex)).join("")}</tr>`;
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
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pages = getPageCount();
  const company = els.companyInput.value.trim() || "Transaction Order";
  const source = state.sourceFile || "Uploaded Excel";

  for (let page = 1; page <= pages; page += 1) {
    if (page > 1) doc.addPage("a4", "landscape");
    const start = (page - 1) * TRANSACTIONS_PER_PAGE;
    const end = Math.min(page * TRANSACTIONS_PER_PAGE, state.transactions.length);
    const chunk = state.transactions.slice(start, end);
    drawPdfPage(doc, { company, source, page, pages, start, end, chunk });
  }

  const datePart = new Date().toISOString().slice(0, 10);
  doc.save(`RO_Transaction_Order_Forms_${datePart}.pdf`);
  setStatus("PDF 已產生，請查看瀏覽器下載項目。");
}

function drawPdfPage(doc, context) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;
  const fullWidth = pageWidth - margin * 2;

  doc.setFillColor(229, 231, 235);
  doc.rect(margin, 18, fullWidth, 24, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(17, 24, 39);
  doc.text("Transaction Order Record", pageWidth / 2, 35, { align: "center" });

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
      0: { cellWidth: 24, halign: "center" },
      1: { cellWidth: 50 },
      2: { cellWidth: 50 },
      3: { cellWidth: 56 },
      4: { cellWidth: 76 },
      5: { cellWidth: 104 },
      6: { cellWidth: 44, halign: "right" },
      7: { cellWidth: 58, halign: "right" },
      8: { cellWidth: 28 },
      9: { cellWidth: 66, halign: "right" },
      10: { cellWidth: 42, halign: "right" },
      11: { cellWidth: 56, halign: "right" },
      12: { cellWidth: 82 },
      13: { cellWidth: 60, halign: "right" }
    },
    didParseCell(data) {
      if (data.section === "body" && [9, 11].includes(data.column.index)) {
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

function drawSignatureBlock(doc, x, y, width) {
  const leftWidth = width * 0.58;
  const notesWidth = width - leftWidth;
  const rowHeight = 38;
  const labelWidth = 76;
  const nameWidth = 190;
  const dateWidth = leftWidth - labelWidth - nameWidth;

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
  doc.text(els.executedDateInput.value, x + labelWidth + nameWidth + 4, y + 23);
  doc.text(els.roNameInput.value.trim(), x + labelWidth + 4, y + rowHeight + 23);
  doc.text(els.roDateInput.value, x + labelWidth + nameWidth + 4, y + rowHeight + 23);

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
