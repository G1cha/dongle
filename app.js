const STORAGE_KEY = "dongle-finance-v1";

const CATEGORIES = {
  food: { name: "Еда", icon: "◒", color: "#f0a46b", soft: "#fff0e5" },
  home: { name: "Жильё", icon: "⌂", color: "#739d8c", soft: "#e8f2ed" },
  transport: { name: "Транспорт", icon: "↗", color: "#7696d2", soft: "#ebf0fb" },
  subscriptions: { name: "Подписки", icon: "◉", color: "#a687cc", soft: "#f1ebf7" },
  health: { name: "Здоровье", icon: "＋", color: "#df7670", soft: "#fbeceb" },
  leisure: { name: "Развлечения", icon: "◇", color: "#dcb75c", soft: "#fbf4df" },
  shopping: { name: "Покупки", icon: "□", color: "#59a7a8", soft: "#e4f3f2" },
  other: { name: "Другое", icon: "•••", color: "#9aa3a0", soft: "#eff1f0" },
};

const INCOME_SOURCES = {
  salary: { name: "Зарплата", icon: "▣", color: "#4b9a78", soft: "#e5f3eb" },
  freelance: { name: "Подработка", icon: "◇", color: "#6596ba", soft: "#e9f2f8" },
  refund: { name: "Возврат", icon: "↶", color: "#b9965d", soft: "#f8f0e2" },
  gift: { name: "Подарок", icon: "✧", color: "#a783c1", soft: "#f2ebf6" },
  other: { name: "Другое", icon: "•••", color: "#9aa3a0", soft: "#eff1f0" },
};

const DEFAULT_STATE = {
  version: 1,
  expenses: [],
  incomes: [],
  wallets: [
    { id: "cash-vnd", name: "Наличные донги", currency: "VND", balance: 0 },
    { id: "cash-usd", name: "Наличные доллары", currency: "USD", balance: 0 },
  ],
  limits: Object.fromEntries(Object.keys(CATEGORIES).map((key) => [key, 0])),
  rates: { vndRub: 0.00335, vndUsd: 0.000038, date: null, fetchedAt: null, source: "fallback" },
};

let state = loadState();
let activePeriod = "day";
let activeView = "dashboard";
let reportDate = new Date();
let incomeReportDate = new Date();

const $ = (selector, scope = document) => scope.querySelector(selector);
const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];

function cloneDefaultState() {
  return JSON.parse(JSON.stringify(DEFAULT_STATE));
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved || !Array.isArray(saved.expenses) || !Array.isArray(saved.wallets)) return cloneDefaultState();
    return {
      ...cloneDefaultState(),
      ...saved,
      incomes: Array.isArray(saved.incomes) ? saved.incomes : [],
      limits: { ...DEFAULT_STATE.limits, ...(saved.limits || {}) },
      rates: { ...DEFAULT_STATE.rates, ...(saved.rates || {}) },
    };
  } catch {
    return cloneDefaultState();
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function localDateString(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function dateFromString(value) {
  return new Date(`${value}T12:00:00`);
}

function formatVnd(value, compact = false) {
  const amount = Number(value) || 0;
  if (compact && Math.abs(amount) >= 1_000_000) return `${trimNumber(amount / 1_000_000)} млн ₫`;
  return `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(amount)} ₫`;
}

function formatRub(value) {
  return `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: Math.abs(value) < 10 ? 2 : 0 }).format(Number(value) || 0)} ₽`;
}

function formatWallet(value, currency) {
  const digits = currency === "VND" ? 0 : 2;
  const symbol = { VND: "₫", RUB: "₽", USD: "$", USDT: "USDT" }[currency] || currency;
  return `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: digits }).format(Number(value) || 0)} ${symbol}`;
}

function trimNumber(value) {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(value || 0);
}

function plural(number, forms) {
  const n = Math.abs(number) % 100;
  const n1 = n % 10;
  if (n > 10 && n < 20) return forms[2];
  if (n1 > 1 && n1 < 5) return forms[1];
  if (n1 === 1) return forms[0];
  return forms[2];
}

function formatDate(value) {
  const date = dateFromString(value);
  const today = localDateString();
  const yesterday = localDateString(new Date(Date.now() - 86400000));
  if (value === today) return "Сегодня";
  if (value === yesterday) return "Вчера";
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" }).format(date).replace(".", "");
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#039;", '"': "&quot;" })[char]);
}

function parseAmount(value) {
  const normalized = String(value).toLowerCase().replace(/\s/g, "").replace(",", ".");
  const match = normalized.match(/^([0-9]*\.?[0-9]+)(к|k|м|m|млн)?$/i);
  if (!match) return Number(normalized.replace(/[^0-9.]/g, "")) || 0;
  const multiplier = ["м", "m", "млн"].includes(match[2]) ? 1_000_000 : ["к", "k"].includes(match[2]) ? 1_000 : 1;
  return Number(match[1]) * multiplier;
}

function walletToRub(wallet) {
  if (wallet.currency === "RUB") return wallet.balance;
  if (wallet.currency === "VND") return wallet.balance * state.rates.vndRub;
  if (["USD", "USDT"].includes(wallet.currency)) return wallet.balance * (state.rates.vndRub / state.rates.vndUsd);
  return 0;
}

function vndToWallet(amount, currency) {
  if (currency === "VND") return amount;
  if (currency === "RUB") return amount * state.rates.vndRub;
  if (["USD", "USDT"].includes(currency)) return amount * state.rates.vndUsd;
  return amount;
}

function amountToVnd(amount, currency, rates = state.rates) {
  if (currency === "VND") return amount;
  if (currency === "RUB") return amount / rates.vndRub;
  if (["USD", "USDT"].includes(currency)) return amount / rates.vndUsd;
  return NaN;
}

function convertCurrency(amount, from, to, rates = state.rates) {
  if (from === to) return amount;
  const vnd = amountToVnd(amount, from, rates);
  if (to === "VND") return vnd;
  if (to === "RUB") return vnd * rates.vndRub;
  if (["USD", "USDT"].includes(to)) return vnd * rates.vndUsd;
  return NaN;
}

function roundForCurrency(amount, currency) {
  return currency === "VND" ? Math.round(amount) : Math.round((amount + Number.EPSILON) * 100) / 100;
}

function getPeriodExpenses(period = activePeriod) {
  const today = dateFromString(localDateString());
  let start;
  if (period === "day") start = today;
  if (period === "week") start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6, 12);
  if (period === "month") start = new Date(today.getFullYear(), today.getMonth(), 1, 12);
  return state.expenses.filter((expense) => {
    const date = dateFromString(expense.date);
    return date >= start && date <= today;
  });
}

function getPeriodIncome(period = activePeriod) {
  const today = dateFromString(localDateString());
  const start = period === "day" ? today : period === "week"
    ? new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6, 12)
    : new Date(today.getFullYear(), today.getMonth(), 1, 12);
  return state.incomes.filter((income) => {
    const date = dateFromString(income.date);
    return date >= start && date <= today;
  });
}

function monthExpenses() {
  return state.expenses.filter((expense) => {
    const date = dateFromString(expense.date);
    return date.getFullYear() === reportDate.getFullYear() && date.getMonth() === reportDate.getMonth();
  });
}

function monthIncome() {
  return state.incomes.filter((income) => {
    const date = dateFromString(income.date);
    return date.getFullYear() === incomeReportDate.getFullYear() && date.getMonth() === incomeReportDate.getMonth();
  });
}

function renderAll() {
  renderRate();
  renderDashboard();
  renderExpensesReport();
  renderIncomeReport();
  renderWallets();
  renderLimits();
  populateWalletSelect();
  populateIncomeWalletSelect();
}

function renderRate() {
  const rubPerMillion = state.rates.vndRub * 1_000_000;
  $("#rateLabel").textContent = `1 млн ₫ = ${formatRub(rubPerMillion)}`;
  const { date, source } = state.rates;
  const status = source === "auto" ? `Онлайн-курс · ${date || "дата не указана"}` : source === "manual" ? `Ручной курс · ${date || "сегодня"}` : "Резервный примерный курс · нет данных из сети";
  $("#rateSource").textContent = `${status}. Источник автообновления: fawazahmed0/exchange-api.`;
  $("#rateButton").title = `${status}. Нажмите, чтобы обновить.`;
  $("#manualRate").value = state.rates.vndRub;
}

function renderDashboard() {
  const expenses = getPeriodExpenses();
  const totalVnd = expenses.reduce((sum, item) => sum + item.amountVnd, 0);
  const totalRub = expenses.reduce((sum, item) => sum + item.amountVnd * (item.rateVndRub || state.rates.vndRub), 0);
  const labels = { day: ["Расходы сегодня", "Сегодня"], week: ["Расходы за 7 дней", "7 дней"], month: ["Расходы в этом месяце", "Месяц"] };

  $("#periodTitle").textContent = labels[activePeriod][0];
  $("#chartPeriodLabel").textContent = labels[activePeriod][1];
  $("#periodVnd").textContent = formatVnd(totalVnd);
  $("#periodRub").textContent = `≈ ${formatRub(totalRub)}`;
  $("#expenseCount").textContent = `${expenses.length} ${plural(expenses.length, ["операция", "операции", "операций"])}`;
  renderSparkline();
  renderBalanceSummary();
  renderIncomeSummary();
  renderCategoryChart(expenses);
  renderLimitPreview();
  renderExpenseList($("#recentExpenses"), [...state.expenses].sort(sortExpenses).slice(0, 5));
}

function renderSparkline() {
  const today = dateFromString(localDateString());
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6 + index, 12);
    const key = localDateString(date);
    return state.expenses.filter((item) => item.date === key).reduce((sum, item) => sum + item.amountVnd, 0);
  });
  const max = Math.max(...days, 1);
  const width = 620;
  const height = 100;
  const points = days.map((value, index) => `${(index / 6) * width},${height - 14 - (value / max) * 62}`).join(" ");
  const areaPoints = `0,${height} ${points} ${width},${height}`;
  $("#sparkline").innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true">
      <defs><linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#dff36b" stop-opacity=".22"/><stop offset="1" stop-color="#dff36b" stop-opacity="0"/></linearGradient></defs>
      <line x1="0" y1="35" x2="${width}" y2="35" stroke="rgba(255,255,255,.06)"/><line x1="0" y1="70" x2="${width}" y2="70" stroke="rgba(255,255,255,.06)"/>
      <polygon points="${areaPoints}" fill="url(#chartFill)"/><polyline points="${points}" fill="none" stroke="#dff36b" stroke-width="3" vector-effect="non-scaling-stroke" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
}

function renderBalanceSummary() {
  const total = state.wallets.reduce((sum, wallet) => sum + walletToRub(wallet), 0);
  $("#totalBalanceRub").textContent = formatRub(total);
  $("#walletCount").textContent = `${state.wallets.length} ${plural(state.wallets.length, ["кошелёк", "кошелька", "кошельков"])}`;
  const wallets = [...state.wallets].sort((a, b) => walletToRub(b) - walletToRub(a)).slice(0, 3);
  $("#walletPreview").innerHTML = wallets.length
    ? wallets.map((wallet) => `<div class="wallet-preview-row"><span><i class="currency-icon">${wallet.currency === "USDT" ? "₮" : wallet.currency[0]}</i>${escapeHtml(wallet.name)}</span><strong>${formatWallet(wallet.balance, wallet.currency)}</strong></div>`).join("")
    : '<p class="empty-mini">Добавьте первый кошелёк, чтобы видеть общий баланс.</p>';
  $("#addWalletHome").textContent = state.wallets.length <= 2 ? "＋ Добавить ещё кошелёк" : "＋ Добавить кошелёк";
}

function renderIncomeSummary() {
  const incomes = getPeriodIncome();
  const totalRub = incomes.reduce((sum, income) => sum + income.amountRub, 0);
  $("#incomePeriodTitle").textContent = { day: "Прибыль сегодня", week: "Прибыль за 7 дней", month: "Прибыль в этом месяце" }[activePeriod];
  $("#incomePeriodRub").textContent = formatRub(totalRub);
  $("#incomePeriodCount").textContent = `${incomes.length} ${plural(incomes.length, ["поступление", "поступления", "поступлений"])}`;
}

function renderCategoryChart(expenses) {
  const totals = Object.keys(CATEGORIES).map((key) => ({ key, total: expenses.filter((item) => item.category === key).reduce((sum, item) => sum + item.amountVnd, 0) })).filter((item) => item.total > 0).sort((a, b) => b.total - a.total);
  const grandTotal = totals.reduce((sum, item) => sum + item.total, 0);
  $("#donutTotal").textContent = trimNumber(grandTotal / 1_000_000);
  if (!grandTotal) {
    $("#categoryDonut").style.setProperty("--chart", "conic-gradient(#e6eae6 0 100%)");
    $("#categoryLegend").innerHTML = '<p class="empty-mini">Здесь появится распределение расходов после первой операции.</p>';
    return;
  }
  let current = 0;
  const slices = totals.map((item) => {
    const start = current;
    current += (item.total / grandTotal) * 100;
    return `${CATEGORIES[item.key].color} ${start}% ${current}%`;
  });
  $("#categoryDonut").style.setProperty("--chart", `conic-gradient(${slices.join(",")})`);
  $("#categoryLegend").innerHTML = totals.slice(0, 5).map((item) => `<div class="legend-row"><span class="legend-name"><i class="legend-dot" style="background:${CATEGORIES[item.key].color}"></i>${CATEGORIES[item.key].name}</span><strong>${Math.round((item.total / grandTotal) * 100)}%</strong></div>`).join("");
}

function monthlyCategorySpend(category) {
  const now = new Date();
  return state.expenses.filter((item) => {
    const date = dateFromString(item.date);
    return item.category === category && date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
  }).reduce((sum, item) => sum + item.amountVnd, 0);
}

function getLimit(category) {
  const stored = state.limits[category];
  if (typeof stored === "number") return { amount: Math.max(0, stored), currency: "VND" };
  return {
    amount: Math.max(0, Number(stored?.amount) || 0),
    currency: stored?.currency === "RUB" ? "RUB" : "VND",
  };
}

function limitInVnd(limit) {
  return limit.currency === "RUB" ? limit.amount / state.rates.vndRub : limit.amount;
}

function limitEquivalent(amount, currency) {
  if (!amount) return "Укажите сумму, чтобы увидеть пересчёт";
  return currency === "RUB"
    ? `≈ ${formatVnd(amount / state.rates.vndRub)} по текущему курсу`
    : `≈ ${formatRub(amount * state.rates.vndRub)} по текущему курсу`;
}

function renderLimitPreview() {
  const configured = Object.keys(CATEGORIES).filter((key) => getLimit(key).amount > 0).slice(0, 4);
  if (!configured.length) {
    $("#limitPreview").innerHTML = '<p class="empty-mini">Лимиты пока не заданы. Установите месячный бюджет для нужных категорий.</p>';
    return;
  }
  $("#limitPreview").innerHTML = configured.map((key) => limitRowHtml(key, getLimit(key))).join("");
}

function limitRowHtml(key, limit) {
  const spent = monthlyCategorySpend(key);
  const percent = Math.round((spent / limitInVnd(limit)) * 100);
  const statusClass = percent >= 100 ? "is-over" : percent >= 80 ? "is-warning" : "";
  const primary = limit.currency === "RUB"
    ? `${formatRub(spent * state.rates.vndRub)} / ${formatRub(limit.amount)}`
    : `${formatVnd(spent, true)} / ${formatVnd(limit.amount, true)}`;
  const secondary = limit.currency === "RUB"
    ? `${formatVnd(spent, true)} / ${formatVnd(limitInVnd(limit), true)}`
    : `${formatRub(spent * state.rates.vndRub)} / ${formatRub(limit.amount * state.rates.vndRub)}`;
  return `<div><div class="limit-row-head"><span><i class="legend-dot" style="background:${CATEGORIES[key].color}"></i>${CATEGORIES[key].name}</span><strong>${primary}</strong></div><div class="progress ${statusClass}"><span style="width:${Math.min(percent, 100)}%"></span></div><div class="limit-secondary">≈ ${secondary}</div></div>`;
}

function sortExpenses(a, b) {
  return b.date.localeCompare(a.date) || (b.createdAt || "").localeCompare(a.createdAt || "");
}

function expenseRowHtml(expense) {
  const category = CATEGORIES[expense.category] || CATEGORIES.other;
  const wallet = state.wallets.find((item) => item.id === expense.walletId);
  const title = expense.note || category.name;
  return `<div class="expense-row">
    <div class="expense-main"><i class="category-icon" style="background:${category.soft};color:${category.color}">${category.icon}</i><span><strong>${escapeHtml(title)}</strong><small>${category.name} · ${formatDate(expense.date)}</small></span></div>
    <span class="expense-wallet">${escapeHtml(wallet?.name || "Удалённый кошелёк")}</span>
    <div class="expense-amount"><strong>− ${formatVnd(expense.amountVnd)}</strong><small>≈ ${formatRub(expense.amountVnd * (expense.rateVndRub || state.rates.vndRub))}</small></div>
    <button class="delete-button" data-delete-expense="${expense.id}" type="button" aria-label="Удалить расход">×</button>
  </div>`;
}

function renderExpenseList(container, expenses) {
  container.innerHTML = expenses.length
    ? `<div class="expense-list">${expenses.map(expenseRowHtml).join("")}</div>`
    : '<div class="expense-empty"><strong>Расходов пока нет</strong>Добавьте первую операцию — отчёт соберётся автоматически.</div>';
}

function renderExpensesReport() {
  const base = monthExpenses();
  const query = $("#expenseSearch")?.value.trim().toLowerCase() || "";
  const expenses = base.filter((item) => {
    const category = CATEGORIES[item.category]?.name || "";
    const wallet = state.wallets.find((entry) => entry.id === item.walletId)?.name || "";
    return `${item.note} ${category} ${wallet}`.toLowerCase().includes(query);
  }).sort(sortExpenses);
  const totalVnd = base.reduce((sum, item) => sum + item.amountVnd, 0);
  const totalRub = base.reduce((sum, item) => sum + item.amountVnd * (item.rateVndRub || state.rates.vndRub), 0);
  const uniqueDays = new Set(base.map((item) => item.date)).size;
  const largest = [...base].sort((a, b) => b.amountVnd - a.amountVnd)[0];
  $("#reportMonth").textContent = new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric" }).format(reportDate);
  $("#reportVnd").textContent = formatVnd(totalVnd);
  $("#reportRub").textContent = `≈ ${formatRub(totalRub)}`;
  $("#reportAverage").textContent = formatVnd(uniqueDays ? totalVnd / uniqueDays : 0);
  $("#reportDays").textContent = `${uniqueDays} ${plural(uniqueDays, ["день", "дня", "дней"])} с тратами`;
  $("#reportLargest").textContent = formatVnd(largest?.amountVnd || 0);
  $("#reportLargestCategory").textContent = largest ? CATEGORIES[largest.category]?.name || "Другое" : "—";
  renderExpenseList($("#allExpenses"), expenses);
}

function incomeRowHtml(income) {
  const source = INCOME_SOURCES[income.source] || INCOME_SOURCES.other;
  const wallet = state.wallets.find((item) => item.id === income.walletId);
  const credited = income.currency !== wallet?.currency && wallet
    ? ` · зачислено ${formatWallet(income.walletCredit, wallet.currency)}`
    : "";
  return `<div class="expense-row income-row">
    <div class="expense-main"><i class="category-icon" style="background:${source.soft};color:${source.color}">${source.icon}</i><span><strong>${escapeHtml(income.note || source.name)}</strong><small>${source.name} · ${formatDate(income.date)}</small></span></div>
    <span class="expense-wallet">${escapeHtml(wallet?.name || "Удалённый кошелёк")}</span>
    <div class="expense-amount"><strong>＋ ${formatWallet(income.amount, income.currency)}</strong><small>≈ ${formatRub(income.amountRub)}${credited}</small></div>
    <button class="delete-button" data-delete-income="${income.id}" type="button" aria-label="Удалить доход">×</button>
  </div>`;
}

function renderIncomeReport() {
  const base = monthIncome();
  const query = $("#incomeSearch")?.value.trim().toLowerCase() || "";
  const visible = base.filter((income) => {
    const source = INCOME_SOURCES[income.source]?.name || "";
    const wallet = state.wallets.find((item) => item.id === income.walletId)?.name || "";
    return `${income.note || ""} ${source} ${wallet} ${income.currency}`.toLowerCase().includes(query);
  }).sort(sortExpenses);
  const rub = base.reduce((sum, income) => sum + income.amountRub, 0);
  const vnd = base.reduce((sum, income) => sum + income.amountVnd, 0);
  const days = new Set(base.map((income) => income.date)).size;
  const largest = [...base].sort((a, b) => b.amountRub - a.amountRub)[0];
  $("#incomeReportMonth").textContent = new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric" }).format(incomeReportDate);
  $("#incomeReportRub").textContent = formatRub(rub);
  $("#incomeReportVnd").textContent = `≈ ${formatVnd(vnd)}`;
  $("#incomeReportAverage").textContent = formatRub(days ? rub / days : 0);
  $("#incomeReportDays").textContent = `${days} ${plural(days, ["день", "дня", "дней"])} с поступлениями`;
  $("#incomeReportLargest").textContent = formatRub(largest?.amountRub || 0);
  $("#incomeReportLargestSource").textContent = largest ? INCOME_SOURCES[largest.source]?.name || "Другое" : "—";
  $("#allIncome").innerHTML = visible.length
    ? `<div class="expense-list">${visible.map(incomeRowHtml).join("")}</div>`
    : '<div class="expense-empty"><strong>Доходов пока нет</strong>Добавьте первое поступление — оно появится здесь и увеличит баланс кошелька.</div>';
}

function renderWallets() {
  const cards = state.wallets.map((wallet) => `<article class="wallet-card">
    <div class="wallet-card-head"><i class="currency-icon">${wallet.currency === "USDT" ? "₮" : wallet.currency[0]}</i><div class="wallet-menu"><button data-edit-wallet="${wallet.id}" type="button" title="Изменить">✎</button><button data-delete-wallet="${wallet.id}" type="button" title="Удалить">×</button></div></div>
    <div class="wallet-card-body"><small>${escapeHtml(wallet.name)} · ${wallet.currency}</small><h3>${formatWallet(wallet.balance, wallet.currency)}</h3><p>≈ ${formatRub(walletToRub(wallet))}</p></div>
  </article>`).join("");
  $("#walletsGrid").innerHTML = `${cards}<button class="add-wallet-card" id="addWalletCard" type="button"><div><span>＋</span><strong>Добавить кошелёк</strong></div></button>`;
}

function renderLimits() {
  $("#limitsGrid").innerHTML = Object.entries(CATEGORIES).map(([key, category]) => {
    const limit = getLimit(key);
    const spent = monthlyCategorySpend(key);
    const percent = limit.amount ? Math.round((spent / limitInVnd(limit)) * 100) : 0;
    const statusClass = percent >= 100 ? "is-over" : percent >= 80 ? "is-warning" : "";
    return `<article class="limit-card"><div class="limit-card-head"><i class="category-icon" style="background:${category.soft};color:${category.color}">${category.icon}</i><span><strong>${category.name}</strong><small>Потрачено ${formatVnd(spent, true)} · ≈ ${formatRub(spent * state.rates.vndRub)}</small></span></div><div class="progress ${statusClass}"><span style="width:${Math.min(percent, 100)}%"></span></div><div class="limit-controls"><label class="limit-input"><span class="sr-only">Лимит: ${category.name}</span><input data-limit-category="${key}" type="number" min="0" step="${limit.currency === "RUB" ? "0.01" : "1"}" value="${limit.amount || ""}" placeholder="Без лимита"></label><label class="limit-currency"><span class="sr-only">Валюта лимита: ${category.name}</span><select data-limit-currency="${key}"><option value="VND" ${limit.currency === "VND" ? "selected" : ""}>₫ VND</option><option value="RUB" ${limit.currency === "RUB" ? "selected" : ""}>₽ RUB</option></select></label></div><p class="limit-conversion" data-limit-conversion="${key}">${limitEquivalent(limit.amount, limit.currency)}</p></article>`;
  }).join("");
}

function populateWalletSelect() {
  const select = $("#expenseWallet");
  const current = select.value;
  select.innerHTML = state.wallets.map((wallet) => `<option value="${wallet.id}">${escapeHtml(wallet.name)} · ${formatWallet(wallet.balance, wallet.currency)}</option>`).join("");
  if (state.wallets.some((wallet) => wallet.id === current)) select.value = current;
  else if (state.wallets.some((wallet) => wallet.id === "cash-vnd")) select.value = "cash-vnd";
}

function populateIncomeWalletSelect() {
  const select = $("#incomeWallet");
  const current = select.value;
  select.innerHTML = state.wallets.map((wallet) => `<option value="${wallet.id}">${escapeHtml(wallet.name)} · ${formatWallet(wallet.balance, wallet.currency)}</option>`).join("");
  if (state.wallets.some((wallet) => wallet.id === current)) select.value = current;
  else if (state.wallets.some((wallet) => wallet.id === "cash-vnd")) select.value = "cash-vnd";
}

function switchView(view) {
  activeView = view;
  $$("[data-view-panel]").forEach((panel) => panel.classList.toggle("is-active", panel.dataset.viewPanel === view));
  $$("[data-view]").forEach((button) => button.classList.toggle("is-active", button.dataset.view === view));
  const titles = { dashboard: ["Финансовый помощник", greeting()], expenses: ["История операций", "Расходы"], income: ["История поступлений", "Прибыль"], wallets: ["Ваши деньги", "Кошельки"], limits: ["Бюджет по категориям", "Лимиты"], settings: ["Данные и валюта", "Настройки"] };
  $("#pageEyebrow").textContent = titles[view][0];
  $("#pageTitle").textContent = titles[view][1];
  const addLabel = view === "income" ? "Добавить доход" : "Добавить расход";
  $("#openExpenseButton").innerHTML = `<span aria-hidden="true">＋</span> ${addLabel}`;
  $("#mobileExpenseButton").setAttribute("aria-label", addLabel);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 6) return "Доброй ночи";
  if (hour < 12) return "Доброе утро";
  if (hour < 18) return "Добрый день";
  return "Добрый вечер";
}

function openExpenseModal() {
  if (!state.wallets.length) {
    showToast("Сначала добавьте кошелёк", true);
    switchView("wallets");
    return;
  }
  $("#expenseForm").reset();
  $("#expenseDate").value = localDateString();
  populateWalletSelect();
  updateAmountConversion();
  $("#expenseModal").showModal();
  setTimeout(() => $("#expenseAmount").focus(), 50);
}

function openPrimaryModal() {
  if (activeView === "income") openIncomeModal();
  else openExpenseModal();
}

function openIncomeModal() {
  if (!state.wallets.length) {
    showToast("Сначала добавьте кошелёк", true);
    switchView("wallets");
    return;
  }
  $("#incomeForm").reset();
  $("#incomeDate").value = localDateString();
  populateIncomeWalletSelect();
  const wallet = state.wallets.find((item) => item.id === $("#incomeWallet").value);
  $("#incomeCurrency").value = wallet?.currency || "VND";
  updateIncomeConversion();
  $("#incomeModal").showModal();
  setTimeout(() => $("#incomeAmount").focus(), 50);
}

function updateIncomeConversion() {
  const amount = parseAmount($("#incomeAmount").value);
  const currency = $("#incomeCurrency").value;
  const wallet = state.wallets.find((item) => item.id === $("#incomeWallet").value);
  $("#incomeAmountSymbol").textContent = { VND: "₫", RUB: "₽", USD: "$", USDT: "₮" }[currency];
  const rub = convertCurrency(amount, currency, "RUB");
  const vnd = convertCurrency(amount, currency, "VND");
  $("#incomeConversion").textContent = currency === "VND"
    ? `≈ ${formatRub(rub)}`
    : currency === "RUB" ? `≈ ${formatVnd(vnd)}` : `≈ ${formatRub(rub)} · ${formatVnd(vnd)}`;
  const walletCredit = wallet ? roundForCurrency(convertCurrency(amount, currency, wallet.currency), wallet.currency) : 0;
  $("#incomeWalletPreview").textContent = wallet
    ? `На «${wallet.name}» поступит ${formatWallet(walletCredit, wallet.currency)}${wallet.currency !== currency ? " по текущему курсу" : ""}`
    : "Выберите кошелёк для зачисления";
}

function updateAmountConversion() {
  const amount = parseAmount($("#expenseAmount").value);
  $("#amountConversion").textContent = `≈ ${formatRub(amount * state.rates.vndRub)}`;
}

function addExpense(event) {
  event.preventDefault();
  const amount = parseAmount($("#expenseAmount").value);
  const wallet = state.wallets.find((item) => item.id === $("#expenseWallet").value);
  if (!amount || amount <= 0 || !wallet) {
    showToast("Проверьте сумму и способ оплаты", true);
    return;
  }
  const walletDebit = vndToWallet(amount, wallet.currency);
  const expense = {
    id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
    amountVnd: Math.round(amount),
    rateVndRub: state.rates.vndRub,
    date: $("#expenseDate").value,
    category: $("#expenseCategory").value,
    walletId: wallet.id,
    walletDebit,
    note: $("#expenseNote").value.trim(),
    createdAt: new Date().toISOString(),
  };
  state.expenses.push(expense);
  wallet.balance -= walletDebit;
  saveState();
  $("#expenseModal").close();
  renderAll();
  showToast(`Расход ${formatVnd(amount)} добавлен`);
  warnIfLimitExceeded(expense.category);
}

function addIncome(event) {
  event.preventDefault();
  const currency = $("#incomeCurrency").value;
  const amount = roundForCurrency(parseAmount($("#incomeAmount").value), currency);
  const wallet = state.wallets.find((item) => item.id === $("#incomeWallet").value);
  if (!Number.isFinite(amount) || amount <= 0 || !wallet || !INCOME_SOURCES[$("#incomeSource").value]) {
    showToast("Проверьте сумму, источник и кошелёк", true);
    return;
  }
  const walletCredit = roundForCurrency(convertCurrency(amount, currency, wallet.currency), wallet.currency);
  const amountVnd = convertCurrency(amount, currency, "VND");
  const amountRub = convertCurrency(amount, currency, "RUB");
  if (!Number.isFinite(walletCredit) || walletCredit <= 0 || !Number.isFinite(amountVnd) || !Number.isFinite(amountRub)) {
    showToast("Сумма слишком мала для зачисления в выбранной валюте", true);
    return;
  }
  const income = {
    id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
    amount,
    currency,
    amountVnd,
    amountRub,
    rateVndRub: state.rates.vndRub,
    rateVndUsd: state.rates.vndUsd,
    date: $("#incomeDate").value,
    source: $("#incomeSource").value,
    walletId: wallet.id,
    walletCurrency: wallet.currency,
    walletCredit,
    note: $("#incomeNote").value.trim(),
    createdAt: new Date().toISOString(),
  };
  state.incomes.push(income);
  wallet.balance = roundForCurrency(wallet.balance + walletCredit, wallet.currency);
  saveState();
  $("#incomeModal").close();
  renderAll();
  showToast(`Доход ${formatWallet(amount, currency)} добавлен`);
}

function warnIfLimitExceeded(category) {
  const limit = getLimit(category);
  if (!limit.amount) return;
  const limitVnd = limitInVnd(limit);
  const spent = monthlyCategorySpend(category);
  if (spent >= limitVnd) setTimeout(() => showToast(`${CATEGORIES[category].name}: месячный лимит превышен`, true), 350);
  else if (spent >= limitVnd * 0.8) setTimeout(() => showToast(`${CATEGORIES[category].name}: использовано ${Math.round((spent / limitVnd) * 100)}% лимита`), 350);
}

function deleteExpense(id) {
  const expense = state.expenses.find((item) => item.id === id);
  if (!expense || !window.confirm("Удалить расход? Списанная сумма вернётся в кошелёк.")) return;
  const wallet = state.wallets.find((item) => item.id === expense.walletId);
  if (wallet) wallet.balance += Number(expense.walletDebit ?? vndToWallet(expense.amountVnd, wallet.currency));
  state.expenses = state.expenses.filter((item) => item.id !== id);
  saveState();
  renderAll();
  showToast("Расход удалён, баланс восстановлен");
}

function deleteIncome(id) {
  const income = state.incomes.find((item) => item.id === id);
  if (!income || !window.confirm("Удалить доход? Зачисленная сумма будет вычтена из кошелька.")) return;
  const wallet = state.wallets.find((item) => item.id === income.walletId);
  if (wallet && wallet.currency === income.walletCurrency) {
    wallet.balance = roundForCurrency(wallet.balance - income.walletCredit, wallet.currency);
  }
  state.incomes = state.incomes.filter((item) => item.id !== id);
  saveState();
  renderAll();
  showToast(wallet && wallet.currency === income.walletCurrency ? "Доход удалён, баланс восстановлен" : "Доход удалён");
}

function openWalletModal(wallet = null) {
  $("#walletForm").reset();
  $("#walletEditId").value = wallet?.id || "";
  $("#walletModalTitle").textContent = wallet ? "Изменить кошелёк" : "Добавить кошелёк";
  const used = wallet && (state.expenses.some((item) => item.walletId === wallet.id) || state.incomes.some((item) => item.walletId === wallet.id));
  $("#walletCurrency").disabled = Boolean(used);
  $("#walletCurrencyHint").hidden = !used;
  if (wallet) {
    $("#walletName").value = wallet.name;
    $("#walletCurrency").value = wallet.currency;
    $("#walletBalance").value = wallet.balance;
  }
  $("#walletModal").showModal();
}

function saveWallet(event) {
  event.preventDefault();
  const id = $("#walletEditId").value;
  const existing = state.wallets.find((item) => item.id === id);
  const data = { name: $("#walletName").value.trim(), currency: $("#walletCurrency").disabled ? existing.currency : $("#walletCurrency").value, balance: Number($("#walletBalance").value) || 0 };
  if (id) Object.assign(state.wallets.find((item) => item.id === id), data);
  else state.wallets.push({ id: crypto.randomUUID ? crypto.randomUUID() : `wallet-${Date.now()}`, ...data });
  saveState();
  $("#walletModal").close();
  renderAll();
  showToast(id ? "Кошелёк обновлён" : "Кошелёк добавлен");
}

function deleteWallet(id) {
  const wallet = state.wallets.find((item) => item.id === id);
  if (!wallet) return;
  const used = state.expenses.some((item) => item.walletId === id) || state.incomes.some((item) => item.walletId === id);
  const message = used ? "Этот кошелёк есть в истории операций. Удалить его? Записи сохранятся." : "Удалить кошелёк?";
  if (!window.confirm(message)) return;
  state.wallets = state.wallets.filter((item) => item.id !== id);
  saveState();
  renderAll();
  showToast("Кошелёк удалён");
}

async function updateRates(force = false) {
  const today = localDateString();
  if (!force && (state.rates.fetchedAt === today || (state.rates.source === "manual" && state.rates.date === today))) return;
  $("#rateLabel").textContent = "Обновляю курс…";
  const endpoints = [
    "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/vnd.min.json",
    "https://latest.currency-api.pages.dev/v1/currencies/vnd.min.json",
  ];
  const results = await Promise.allSettled(endpoints.map(async (endpoint) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(endpoint, { cache: "no-store", signal: controller.signal });
      if (!response.ok) throw new Error("Rate request failed");
      const data = await response.json();
      if (!data?.vnd?.rub || !data?.vnd?.usd) throw new Error("Invalid rate data");
      return data;
    } finally {
      clearTimeout(timeout);
    }
  }));
  const available = results.filter((result) => result.status === "fulfilled").map((result) => result.value);
  if (available.length) {
    const newest = available.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))[0];
    state.rates = { vndRub: newest.vnd.rub, vndUsd: newest.vnd.usd, date: newest.date || today, fetchedAt: today, source: "auto" };
    saveState();
    renderAll();
    if (force) showToast("Курс валют обновлён");
    return;
  }
  results.forEach((result, index) => console.warn("Currency endpoint unavailable", endpoints[index], result.reason));
  renderRate();
  if (force) showToast("Не удалось обновить курс — используется сохранённый", true);
}

function saveManualRate() {
  const value = Number($("#manualRate").value);
  if (!value || value <= 0) return showToast("Введите корректный курс", true);
  state.rates.vndRub = value;
  state.rates.date = localDateString();
  state.rates.fetchedAt = localDateString();
  state.rates.source = "manual";
  saveState();
  renderAll();
  showToast("Ручной курс сохранён");
}

function exportData() {
  const blob = new Blob([JSON.stringify({ ...state, exportedAt: new Date().toISOString() }, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `dongle-backup-${localDateString()}.json`;
  link.click();
  URL.revokeObjectURL(url);
  showToast("Резервная копия скачана");
}

async function importData(file) {
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data.expenses) || !Array.isArray(data.wallets)) throw new Error("Invalid backup");
    if (!window.confirm("Заменить текущие данные содержимым резервной копии?")) return;
    state = { ...cloneDefaultState(), ...data, incomes: Array.isArray(data.incomes) ? data.incomes : [], limits: { ...DEFAULT_STATE.limits, ...(data.limits || {}) }, rates: { ...DEFAULT_STATE.rates, ...(data.rates || {}) } };
    saveState();
    renderAll();
    showToast("Резервная копия загружена");
  } catch {
    showToast("Не удалось прочитать файл резервной копии", true);
  } finally {
    $("#importInput").value = "";
  }
}

function resetData() {
  if (!window.confirm("Точно удалить все данные Dongle из этого браузера?")) return;
  state = cloneDefaultState();
  saveState();
  renderAll();
  switchView("dashboard");
  showToast("Все данные удалены");
}

function showToast(message, isError = false) {
  const toast = document.createElement("div");
  toast.className = `toast${isError ? " is-error" : ""}`;
  toast.textContent = message;
  $("#toastRegion").append(toast);
  setTimeout(() => toast.remove(), 3600);
}

function bindEvents() {
  $$("[data-view]").forEach((button) => button.addEventListener("click", () => switchView(button.dataset.view)));
  $$("[data-go-view]").forEach((button) => button.addEventListener("click", () => switchView(button.dataset.goView)));
  $$(".period-button").forEach((button) => button.addEventListener("click", () => {
    activePeriod = button.dataset.period;
    $$(".period-button").forEach((item) => item.classList.toggle("is-active", item === button));
    renderDashboard();
  }));
  $("#openExpenseButton").addEventListener("click", openPrimaryModal);
  $("#mobileExpenseButton").addEventListener("click", openPrimaryModal);
  $("#mobileSettingsButton").addEventListener("click", () => switchView("settings"));
  $("#expenseForm").addEventListener("submit", addExpense);
  $("#expenseAmount").addEventListener("input", updateAmountConversion);
  $("#incomeForm").addEventListener("submit", addIncome);
  $("#incomeAmount").addEventListener("input", updateIncomeConversion);
  $("#incomeCurrency").addEventListener("change", updateIncomeConversion);
  $("#incomeWallet").addEventListener("change", () => {
    if (!$("#incomeAmount").value.trim()) {
      const wallet = state.wallets.find((item) => item.id === $("#incomeWallet").value);
      if (wallet) $("#incomeCurrency").value = wallet.currency;
    }
    updateIncomeConversion();
  });
  $("#openWalletButton").addEventListener("click", () => openWalletModal());
  $("#addWalletHome").addEventListener("click", () => openWalletModal());
  $("#walletForm").addEventListener("submit", saveWallet);
  $$("[data-close-modal]").forEach((button) => button.addEventListener("click", () => $("#" + button.dataset.closeModal).close()));
  $("#prevMonth").addEventListener("click", () => { reportDate = new Date(reportDate.getFullYear(), reportDate.getMonth() - 1, 1); renderExpensesReport(); });
  $("#nextMonth").addEventListener("click", () => { reportDate = new Date(reportDate.getFullYear(), reportDate.getMonth() + 1, 1); renderExpensesReport(); });
  $("#expenseSearch").addEventListener("input", renderExpensesReport);
  $("#prevIncomeMonth").addEventListener("click", () => { incomeReportDate = new Date(incomeReportDate.getFullYear(), incomeReportDate.getMonth() - 1, 1); renderIncomeReport(); });
  $("#nextIncomeMonth").addEventListener("click", () => { incomeReportDate = new Date(incomeReportDate.getFullYear(), incomeReportDate.getMonth() + 1, 1); renderIncomeReport(); });
  $("#incomeSearch").addEventListener("input", renderIncomeReport);
  $("#rateButton").addEventListener("click", () => updateRates(true));
  $("#autoRateButton").addEventListener("click", () => updateRates(true));
  $("#saveRateButton").addEventListener("click", saveManualRate);
  $("#exportButton").addEventListener("click", exportData);
  $("#importInput").addEventListener("change", (event) => importData(event.target.files[0]));
  $("#resetButton").addEventListener("click", resetData);

  document.addEventListener("click", (event) => {
    const deleteExpenseButton = event.target.closest("[data-delete-expense]");
    if (deleteExpenseButton) deleteExpense(deleteExpenseButton.dataset.deleteExpense);
    const deleteIncomeButton = event.target.closest("[data-delete-income]");
    if (deleteIncomeButton) deleteIncome(deleteIncomeButton.dataset.deleteIncome);
    const editWalletButton = event.target.closest("[data-edit-wallet]");
    if (editWalletButton) openWalletModal(state.wallets.find((item) => item.id === editWalletButton.dataset.editWallet));
    const deleteWalletButton = event.target.closest("[data-delete-wallet]");
    if (deleteWalletButton) deleteWallet(deleteWalletButton.dataset.deleteWallet);
    if (event.target.closest("#addWalletCard")) openWalletModal();
  });

  $("#limitsGrid").addEventListener("input", (event) => {
    const key = event.target.dataset.limitCategory;
    if (!key) return;
    const currency = $("[data-limit-currency='" + key + "']").value;
    $("[data-limit-conversion='" + key + "']").textContent = limitEquivalent(Math.max(0, Number(event.target.value) || 0), currency);
  });
  $("#limitsGrid").addEventListener("change", (event) => {
    const amountKey = event.target.dataset.limitCategory;
    const currencyKey = event.target.dataset.limitCurrency;
    if (!amountKey && !currencyKey) return;
    const key = amountKey || currencyKey;
    const previous = getLimit(key);
    const currency = currencyKey ? event.target.value : previous.currency;
    let amount = amountKey ? Math.max(0, Number(event.target.value) || 0) : previous.amount;
    if (currencyKey && previous.currency !== currency && amount > 0) {
      amount = currency === "RUB"
        ? Math.round(amount * state.rates.vndRub * 100) / 100
        : Math.round(amount / state.rates.vndRub);
    }
    state.limits[key] = { amount, currency };
    saveState();
    renderAll();
    showToast("Лимит сохранён");
  });
}

function init() {
  $("#pageTitle").textContent = greeting();
  $("#expenseCategory").innerHTML = Object.entries(CATEGORIES).map(([key, value]) => `<option value="${key}">${value.name}</option>`).join("");
  $("#incomeSource").innerHTML = Object.entries(INCOME_SOURCES).map(([key, value]) => `<option value="${key}">${value.name}</option>`).join("");
  bindEvents();
  renderAll();
  updateRates(false);
}

init();
