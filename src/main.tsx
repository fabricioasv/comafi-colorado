import React from "react";
import { createRoot } from "react-dom/client";
import {
  AlertCircle,
  Banknote,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  RefreshCw,
  Search,
  TrendingDown,
  WalletCards
} from "lucide-react";
import "./styles.css";

type EntryStatus = "QUITADO" | "EM ABERTO" | "OUTRO";

type Entry = {
  supplier: string;
  invoice?: string;
  dueDate?: string;
  paymentMethod?: string;
  netValue?: number;
  halfValue?: number;
  depositIldeuGuim?: number;
  depositFabAlb?: number;
  balanceIldeuGuim?: number;
  balanceFabAlb?: number;
  totalBalance?: number;
  status: EntryStatus;
  paidAt?: string;
};

type MonthData = {
  id: string;
  label: string;
  year?: number;
  month?: number;
  openingBalance?: number;
  totals: {
    paid: number;
    open: number;
    depositsIldeuGuim: number;
    depositsFabAlb: number;
    expenses: number;
    finalIldeuGuim?: number;
    finalFabAlb?: number;
    finalTotal?: number;
  };
  entries: Entry[];
};

type AppData = {
  updatedAt: string;
  sourceName?: string;
  months: MonthData[];
};

type EntryWithMonth = Entry & { monthId: string; monthLabel: string };

const currency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL"
});

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "2-digit"
});

function App() {
  const [data, setData] = React.useState<AppData | null>(null);
  const [selectedMonthId, setSelectedMonthId] = React.useState("");
  const [query, setQuery] = React.useState("");
  const [showPaid, setShowPaid] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const loadData = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`/data.json?v=${Date.now()}`, { cache: "no-store" });
      if (!response.ok) throw new Error("Arquivo data.json nao encontrado.");
      const nextData = (await response.json()) as AppData;
      setData(nextData);
      setSelectedMonthId((current) => current || getDefaultMonth(nextData.months)?.id || "");
    } catch (requestError) {
      setData(null);
      setSelectedMonthId("");
      setError(requestError instanceof Error ? requestError.message : "Falha ao carregar dados.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadData();
  }, [loadData]);

  const months = data?.months ?? [];
  const currentMonth = getCurrentMonth(months);
  const selectedMonth = months.find((month) => month.id === selectedMonthId) ?? currentMonth ?? getDefaultMonth(months);
  const overview = buildOverview(months, currentMonth);
  const openEntries = getEntriesWithMonth(months)
    .filter((entry) => entry.status === "EM ABERTO" && !isDeposit(entry))
    .sort(compareByDueDate);
  const selectedEntries = filterMonthEntries(selectedMonth?.entries ?? [], query, showPaid);

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">COMAFI Colorado</p>
          <h1>Resumo da obra</h1>
          <p className="updated">
            Atualizado em {data ? formatDate(data.updatedAt) : "--"} {data?.sourceName ? `por ${data.sourceName}` : ""}
          </p>
        </div>
        <button className="icon-button" aria-label="Atualizar dados" onClick={() => void loadData()}>
          <RefreshCw size={20} />
        </button>
      </header>

      {error && (
        <div className="notice">
          <AlertCircle size={18} />
          <span>{error} Gere o arquivo com npm run data:build -- caminho-da-planilha.xlsx.</span>
        </div>
      )}

      {!isLoading && !error && months.length === 0 && (
        <section className="empty-state">
          <h2>Nenhum dado processado</h2>
          <p>Gere o arquivo estatico antes de publicar ou testar o site.</p>
          <code>npm run data:build -- "C:\caminho\planilha.xlsx"</code>
        </section>
      )}

      {months.length > 0 && (
        <>
          <section className="summary-grid hero-summary" aria-label="Resumo geral">
            <MetricCard
              icon={<WalletCards size={20} />}
              label="Saldo atual"
              value={formatMoney(overview.currentBalance)}
              tone={(overview.currentBalance ?? 0) < 0 ? "bad" : "good"}
            />
            <MetricCard icon={<Clock3 size={20} />} label="Em aberto" value={formatMoney(overview.openTotal)} tone="warn" />
            <MetricCard icon={<CalendarDays size={20} />} label="Mes atual" value={currentMonth?.label ?? "--"} />
            <MetricCard icon={<TrendingDown size={20} />} label="Despesas totais" value={formatMoney(overview.expensesTotal)} />
            <MetricCard icon={<CircleDollarSign size={20} />} label="Depositos" value={formatMoney(overview.depositsTotal)} tone="good" />
          </section>

          <section className="focus-grid">
            <article className="focus-panel">
              <div className="section-title">
                <div>
                  <span>Prioridade</span>
                  <h2>Proximos pagamentos</h2>
                </div>
                <strong>{openEntries.length}</strong>
              </div>
              {openEntries.length === 0 ? (
                <p className="muted">Nenhuma conta em aberto.</p>
              ) : (
                <div className="open-list">
                  {openEntries.slice(0, 8).map((entry, index) => (
                    <OpenEntryCard key={`${entry.monthId}-${entry.supplier}-${entry.dueDate}-${index}`} entry={entry} />
                  ))}
                </div>
              )}
            </article>

            <article className="focus-panel balances-panel">
              <div className="section-title">
                <div>
                  <span>Saldos</span>
                  <h2>Socios</h2>
                </div>
              </div>
              <p className="panel-subtitle">{currentMonth?.label ?? "Mes atual nao encontrado"}</p>
              <div className="balance-row">
                <span>Ildeu/Guim.</span>
                <strong>{formatMoney(overview.currentIldeuGuim)}</strong>
              </div>
              <div className="balance-row">
                <span>Fab./Alb.</span>
                <strong>{formatMoney(overview.currentFabAlb)}</strong>
              </div>
              {overview.nextDue && (
                <div className="next-due">
                  <span>Proximo vencimento</span>
                  <strong>{formatDate(overview.nextDue.dueDate)}</strong>
                  <p>{overview.nextDue.supplier}</p>
                </div>
              )}
            </article>
          </section>

          <section className="month-section" aria-label="Resumo por mes">
            <div className="section-title">
              <div>
                <span>Historico</span>
                <h2>Meses</h2>
              </div>
            </div>
            <div className="month-strip">
              {[...months].reverse().map((month) => (
                <button
                  key={month.id}
                  className={`month-card ${selectedMonth?.id === month.id ? "active" : ""} ${currentMonth?.id === month.id ? "current" : ""}`}
                  onClick={() => setSelectedMonthId(month.id)}
                >
                  <span>{month.label}</span>
                  <strong>{formatMoney(month.totals.finalTotal)}</strong>
                  <small>{currentMonth?.id === month.id ? "mes atual" : `${month.entries.filter((entry) => entry.status === "EM ABERTO").length} abertos`}</small>
                </button>
              ))}
            </div>
          </section>

          {selectedMonth && (
            <section className="detail-section" aria-label="Detalhe do mes">
              <div className="detail-header">
                <div className="section-title">
                  <div>
                    <span>Detalhe</span>
                    <h2>{selectedMonth.label}</h2>
                  </div>
                </div>
                <label className="compact-search">
                  <Search size={16} />
                  <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar" />
                </label>
              </div>

              <div className="toggle-row">
                <button className={!showPaid ? "active" : ""} onClick={() => setShowPaid(false)}>
                  Apenas pendentes
                </button>
                <button className={showPaid ? "active" : ""} onClick={() => setShowPaid(true)}>
                  Todos
                </button>
              </div>

              <div className="entry-list">
                {selectedEntries.length === 0 && <p className="empty">Nenhum lancamento encontrado.</p>}
                {selectedEntries.map((entry, index) => (
                  <EntryCard key={`${entry.supplier}-${entry.invoice}-${entry.dueDate}-${index}`} entry={entry} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </main>
  );
}

function MetricCard({
  icon,
  label,
  value,
  tone
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: "good" | "warn" | "bad";
}) {
  return (
    <article className={`metric ${tone ?? ""}`}>
      <div className="metric-icon">{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function OpenEntryCard({ entry }: { entry: EntryWithMonth }) {
  return (
    <article className="open-card">
      <div>
        <strong>{entry.supplier || "Sem fornecedor"}</strong>
        <span>{entry.monthLabel} - {entry.paymentMethod || "Sem forma"}</span>
      </div>
      <div>
        <strong>{formatMoney(entry.netValue)}</strong>
        <span>{formatDate(entry.dueDate) || "Sem venc."}</span>
      </div>
    </article>
  );
}

function EntryCard({ entry }: { entry: Entry }) {
  return (
    <article className="entry-card">
      <div className="entry-main">
        <div>
          <h3>{entry.supplier || "Sem fornecedor"}</h3>
          <p>
            {entry.paymentMethod || "Sem forma"} {entry.invoice ? `- NF ${entry.invoice}` : ""}
          </p>
        </div>
        <span className={`status ${entry.status === "EM ABERTO" ? "open" : "paid"}`}>{statusLabel(entry.status)}</span>
      </div>
      <div className="entry-values">
        <div>
          <span>Valor</span>
          <strong>{formatMoney(entry.netValue)}</strong>
        </div>
        <div>
          <span>50%</span>
          <strong>{formatMoney(entry.halfValue)}</strong>
        </div>
        <div>
          <span>Venc.</span>
          <strong>{formatDate(entry.dueDate) || "--"}</strong>
        </div>
        <div>
          <span>Pago</span>
          <strong>{formatDate(entry.paidAt) || "--"}</strong>
        </div>
      </div>
    </article>
  );
}

function buildOverview(months: MonthData[], currentMonth?: MonthData) {
  const allEntries = getEntriesWithMonth(months);
  const openEntries = allEntries.filter((entry) => entry.status === "EM ABERTO" && !isDeposit(entry)).sort(compareByDueDate);

  return {
    currentBalance: currentMonth?.totals.finalTotal,
    currentIldeuGuim: currentMonth?.totals.finalIldeuGuim,
    currentFabAlb: currentMonth?.totals.finalFabAlb,
    openTotal: openEntries.reduce((sum, entry) => sum + numberOrZero(entry.netValue), 0),
    expensesTotal: months.reduce((sum, month) => sum + numberOrZero(month.totals.expenses), 0),
    depositsTotal: months.reduce((sum, month) => sum + numberOrZero(month.totals.depositsIldeuGuim) + numberOrZero(month.totals.depositsFabAlb), 0),
    nextDue: openEntries[0]
  };
}

function getCurrentMonth(months: MonthData[]) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  return months.find((item) => item.year === year && item.month === month);
}

function getDefaultMonth(months: MonthData[]) {
  const withOpen = [...months].reverse().find((month) => month.entries.some((entry) => entry.status === "EM ABERTO"));
  return withOpen ?? months.at(-1);
}

function getEntriesWithMonth(months: MonthData[]): EntryWithMonth[] {
  return months.flatMap((month) => month.entries.map((entry) => ({ ...entry, monthId: month.id, monthLabel: month.label })));
}

function filterMonthEntries(entries: Entry[], query: string, showPaid: boolean) {
  const normalizedQuery = normalizeText(query);
  return entries
    .filter((entry) => showPaid || entry.status === "EM ABERTO")
    .filter((entry) => {
      if (!normalizedQuery) return true;
      return [entry.supplier, entry.invoice, entry.paymentMethod, entry.status]
        .filter(Boolean)
        .some((value) => normalizeText(value!).includes(normalizedQuery));
    });
}

function compareByDueDate(a: Entry, b: Entry) {
  return dateTime(a.dueDate) - dateTime(b.dueDate);
}

function dateTime(value?: string) {
  if (!value) return Number.MAX_SAFE_INTEGER;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? Number.MAX_SAFE_INTEGER : date.getTime();
}

function formatMoney(value?: number) {
  return currency.format(Number.isFinite(value) ? value ?? 0 : 0);
}

function formatDate(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return dateFormatter.format(date);
}

function statusLabel(status: EntryStatus) {
  return status === "QUITADO" ? "Quitado" : status === "EM ABERTO" ? "Em aberto" : "Outro";
}

function isDeposit(entry: Entry) {
  const supplier = normalizeText(entry.supplier);
  return supplier.includes("deposito") || Boolean(entry.depositIldeuGuim || entry.depositFabAlb);
}

function normalizeText(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function numberOrZero(value?: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

createRoot(document.getElementById("root")!).render(<App />);
