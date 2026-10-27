import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount } from "../account/AccountContext";
import { accountApi, type AdminApiKey, type AdminGeneration, type AdminOrder, type AdminOverview, type AdminPromo, type AdminTariff, type AdminUser } from "../account/accountApi";
import { CabinetFooter, CabinetHeader } from "../cabinet/CabinetHeader";
import type { CabinetRoute } from "../routes";

/**
 * Admin panel.
 *
 * Muhim: bu yerdagi "isAdmin" faqat KO'RSATISH uchun. Haqiqiy himoya
 * serverda: har bir /api/admin so'rovi pochtani ADMIN_EMAILS ro'yxati
 * bilan solishtiradi. Frontendga ishonib bo'lmaydi — uni brauzerda
 * o'zgartirish mumkin.
 */

type Tab = "overview" | "users" | "promos" | "apikeys" | "generations" | "orders";

/** Быстрое действие с обзора: какую вкладку открыть и что там сразу сфокусировать. */
type Intent = "promo" | "apikey" | "balance";
const INTENT_TAB: Record<Intent, Tab> = { promo: "promos", apikey: "apikeys", balance: "users" };

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "overview", label: "Обзор" },
  { id: "users", label: "Пользователи" },
  { id: "promos", label: "Промокоды" },
  { id: "apikeys", label: "API ключи" },
  { id: "generations", label: "Генерации" },
  { id: "orders", label: "Заказы" },
];

const nf = (value: number) => value.toLocaleString("ru-RU").replace(/,/g, " ");
const shortDate = (iso: string | null) => (iso ? new Date(iso).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");

/**
 * Встроенная таблица тарифов — на случай, если /api/admin/tariffs недоступен
 * (старый сервер). Источник правды — billing/pricing.py: TARIFFS.
 * 1 картинка = 1 токен.
 */
const FALLBACK_TARIFFS: AdminTariff[] = [
  { id: "start", name: "Start", priceUzs: 89_000, images: 21, tokens: 21 },
  { id: "standart", name: "Standart", priceUzs: 199_000, images: 52, tokens: 52 },
  { id: "profi", name: "Profi", priceUzs: 399_000, images: 117, tokens: 117 },
  { id: "maksimum", name: "Maksimum", priceUzs: 599_000, images: 195, tokens: 195 },
];

const CUSTOM = "custom";
const tokens = (n: number) => `${n} ${plural(n, "токен", "токена", "токенов")}`;

function useTariffs(): AdminTariff[] {
  const [tariffs, setTariffs] = useState<AdminTariff[]>(FALLBACK_TARIFFS);
  useEffect(() => {
    let alive = true;
    accountApi.admin.tariffs()
      .then((result) => { if (alive && result.tariffs?.length) setTariffs(result.tariffs); })
      .catch(() => { /* остаёмся на встроенной таблице */ });
    return () => { alive = false; };
  }, []);
  return tariffs;
}

/** «Свободно» + кнопка на каждый тариф. Выбор тарифа фиксирует количество токенов. */
function TariffPicker({ tariffs, value, onChange, legend, freeHint }: { tariffs: AdminTariff[]; value: string; onChange: (id: string) => void; legend: string; freeHint: string }) {
  return <fieldset className="admin-tariffs">
    <legend>{legend}</legend>
    <div className="admin-tariff-options">
      <button type="button" aria-pressed={value === CUSTOM} onClick={() => onChange(CUSTOM)}>
        <b>Свободно</b><span>{freeHint}</span>
      </button>
      {tariffs.map((tariff) => <button key={tariff.id} type="button" aria-pressed={value === tariff.id} onClick={() => onChange(tariff.id)}>
        <b>{tariff.name}</b><span>{nf(tariff.priceUzs)} сум · {tariff.images} {plural(tariff.images, "картинка", "картинки", "картинок")}</span>
      </button>)}
    </div>
  </fieldset>;
}

function plural(n: number, one: string, few: string, many: string) {
  const mod10 = n % 10, mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

export function AdminPage({ onNavigate, onLogout }: { onNavigate: (route: CabinetRoute) => void; onLogout?: () => void }) {
  const { account } = useAccount();
  const [tab, setTab] = useState<Tab>("overview");
  const [error, setError] = useState("");
  const [intent, setIntent] = useState<Intent | null>(null);
  const runQuick = (next: Intent) => { setIntent(next); setTab(INTENT_TAB[next]); setError(""); };

  if (!account) return null;
  if (!account.isAdmin) {
    return <main className="reference-app cabinet-page">
      <CabinetHeader route="admin" balance={account.balance} onNavigate={onNavigate} onLogout={onLogout} />
      <section className="cabinet-content">
        <div className="cabinet-panel"><h2>Раздел недоступен</h2><p>Этот аккаунт не входит в список администраторов.</p></div>
      </section>
      <CabinetFooter onNavigate={onNavigate} />
    </main>;
  }

  return <main className="reference-app cabinet-page">
    <CabinetHeader route="admin" balance={account.balance} onNavigate={onNavigate} onLogout={onLogout} />
    <section className="cabinet-content">
      <div className="cabinet-page-heading">
        <div>
          <p className="eyebrow">АДМИНИСТРИРОВАНИЕ</p>
          <h1>Панель управления</h1>
        </div>
      </div>

      <div className="admin-tabs" role="tablist">
        {TABS.map((item) => <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} onClick={() => { setTab(item.id); setIntent(null); setError(""); }}>{item.label}</button>)}
      </div>

      {error && <p className="inline-warning" role="alert">{error}</p>}

      {tab === "overview" && <OverviewTab onError={setError} onQuick={runQuick} />}
      {tab === "users" && <UsersTab onError={setError} focusSearch={intent === "balance"} />}
      {tab === "promos" && <PromosTab onError={setError} focusForm={intent === "promo"} />}
      {tab === "apikeys" && <ApiKeysTab onError={setError} startCreate={intent === "apikey"} />}
      {tab === "generations" && <GenerationsTab onError={setError} />}
      {tab === "orders" && <OrdersTab onError={setError} />}
    </section>
    <CabinetFooter onNavigate={onNavigate} />
  </main>;
}

/** Общая обвязка: загрузка + показ ошибки, чтобы не повторять в каждой вкладке. */
function useLoader<T>(load: () => Promise<T>, onError: (message: string) => void) {
  const [data, setData] = useState<T | null>(null);
  const [busy, setBusy] = useState(true);
  const run = useCallback(() => {
    setBusy(true);
    load()
      .then((result) => { setData(result); onError(""); })
      .catch((reason) => onError(reason instanceof Error ? reason.message : "Не удалось загрузить"))
      .finally(() => setBusy(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { run(); }, [run]);
  return { data, busy, reload: run };
}

function tariffCodes(byTariff?: Record<string, number>) {
  if (!byTariff) return "";
  const n = Object.entries(byTariff).reduce((sum, [id, count]) => id === CUSTOM ? sum : sum + count, 0);
  return n ? ` · по тарифам: ${n}` : "";
}

/** Кнопки самых частых действий — один клик до нужной формы. */
function QuickActions({ onQuick }: { onQuick: (intent: Intent) => void }) {
  return <div className="admin-quick" aria-label="Быстрые действия">
    <button type="button" onClick={() => onQuick("promo")}><span aria-hidden="true">%</span><b>Создать промокод</b><small>по тарифу или любая сумма</small></button>
    <button type="button" onClick={() => onQuick("apikey")}><span aria-hidden="true">⚿</span><b>Создать API ключ</b><small>ключ показывается один раз</small></button>
    <button type="button" onClick={() => onQuick("balance")}><span aria-hidden="true">+</span><b>Начислить токены</b><small>найти пользователя по почте</small></button>
  </div>;
}

function OverviewTab({ onError, onQuick }: { onError: (message: string) => void; onQuick: (intent: Intent) => void }) {
  const { data, busy } = useLoader<AdminOverview>(() => accountApi.admin.overview(), onError);
  if (busy || !data) return <><QuickActions onQuick={onQuick} /><p className="admin-loading">Загружаю…</p></>;

  const cards = [
    { label: "Пользователей", value: nf(data.users.total), hint: `${data.users.withBalance} с балансом` },
    { label: "Через Google", value: nf(data.users.withGoogle), hint: `Telegram: ${data.users.withTelegram}` },
    { label: "Токенов на руках", value: nf(data.tokens.inCirculation), hint: `Списано: ${nf(data.tokens.spent)}` },
    { label: "Генераций всего", value: nf(data.jobs.total), hint: `За сутки: ${data.jobs.lastDay}` },
    { label: "Неудачных", value: nf(data.jobs.failed), hint: data.jobs.total ? `${Math.round(100 * data.jobs.failed / data.jobs.total)}% от всех` : "—" },
    { label: "Промокодов", value: nf(data.promos.total), hint: `Активаций: ${data.promos.redemptions}${tariffCodes(data.promos.byTariff)}` },
  ];

  return <>
    <QuickActions onQuick={onQuick} />
    <div className="admin-cards">
      {cards.map((card) => <article className="admin-card" key={card.label}>
        <span>{card.label}</span><b>{card.value}</b><small>{card.hint}</small>
      </article>)}
    </div>
    <section className="cabinet-panel admin-note">
      <h3>Экономика</h3>
      <p>Себестоимость одной картинки — <b>{nf(data.costs.perImageUzs)} сум</b>, продаём от <b>{nf(data.costs.tokenPriceUzs)} сум</b>.</p>
      <p className="admin-hint">Токены на руках — это обязательство: люди уже заплатили, а картинки ещё не сгенерировали. При {nf(data.tokens.inCirculation)} токенах ваш будущий расход на API составит около {nf(data.tokens.inCirculation * data.costs.perImageUzs)} сум.</p>
    </section>
  </>;
}

function UsersTab({ onError, focusSearch }: { onError: (message: string) => void; focusSearch?: boolean }) {
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (focusSearch) searchRef.current?.focus(); }, [focusSearch]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [busy, setBusy] = useState(true);

  const load = useCallback((q: string) => {
    setBusy(true);
    accountApi.admin.users(q)
      .then((result) => setUsers(result.users))
      .catch((reason) => onError(reason instanceof Error ? reason.message : "Не удалось загрузить"))
      .finally(() => setBusy(false));
  }, [onError]);

  useEffect(() => { load(""); }, [load]);

  const tariffs = useTariffs();
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [adjust, setAdjust] = useState({ tariff: CUSTOM, amount: "10", reason: "" });
  const [saving, setSaving] = useState(false);
  const adjustTariff = tariffs.find((item) => item.id === adjust.tariff) ?? null;

  const openEditor = (user: AdminUser) => {
    setEditing(user);
    setAdjust({ tariff: CUSTOM, amount: "10", reason: "" });
  };

  const apply = async () => {
    if (!editing) return;
    const amount = adjustTariff ? adjustTariff.tokens : Number(adjust.amount);
    if (!adjustTariff && (!Number.isFinite(amount) || amount === 0)) { onError("Введите число, не равное нулю"); return; }
    setSaving(true);
    try {
      // По тарифу сервер сам берёт сумму из тарифа и пишет «Tarif: <имя>» в историю.
      const result = await accountApi.admin.setBalance(editing.id, amount, adjust.reason.trim(), adjustTariff?.id);
      setUsers((current) => current.map((item) => item.id === editing.id ? { ...item, balance: result.balance } : item));
      setEditing(null);
      onError("");
    } catch (reason_) {
      onError(reason_ instanceof Error ? reason_.message : "Не удалось изменить баланс");
    } finally { setSaving(false); }
  };

  return <section className="cabinet-panel">
    <div className="admin-toolbar">
      <input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") load(query); }} placeholder="Поиск по почте или имени" />
      <button type="button" className="button secondary" onClick={() => load(query)}>Найти</button>
    </div>
    {focusSearch && !editing && <p className="admin-hint">Найдите пользователя и нажмите «Начислить» в его строке.</p>}
    {editing && <div className="admin-balance-editor">
      <h3>Баланс: {editing.email} <small>сейчас {editing.balance}</small></h3>
      <TariffPicker tariffs={tariffs} value={adjust.tariff} onChange={(tariff) => setAdjust({ ...adjust, tariff })} legend="Начислить по тарифу (необязательно)" freeHint="ввожу сумму сам" />
      <div className="admin-form-grid">
        <label>{adjustTariff ? "Начислить" : "Сколько токенов (минус — списать)"}
          {adjustTariff
            ? <input value={tokens(adjustTariff.tokens)} readOnly disabled title="Количество задано тарифом" />
            : <input type="number" value={adjust.amount} onChange={(event) => setAdjust({ ...adjust, amount: event.target.value })} />}
        </label>
        <label>Причина (видна в истории)<input value={adjust.reason} onChange={(event) => setAdjust({ ...adjust, reason: event.target.value })} placeholder={adjustTariff ? `Tarif: ${adjustTariff.name}` : "Начисление администратором"} maxLength={80} /></label>
      </div>
      <div className="admin-actions">
        <button type="button" className="button primary" disabled={saving} onClick={() => void apply()}>{saving ? "Сохраняю…" : adjustTariff ? `Начислить ${tokens(adjustTariff.tokens)}` : "Применить"}</button>
        <button type="button" className="button secondary" onClick={() => setEditing(null)}>Отмена</button>
      </div>
    </div>}
    {busy ? <p className="admin-loading">Загружаю…</p> : <div className="admin-table-wrap"><table className="admin-table">
      <thead><tr><th>Почта</th><th>Имя</th><th>Вход</th><th>Баланс</th><th>Генераций</th><th /></tr></thead>
      <tbody>
        {users.map((user) => <tr key={user.id}>
          <td>{user.email}</td>
          <td>{user.name || "—"}</td>
          <td>{user.providers.length ? user.providers.join(", ") : "email"}</td>
          <td><b>{user.balance}</b></td>
          <td>{user.jobs}</td>
          <td><button type="button" className="textbtn" onClick={() => openEditor(user)}>{focusSearch ? "Начислить" : "Изменить баланс"}</button></td>
        </tr>)}
        {!users.length && <tr><td colSpan={6}>Никого не нашлось.</td></tr>}
      </tbody>
    </table></div>}
  </section>;
}

function PromosTab({ onError, focusForm }: { onError: (message: string) => void; focusForm?: boolean }) {
  const codeRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!focusForm) return;
    codeRef.current?.scrollIntoView({ block: "center" });
    codeRef.current?.focus({ preventScroll: true });
  }, [focusForm]);
  const { data, busy, reload } = useLoader<{ promos: AdminPromo[] }>(() => accountApi.admin.promos(), onError);
  const tariffs = useTariffs();
  const emptyForm = { tariff: CUSTOM, code: "", kind: "tokens", value: "10", maxUses: "0", owner: "", expiresAt: "" };
  const [form, setForm] = useState(emptyForm);
  // Значения «свободного» режима, чтобы вернуть их при выходе из тарифа.
  const [freeValues, setFreeValues] = useState({ kind: "tokens", value: "10" });
  const [saving, setSaving] = useState(false);
  const formTariff = tariffs.find((item) => item.id === form.tariff) ?? null;

  const pickTariff = (id: string) => {
    const tariff = tariffs.find((item) => item.id === id);
    if (tariff) {
      if (!formTariff) setFreeValues({ kind: form.kind, value: form.value });
      setForm({ ...form, tariff: id, kind: "tokens", value: String(tariff.tokens) });
    } else {
      setForm({ ...form, tariff: CUSTOM, ...freeValues });
    }
  };

  const create = async () => {
    setSaving(true);
    try {
      await accountApi.admin.createPromo({
        code: form.code,
        // По тарифу сервер сам ставит kind=tokens и value из тарифа.
        tariff: formTariff ? formTariff.id : CUSTOM,
        kind: formTariff ? "tokens" : form.kind,
        value: formTariff ? formTariff.tokens : Number(form.value),
        maxUses: Number(form.maxUses),
        owner: form.owner,
        expiresAt: form.expiresAt || undefined,
      });
      setForm(emptyForm);
      setFreeValues({ kind: "tokens", value: "10" });
      reload();
      onError("");
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : "Не удалось создать промокод");
    } finally { setSaving(false); }
  };

  const toggle = async (promo: AdminPromo) => {
    try { await accountApi.admin.updatePromo(promo.code, { active: !promo.active }); reload(); }
    catch (reason) { onError(reason instanceof Error ? reason.message : "Не удалось изменить"); }
  };

  const remove = async (promo: AdminPromo) => {
    if (!window.confirm(`Удалить промокод ${promo.code}?`)) return;
    try {
      const result = await accountApi.admin.deletePromo(promo.code);
      if (result.disabledInsteadOfDeleted) onError("Код уже активировали, поэтому он не удалён, а выключен — статистика блогера сохранится.");
      reload();
    } catch (reason) { onError(reason instanceof Error ? reason.message : "Не удалось удалить"); }
  };

  return <>
    <section className="cabinet-panel admin-promo-form">
      <h3>Новый промокод</h3>
      <p className="admin-hint">Для блогера удобно ставить его имя в код и в поле «Кому выдан» — потом в таблице видно, кто сколько привёл.</p>
      <TariffPicker tariffs={tariffs} value={form.tariff} onChange={pickTariff} legend="Тариф" freeHint="ввожу сам: любая сумма" />
      {formTariff && <p className="admin-hint">Код даст {tokens(formTariff.tokens)} — как тариф {formTariff.name} ({nf(formTariff.priceUzs)} сум). Название кода — любое.</p>}
      <div className="admin-form-grid">
        <label>Код<input ref={codeRef} value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value.toUpperCase() })} placeholder="DILBAR10" maxLength={24} /></label>
        <label>Что даёт
          <select value={form.kind} disabled={!!formTariff} onChange={(event) => setForm({ ...form, kind: event.target.value })}>
            <option value="tokens">Токены на счёт</option>
            <option value="discount">Скидку на покупку, %</option>
          </select>
        </label>
        <label>{form.kind === "tokens" ? "Сколько токенов" : "Скидка, %"}
          {formTariff
            ? <input value={tokens(formTariff.tokens)} readOnly disabled title="Количество задано тарифом" />
            : <input type="number" min={1} value={form.value} onChange={(event) => setForm({ ...form, value: event.target.value })} />}
        </label>
        <label>Лимит активаций<input type="number" min={0} value={form.maxUses} onChange={(event) => setForm({ ...form, maxUses: event.target.value })} placeholder="0 — без лимита" /></label>
        <label>Кому выдан<input value={form.owner} onChange={(event) => setForm({ ...form, owner: event.target.value })} placeholder="@blogger" maxLength={80} /></label>
        <label>Действует до<input type="date" value={form.expiresAt} onChange={(event) => setForm({ ...form, expiresAt: event.target.value })} /></label>
      </div>
      <button type="button" className="button primary" disabled={saving || !form.code} onClick={() => void create()}>{saving ? "Создаю…" : "Создать промокод"}</button>
    </section>

    <section className="cabinet-panel">
      <h3>Промокоды</h3>
      {busy || !data ? <p className="admin-loading">Загружаю…</p> : <div className="admin-table-wrap"><table className="admin-table">
        <thead><tr><th>Код</th><th>Что даёт</th><th>Активаций</th><th>Кому</th><th>До</th><th>Статус</th><th /></tr></thead>
        <tbody>
          {data.promos.map((promo) => <tr key={promo.code} className={promo.active ? "" : "is-off"}>
            <td><b>{promo.code}</b>{promo.tariff ? <span className="admin-badge" title="Создан по тарифу">{promo.tariffName || promo.tariff}</span> : null}</td>
            <td>{promo.kind === "tokens" ? `${promo.value} токенов` : `−${promo.value}%`}</td>
            <td>{promo.used}{promo.maxUses ? ` / ${promo.maxUses}` : ""}</td>
            <td>{promo.owner || "—"}</td>
            <td>{promo.expiresAt ? shortDate(promo.expiresAt) : "бессрочно"}</td>
            <td>{promo.active ? "активен" : "выключен"}</td>
            <td>
              <button type="button" className="textbtn" onClick={() => void toggle(promo)}>{promo.active ? "Выключить" : "Включить"}</button>
              <button type="button" className="textbtn" onClick={() => void remove(promo)}>Удалить</button>
            </td>
          </tr>)}
          {!data.promos.length && <tr><td colSpan={7}>Промокодов пока нет.</td></tr>}
        </tbody>
      </table></div>}
    </section>
  </>;
}

/** Копирует текст: Clipboard API, а если он недоступен (http, старый браузер) — через выделение. */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch { ok = false; }
    area.remove();
    return ok;
  }
}

function ApiKeysTab({ onError, startCreate }: { onError: (message: string) => void; startCreate?: boolean }) {
  const { data, busy, reload } = useLoader<{ keys: AdminApiKey[] }>(() => accountApi.admin.apiKeys(), onError);
  const tariffs = useTariffs();
  const [keys, setKeys] = useState<AdminApiKey[]>([]);
  useEffect(() => { if (data) setKeys(data.keys); }, [data]);

  // ---- создание
  const [creating, setCreating] = useState(!!startCreate);
  const emptyForm = { userQuery: "", name: "", note: "", tariff: CUSTOM, amount: "0" };
  const [form, setForm] = useState(emptyForm);
  const [owner, setOwner] = useState<AdminUser | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<{ key: AdminApiKey; secret: string } | null>(null);
  const [copied, setCopied] = useState<"" | "ok" | "fail">("");
  const userRef = useRef<HTMLInputElement>(null);
  const formTariff = tariffs.find((item) => item.id === form.tariff) ?? null;

  useEffect(() => {
    if (!startCreate) return;
    setCreating(true);
    window.setTimeout(() => { userRef.current?.scrollIntoView({ block: "center" }); userRef.current?.focus({ preventScroll: true }); }, 0);
  }, [startCreate]);

  // Поиск владельца: сервер ищет по почте и имени (?q=), с небольшой задержкой.
  useEffect(() => {
    if (!creating) return;
    const q = form.userQuery.trim();
    const timer = window.setTimeout(() => {
      accountApi.admin.users(q).then((result) => setUsers(result.users)).catch(() => { /* оставляем прошлый список */ });
    }, q ? 300 : 0);
    return () => window.clearTimeout(timer);
  }, [creating, form.userQuery]);

  const typed = form.userQuery.trim().toLowerCase();
  const exact = typed ? users.find((user) => user.email.toLowerCase() === typed) ?? null : null;
  const target = owner ?? exact;
  const suggestions = owner ? [] : users.filter((user) => !typed || user.email.toLowerCase().includes(typed) || user.name.toLowerCase().includes(typed)).slice(0, 6);

  const create = async () => {
    if (!target) { onError("Выберите владельца ключа из списка или введите его почту целиком"); return; }
    const amount = Number(form.amount);
    if (!formTariff && (!Number.isFinite(amount) || amount < 0)) { onError("Стартовый баланс — число от 0"); return; }
    setSaving(true);
    try {
      const result = await accountApi.admin.createApiKey({
        userId: target.id,
        name: form.name.trim() || undefined,
        note: form.note.trim() || undefined,
        ...(formTariff ? { initialTariff: formTariff.id } : amount > 0 ? { initialBalance: Math.round(amount) } : {}),
      });
      setCreated(result);
      setCopied("");
      setKeys((current) => [result.key, ...current.filter((item) => item.id !== result.key.id)]);
      setForm(emptyForm);
      setOwner(null);
      setCreating(false);
      onError("");
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : "Не удалось создать ключ");
    } finally { setSaving(false); }
  };

  const copySecret = async () => {
    if (!created) return;
    setCopied((await copyText(created.secret)) ? "ok" : "fail");
  };

  // ---- пополнение и удаление
  const [topUp, setTopUp] = useState<AdminApiKey | null>(null);
  const [topUpForm, setTopUpForm] = useState({ tariff: CUSTOM, amount: "10", note: "" });
  const [topUpSaving, setTopUpSaving] = useState(false);
  const topUpTariff = tariffs.find((item) => item.id === topUpForm.tariff) ?? null;
  const [confirmDelete, setConfirmDelete] = useState<AdminApiKey["id"] | null>(null);

  const openTopUp = (key: AdminApiKey) => {
    setTopUp(key);
    setTopUpForm({ tariff: CUSTOM, amount: "10", note: "" });
    setConfirmDelete(null);
  };

  const applyTopUp = async () => {
    if (!topUp) return;
    const amount = Number(topUpForm.amount);
    if (!topUpTariff && (!Number.isInteger(amount) || amount < 1 || amount > 100_000)) { onError("Введите целое число от 1 до 100 000"); return; }
    setTopUpSaving(true);
    try {
      const note = topUpForm.note.trim() || undefined;
      const result = await accountApi.admin.topUpApiKey(topUp.id, topUpTariff ? { tariff: topUpTariff.id, note } : { amount, note });
      setKeys((current) => current.map((item) => item.id === topUp.id ? { ...item, balance: result.balance } : item));
      setTopUp(null);
      onError("");
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : "Не удалось пополнить ключ");
    } finally { setTopUpSaving(false); }
  };

  const remove = async (key: AdminApiKey) => {
    try {
      await accountApi.admin.deleteApiKey(key.id);
      setKeys((current) => current.filter((item) => item.id !== key.id));
      setConfirmDelete(null);
      if (topUp?.id === key.id) setTopUp(null);
      onError("");
    } catch (reason) { onError(reason instanceof Error ? reason.message : "Не удалось удалить ключ"); }
  };

  return <>
    {created && <section className="cabinet-panel admin-secret" role="status">
      <h3>Ключ «{created.key.name}» создан для {created.key.userEmail}</h3>
      <p className="admin-secret-warning"><b>Скопируйте ключ сейчас.</b> Он показывается только один раз — потом его не увидит никто, даже администратор. Если потеряете — удалите ключ и создайте новый.</p>
      <div className="admin-secret-row">
        <code>{created.secret}</code>
        <button type="button" className="button primary" onClick={() => void copySecret()}>{copied === "ok" ? "Скопировано ✓" : "Копировать"}</button>
      </div>
      {copied === "fail" && <p className="admin-hint">Не получилось скопировать автоматически — выделите ключ и скопируйте вручную.</p>}
      <div className="admin-actions">
        <button type="button" className="button secondary" onClick={() => setCreated(null)}>Я сохранил ключ, скрыть</button>
      </div>
    </section>}

    {creating ? <section className="cabinet-panel admin-promo-form">
      <h3>Новый API ключ</h3>
      <p className="admin-hint">Ключ привязывается к пользователю, но у ключа свой баланс — токены аккаунта не тратятся.</p>
      <div className="admin-form-grid">
        <label className="admin-owner-field">Владелец (почта)
          <input ref={userRef} value={owner ? owner.email : form.userQuery} onChange={(event) => { setOwner(null); setForm({ ...form, userQuery: event.target.value }); }} placeholder="user@gmail.com" autoComplete="off" />
          {owner && <button type="button" className="textbtn" onClick={() => { setOwner(null); setForm({ ...form, userQuery: "" }); userRef.current?.focus(); }}>Сменить</button>}
        </label>
        <label>Название<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Например: Интеграция Uzum" maxLength={64} /></label>
        <label>Заметка<input value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} placeholder="Договор, контакт…" maxLength={200} /></label>
      </div>
      {!owner && <div className="admin-user-suggest">
        {suggestions.map((user) => <button key={user.id} type="button" onClick={() => { setOwner(user); setForm({ ...form, userQuery: user.email }); }}>
          <b>{user.email}</b><span>{user.name || "без имени"} · баланс {user.balance}</span>
        </button>)}
        {typed && !suggestions.length && <p className="admin-hint">Никого не нашлось по «{form.userQuery.trim()}». Пользователь должен сначала войти на сайт.</p>}
      </div>}
      {target && <p className="admin-hint">Владелец: <b>{target.email}</b>{target.name ? ` (${target.name})` : ""}</p>}
      <TariffPicker tariffs={tariffs} value={form.tariff} onChange={(tariff) => setForm({ ...form, tariff })} legend="Стартовый баланс ключа" freeHint="ввожу сам, можно 0" />
      <div className="admin-form-grid">
        <label>Стартовый баланс
          {formTariff
            ? <input value={tokens(formTariff.tokens)} readOnly disabled title="Количество задано тарифом" />
            : <input type="number" min={0} value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} />}
        </label>
      </div>
      <div className="admin-actions">
        <button type="button" className="button primary" disabled={saving || !target} onClick={() => void create()}>{saving ? "Создаю…" : "Создать ключ"}</button>
        <button type="button" className="button secondary" onClick={() => { setCreating(false); setOwner(null); setForm(emptyForm); }}>Отмена</button>
      </div>
    </section> : <div className="admin-actions admin-apikey-new">
      <button type="button" className="button primary" onClick={() => { setCreating(true); setCreated(null); window.setTimeout(() => userRef.current?.focus(), 0); }}>+ Новый API ключ</button>
    </div>}

    <section className="cabinet-panel">
      <div className="admin-section-head">
        <h3>API ключи</h3>
        <button type="button" className="textbtn" onClick={reload}>Обновить</button>
      </div>
      {topUp && <div className="admin-balance-editor">
        <h3>Пополнить «{topUp.name}» <small>{topUp.userEmail} · сейчас {topUp.balance}</small></h3>
        <TariffPicker tariffs={tariffs} value={topUpForm.tariff} onChange={(tariff) => setTopUpForm({ ...topUpForm, tariff })} legend="Начислить по тарифу (необязательно)" freeHint="ввожу сумму сам" />
        <div className="admin-form-grid">
          <label>Начислить
            {topUpTariff
              ? <input value={tokens(topUpTariff.tokens)} readOnly disabled title="Количество задано тарифом" />
              : <input type="number" min={1} max={100000} value={topUpForm.amount} onChange={(event) => setTopUpForm({ ...topUpForm, amount: event.target.value })} />}
          </label>
          <label>Заметка (видна в истории ключа)<input value={topUpForm.note} onChange={(event) => setTopUpForm({ ...topUpForm, note: event.target.value })} placeholder={topUpTariff ? `Tarif: ${topUpTariff.name}` : "Admin tomonidan qo'shildi"} maxLength={200} /></label>
        </div>
        <div className="admin-actions">
          <button type="button" className="button primary" disabled={topUpSaving} onClick={() => void applyTopUp()}>{topUpSaving ? "Сохраняю…" : topUpTariff ? `Начислить ${tokens(topUpTariff.tokens)}` : "Пополнить"}</button>
          <button type="button" className="button secondary" onClick={() => setTopUp(null)}>Отмена</button>
        </div>
      </div>}
      {busy && !keys.length ? <p className="admin-loading">Загружаю…</p> : <div className="admin-table-wrap"><table className="admin-table">
        <thead><tr><th>Название</th><th>Ключ</th><th>Владелец</th><th>Баланс</th><th>Использован</th><th>Создан</th><th /></tr></thead>
        <tbody>
          {keys.map((key) => <tr key={key.id}>
            <td><b>{key.name}</b>{key.note ? <small className="admin-cell-note">{key.note}</small> : null}</td>
            <td><code className="admin-prefix">{key.prefix}…</code></td>
            <td>{key.userEmail}</td>
            <td><b>{key.balance}</b></td>
            <td>{shortDate(key.lastUsedAt)}</td>
            <td>{shortDate(key.createdAt)}</td>
            <td>
              {confirmDelete === key.id ? <span className="admin-confirm">
                <span>Удалить ключ?</span>
                <button type="button" className="textbtn is-danger" onClick={() => void remove(key)}>Да</button>
                <button type="button" className="textbtn" onClick={() => setConfirmDelete(null)}>Нет</button>
              </span> : <>
                <button type="button" className="textbtn" onClick={() => openTopUp(key)}>Пополнить</button>
                <button type="button" className="textbtn" onClick={() => setConfirmDelete(key.id)}>Удалить</button>
              </>}
            </td>
          </tr>)}
          {!keys.length && <tr><td colSpan={7}>Ключей пока нет.</td></tr>}
        </tbody>
      </table></div>}
    </section>
  </>;
}

function GenerationsTab({ onError }: { onError: (message: string) => void }) {
  const { data, busy } = useLoader<{ generations: AdminGeneration[] }>(() => accountApi.admin.generations(), onError);
  if (busy || !data) return <p className="admin-loading">Загружаю…</p>;
  return <section className="cabinet-panel"><div className="admin-table-wrap"><table className="admin-table">
    <thead><tr><th>Когда</th><th>Кто</th><th>Товар</th><th>Тип</th><th>Токенов</th><th>Статус</th></tr></thead>
    <tbody>
      {data.generations.map((row) => <tr key={row.id}>
        <td>{shortDate(row.createdAt)}</td>
        <td>{row.email}</td>
        <td>{row.title || "—"}</td>
        <td>{row.contentType}</td>
        <td>{row.tokens}</td>
        <td>{row.status}{row.error ? ` · ${row.error}` : ""}</td>
      </tr>)}
      {!data.generations.length && <tr><td colSpan={6}>Генераций пока не было.</td></tr>}
    </tbody>
  </table></div></section>;
}

function OrdersTab({ onError }: { onError: (message: string) => void }) {
  const { data, busy } = useLoader<{ orders: AdminOrder[] }>(() => accountApi.admin.orders(), onError);
  if (busy || !data) return <p className="admin-loading">Загружаю…</p>;
  return <section className="cabinet-panel"><div className="admin-table-wrap"><table className="admin-table">
    <thead><tr><th>Когда</th><th>Кто</th><th>Токенов</th><th>Сумма</th><th>Способ</th><th>Статус</th></tr></thead>
    <tbody>
      {data.orders.map((row) => <tr key={row.id}>
        <td>{shortDate(row.createdAt)}</td>
        <td>{row.email}</td>
        <td>{row.tokens}</td>
        <td>{nf(row.priceUzs)} сум</td>
        <td>{row.provider}</td>
        <td>{row.status}</td>
      </tr>)}
      {!data.orders.length && <tr><td colSpan={6}>Заказов пока нет.</td></tr>}
    </tbody>
  </table></div></section>;
}
