import { useState } from "react";
import { useAccount } from "../account/AccountContext";
import { accountApi, type TokenOrder } from "../account/accountApi";
import { useLanguage } from "../../i18n/LanguageContext";

/**
 * Tokenlar sotib olish oqimi: paketni tanlash → to'lov usuli → buyurtma.
 *
 * MUHIM: bu yerda hech qanday token qo'shilmaydi. Buyurtma serverda
 * "pending" holatida yaratiladi, tokenlar esa faqat to'lov provayderi
 * tasdig'idan keyin (server webhook) hisoblanadi. Shuning uchun
 * `payments.enabled` false bo'lganda tugma to'lovga emas, tushuntirishga
 * olib boradi — foydalanuvchi to'lov o'tgan deb o'ylab qolmasligi kerak.
 */

const ADMIN_TELEGRAM = "https://t.me/naslaiadmin";

function formatSum(value: number) {
  return Number.isFinite(value) ? value.toLocaleString("ru-RU").replace(/,/g, "\u00a0") : "—";
}

function statusLabel(status: TokenOrder["status"], t: (path: string) => string) {
  if (status === "paid") return t("buy.orderPaid");
  if (status === "pending") return t("buy.orderPending");
  if (status === "failed") return t("buy.orderFailed");
  return t("buy.orderUnavailable");
}

/**
 * Promokodni faollashtirish.
 *
 * Alohida komponent: bu yerda o'z holati bor va u tokenlar sotib olish
 * oqimiga aralashmasligi kerak.
 */
function PromoRedeem() {
  const { refresh } = useAccount();
  const { t } = useLanguage();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const submit = async () => {
    const value = code.trim();
    if (!value) return;
    setBusy(true);
    setResult(null);
    try {
      const data = await accountApi.redeemPromo(value);
      setResult({
        kind: "ok",
        text: data.kind === "tokens"
          ? t("promo.granted", { count: data.granted })
          : t("promo.discount", { percent: data.percent }),
      });
      setCode("");
      await refresh();
    } catch (reason) {
      setResult({ kind: "error", text: reason instanceof Error ? reason.message : t("promo.failed") });
    } finally { setBusy(false); }
  };

  return <section className="promo-redeem">
    <b>{t("promo.title")}</b>
    <div className="promo-row">
      <input
        value={code}
        onChange={(event) => setCode(event.target.value.toUpperCase())}
        placeholder={t("promo.placeholder")}
        maxLength={24}
        onKeyDown={(event) => { if (event.key === "Enter") void submit(); }}
      />
      <button type="button" className="button secondary" disabled={busy || !code.trim()} onClick={() => void submit()}>
        {busy ? t("promo.checking") : t("promo.apply")}
      </button>
    </div>
    {result && <p className={result.kind === "ok" ? "inline-success" : "inline-warning"} role="status">{result.text}</p>}
  </section>;
}

export function BuyTokens() {
  const { account, refresh } = useAccount();
  const { t } = useLanguage();
  const [packId, setPackId] = useState<string | null>(null);
  const [provider, setProvider] = useState<"click" | "payme">("click");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  if (!account) return null;
  const packs = account.packs ?? [];
  const orders = account.orders ?? [];
  const paymentsEnabled = account.payments?.enabled ?? false;
  const selected = packs.find((pack) => pack.id === packId) ?? null;

  const submit = async () => {
    if (!selected) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await accountApi.createOrder(selected.id, provider);
      if (result.checkoutUrl) {
        window.location.href = result.checkoutUrl;
        return;
      }
      setNotice(result.message ?? t("buy.disabledText"));
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("buy.disabledTitle"));
    } finally {
      setBusy(false);
    }
  };

  const cancel = async (id: string) => {
    setBusy(true);
    try { await accountApi.cancelOrder(id); await refresh(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "—"); }
    finally { setBusy(false); }
  };

  return <div className="buy-tokens">
    <div className="buy-head">
      <h2>{t("buy.title")}</h2>
      <p>{t("buy.subtitle")}</p>
    </div>

    <PromoRedeem />

    {!packs.length && <p className="buy-empty" role="status">{t("buy.packsUnavailable")}</p>}

    <div className="pack-grid">
      {packs.map((pack) => <button
        key={pack.id}
        type="button"
        className={`pack-card ${packId === pack.id ? "selected" : ""} ${pack.popular ? "popular" : ""}`}
        aria-pressed={packId === pack.id}
        onClick={() => setPackId(pack.id)}
      >
        {pack.popular && <span className="pack-flag">{t("buy.popular")}</span>}
        {pack.discount > 0 && <span className="pack-save">{t("buy.save", { percent: pack.discount })}</span>}
        <b className="pack-tokens">{pack.tokens} <i>{t("buy.tokens")}</i></b>
        <span className="pack-price">{formatSum(pack.priceUzs)} {t("buy.sum")}</span>
        <small className="pack-per">{t("buy.perToken", { price: formatSum(pack.perToken) })}</small>
      </button>)}
    </div>

    {selected && <div className="buy-checkout">
      <div className="buy-total">
        <span>{t("buy.total")}</span>
        <b>{formatSum(selected.priceUzs)} {t("buy.sum")}</b>
        <small>{selected.tokens} {t("buy.tokens")}</small>
      </div>

      <div className="buy-providers" role="group" aria-label={t("buy.payWith")}>
        <span className="buy-label">{t("buy.payWith")}</span>
        <div className="provider-row">
          {(["click", "payme"] as const).map((value) => <button
            key={value}
            type="button"
            aria-pressed={provider === value}
            onClick={() => setProvider(value)}
          >
            {value === "click" ? "Click" : "Payme"}
          </button>)}
        </div>
      </div>

      <button className="button primary buy-submit" type="button" disabled={busy} onClick={() => void submit()}>
        {busy ? t("buy.creating") : t("buy.pay")}
      </button>

      {!paymentsEnabled && <div className="buy-warning">
        <b>{t("buy.disabledTitle")}</b>
        <p>{t("buy.disabledText")}</p>
        <a className="button secondary" href={ADMIN_TELEGRAM} target="_blank" rel="noopener noreferrer">{t("buy.contactAdmin")}</a>
      </div>}
      <p className="buy-refund">{t("buy.refundNote")}</p>
      {notice && <p className="inline-warning" role="status">{notice}</p>}
      {error && <p className="inline-warning" role="alert">{error}</p>}
    </div>}

    <section className="buy-orders">
      <h3>{t("buy.ordersTitle")}</h3>
      {orders.length ? <div className="cabinet-list">
        {orders.map((order) => <article className="cabinet-row" key={order.id}>
          <div>
            <b>{order.tokens} {t("buy.tokens")} · {formatSum(order.priceUzs)} {t("buy.sum")}</b>
            <span>{new Date(order.createdAt).toLocaleString("uz-UZ")} · {order.provider === "click" ? "Click" : "Payme"}</span>
          </div>
          <div className="order-side">
            <span className={`order-status is-${order.status}`}>{statusLabel(order.status, t)}</span>
            {order.status !== "paid" && <button type="button" className="textbtn" disabled={busy} onClick={() => void cancel(order.id)}>{t("buy.cancel")}</button>}
          </div>
        </article>)}
      </div> : <p className="buy-empty">{t("buy.emptyOrders")}</p>}
    </section>
  </div>;
}
