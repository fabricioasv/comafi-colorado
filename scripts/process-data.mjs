import fs from "node:fs/promises";
import path from "node:path";
import ExcelJS from "exceljs";

const MONTHS = {
  janeiro: 1,
  fevereiro: 2,
  marco: 3,
  abril: 4,
  maio: 5,
  junho: 6,
  julho: 7,
  agosto: 8,
  setembro: 9,
  outubro: 10,
  novembro: 11,
  dezembro: 12
};

const inputPath = process.argv[2];
const outputPath = process.argv[3] || "public/data.json";

if (!inputPath) {
  console.error("Uso: npm run data:build -- caminho-da-planilha.xlsx [public/data.json]");
  process.exit(1);
}

const buffer = await fs.readFile(inputPath);
const data = inputPath.toLowerCase().endsWith(".csv")
  ? parseSheets([{ name: path.basename(inputPath, path.extname(inputPath)), rows: parseCsv(buffer.toString("utf8")) }], path.basename(inputPath))
  : parseSheets(await parseXlsx(buffer), path.basename(inputPath));

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");

const entries = data.months.reduce((sum, month) => sum + month.entries.length, 0);
console.log(`Gerado ${outputPath}: ${data.months.length} meses, ${entries} lancamentos.`);

async function parseXlsx(fileBuffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(fileBuffer);
  return workbook.worksheets.map((worksheet) => {
    const rows = [];
    worksheet.eachRow({ includeEmpty: false }, (row) => {
      const values = Array.isArray(row.values) ? row.values.slice(1) : [];
      rows.push(values.map(readCellValue));
    });
    return { name: worksheet.name, rows };
  });
}

function parseSheets(sheets, sourceName) {
  const months = sheets
    .map((sheet) => parseSheet(sheet.name, sheet.rows))
    .filter(Boolean)
    .sort((a, b) => (a.year ?? 0) - (b.year ?? 0) || (a.month ?? 0) - (b.month ?? 0) || a.label.localeCompare(b.label));

  return {
    updatedAt: new Date().toISOString(),
    sourceName,
    months
  };
}

function parseSheet(sheetName, rows) {
  const headerIndex = rows.findIndex((row) => row.some((cell) => normalize(cell) === "fornecedor"));
  if (headerIndex < 0) return null;

  const map = buildColumnMap(rows[headerIndex]);
  if (map.supplier === undefined) return null;

  const parsedEntries = rows
    .slice(headerIndex + 1)
    .map((row) => parseEntry(row, map))
    .filter(Boolean);
  const openingEntry = parsedEntries.find((entry) => normalizeWords(entry.supplier).includes("saldo inicial"));
  const entries = parsedEntries.filter((entry) => !normalizeWords(entry.supplier).includes("saldo inicial"));
  if (entries.length === 0) return null;

  const { month, year } = parseMonthFromName(sheetName);
  const finalEntry = [...entries].reverse().find((entry) => hasNumber(entry.totalBalance) || hasNumber(entry.balanceIldeuGuim) || hasNumber(entry.balanceFabAlb));
  const expenses = entries.reduce((sum, entry) => sum + (isDeposit(entry) ? 0 : numberOrZero(entry.netValue)), 0);
  const open = entries.reduce((sum, entry) => sum + (entry.status === "EM ABERTO" && !isDeposit(entry) ? numberOrZero(entry.netValue) : 0), 0);
  const paid = entries.reduce((sum, entry) => sum + (entry.status === "QUITADO" && !isDeposit(entry) ? numberOrZero(entry.netValue) : 0), 0);

  return {
    id: year && month ? `${year}-${String(month).padStart(2, "0")}` : slug(sheetName),
    label: sheetName.trim(),
    year,
    month,
    openingBalance: openingEntry?.totalBalance,
    totals: {
      paid,
      open,
      depositsIldeuGuim: entries.reduce((sum, entry) => sum + numberOrZero(entry.depositIldeuGuim), 0),
      depositsFabAlb: entries.reduce((sum, entry) => sum + numberOrZero(entry.depositFabAlb), 0),
      expenses,
      finalIldeuGuim: finalEntry?.balanceIldeuGuim,
      finalFabAlb: finalEntry?.balanceFabAlb,
      finalTotal: finalEntry?.totalBalance
    },
    entries
  };
}

function buildColumnMap(header) {
  const map = {};
  header.forEach((cell, index) => {
    const key = normalize(cell);
    if (key === "fornecedor") map.supplier = index;
    else if (["nf", "notafiscal"].includes(key)) map.invoice = index;
    else if (["venc", "vencimento"].includes(key)) map.dueDate = index;
    else if (["formadepag", "formadepagamento", "formadepgto", "fpgto"].includes(key)) map.paymentMethod = index;
    else if (["valorliqdoboleto", "valliqdobol", "valorliqbol"].includes(key)) map.netValue = index;
    else if (["valorapagar50"].includes(key)) map.halfValue = index;
    else if (key.includes("depildeuguim")) map.depositIldeuGuim = index;
    else if (key.includes("depfabalb")) map.depositFabAlb = index;
    else if (key.includes("saldildeugui")) map.balanceIldeuGuim = index;
    else if (key.includes("saldfabalb")) map.balanceFabAlb = index;
    else if (key === "saldototal") map.totalBalance = index;
    else if (key === "situacao") map.status = index;
    else if (key === "datapagamento") map.paidAt = index;
  });
  return map;
}

function parseEntry(row, map) {
  const supplier = text(row[map.supplier]);
  const netValue = money(row[map.netValue ?? -1]);
  const halfValue = money(row[map.halfValue ?? -1]);
  const status = parseStatus(row[map.status ?? -1]);
  const hasFinancialValue = [netValue, halfValue, row[map.depositIldeuGuim ?? -1], row[map.depositFabAlb ?? -1], row[map.totalBalance ?? -1]].some((value) => hasNumber(money(value)));

  if (!supplier && !hasFinancialValue) return null;
  if (!supplier && status === "EM ABERTO" && numberOrZero(netValue) === 0) return null;

  return {
    supplier,
    invoice: text(row[map.invoice ?? -1]) || undefined,
    dueDate: dateValue(row[map.dueDate ?? -1]),
    paymentMethod: text(row[map.paymentMethod ?? -1]) || undefined,
    netValue,
    halfValue,
    depositIldeuGuim: money(row[map.depositIldeuGuim ?? -1]),
    depositFabAlb: money(row[map.depositFabAlb ?? -1]),
    balanceIldeuGuim: money(row[map.balanceIldeuGuim ?? -1]),
    balanceFabAlb: money(row[map.balanceFabAlb ?? -1]),
    totalBalance: money(row[map.totalBalance ?? -1]),
    status,
    paidAt: dateValue(row[map.paidAt ?? -1])
  };
}

function parseStatus(value) {
  const normalized = normalize(value);
  if (normalized.startsWith("quitad")) return "QUITADO";
  if (normalized.includes("aberto")) return "EM ABERTO";
  return "OUTRO";
}

function parseMonthFromName(name) {
  const parts = normalizeWords(name).split(/\s+/).filter(Boolean);
  const monthName = parts.find((part) => MONTHS[part]);
  const rawYear = parts.find((part) => /^\d{2,4}$/.test(part));
  const year = rawYear ? Number(rawYear.length === 2 ? `20${rawYear}` : rawYear) : undefined;
  return { month: monthName ? MONTHS[monthName] : undefined, year };
}

function money(value) {
  if (value === null || value === undefined || value === "") return undefined;
  if (typeof value === "number") return Number.isFinite(value) ? round(value) : undefined;
  if (value instanceof Date) return undefined;
  const cleaned = String(value)
    .replace(/R\$/gi, "")
    .replace(/\s/g, "")
    .replace(/\((.*)\)/, "-$1");
  if (!cleaned || cleaned === "-") return undefined;
  const normalized = cleaned.includes(",") ? cleaned.replace(/\./g, "").replace(",", ".") : cleaned;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? round(parsed) : undefined;
}

function dateValue(value) {
  if (value === null || value === undefined || value === "") return undefined;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return toIsoDate(value);
  if (typeof value === "number" && value > 20000 && value < 80000) {
    const excelEpoch = Date.UTC(1899, 11, 30);
    return toIsoDate(new Date(excelEpoch + value * 86400000));
  }
  const raw = String(value).trim();
  const br = raw.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (br) {
    const year = br[3] ? Number(br[3].length === 2 ? `20${br[3]}` : br[3]) : new Date().getFullYear();
    return toIsoDate(new Date(Date.UTC(year, Number(br[2]) - 1, Number(br[1]))));
  }
  const date = new Date(raw);
  if (!Number.isNaN(date.getTime())) return toIsoDate(date);
  return raw;
}

function text(value) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return toIsoDate(value);
  return String(value).trim();
}

function readCellValue(value) {
  if (value === null || value === undefined) return undefined;
  if (value instanceof Date) return value;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "object") {
    if (value.result !== undefined) return readCellValue(value.result);
    if (value.text !== undefined) return value.text;
    if (Array.isArray(value.richText)) return value.richText.map((part) => part.text ?? "").join("");
  }
  return String(value);
}

function parseCsv(content) {
  const delimiter = content.split(/\r?\n/, 1)[0]?.includes(";") ? ";" : ",";
  const rows = [];
  let field = "";
  let row = [];
  let quoted = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const next = content[index + 1];
    if (char === '"' && quoted && next === '"') {
      field += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      row.push(field);
      field = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(field);
      if (row.some((cell) => cell.trim())) rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  row.push(field);
  if (row.some((cell) => cell.trim())) rows.push(row);
  return rows;
}

function normalize(value) {
  return normalizeWords(String(value ?? "")).replace(/[^a-z0-9]/g, "");
}

function normalizeWords(value) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function slug(value) {
  return normalizeWords(value).replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function round(value) {
  return Math.round(value * 100) / 100;
}

function numberOrZero(value) {
  return hasNumber(value) ? value : 0;
}

function hasNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function isDeposit(entry) {
  const supplier = normalizeWords(entry.supplier);
  return supplier.includes("deposito") || hasNumber(entry.depositIldeuGuim) || hasNumber(entry.depositFabAlb);
}

function toIsoDate(date) {
  return date.toISOString().slice(0, 10);
}
