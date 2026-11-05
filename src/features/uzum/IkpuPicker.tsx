import { useEffect, useRef, useState } from "react";
import { apiMessage } from "./fields";
import { uzumApi, type UzumIkpu } from "./uzumApi";

type T = (path: string, vars?: Record<string, string | number>) => string;

/**
 * IKPU yordamchisi: nom + kategoriya bo'yicha variantlar yoki erkin qidiruv.
 * Kod hech qachon avtomatik qo'yilmaydi — sotuvchi ro'yxatdan o'zi tanlaydi.
 */
export function IkpuPicker({ value, title, category, barcode, onPick, t }: {
  value: string; title: string; category: string; barcode: string; onPick: (code: string) => void; t: T;
}) {
  const [results, setResults] = useState<UzumIkpu[] | null>(null);
  const [ready, setReady] = useState(true);
  const [loading, setLoading] = useState(false);
  const [failure, setFailure] = useState("");
  const [query, setQuery] = useState("");
  const [chosen, setChosen] = useState<{ code: string; name: string | null } | null>(null);
  const requestRef = useRef<AbortController | null>(null);

  const run = (params: Parameters<typeof uzumApi.ikpu>[0]) => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setLoading(true);
    setFailure("");
    uzumApi.ikpu(params, controller.signal)
      .then((payload) => { setReady(payload.ready); setResults(payload.results ?? []); })
      .catch((reason) => { if (!controller.signal.aborted) setFailure(apiMessage(reason, t)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
  };

  // Erkin qidiruv — yozib bo'lgandan keyin.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    const timer = window.setTimeout(() => run({ q }), 350);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  // Yozilgan/tanlangan kodning nomini ko'rsatamiz (to'g'riligini tekshirish).
  useEffect(() => {
    if (value.length < 16) { setChosen(null); return; }
    if (chosen?.code === value) return;
    const known = results?.find((item) => item.code === value);
    if (known) { setChosen({ code: value, name: known.name }); return; }
    const controller = new AbortController();
    uzumApi.ikpu({ code: value }, controller.signal)
      .then((payload) => { if (payload.ready) setChosen({ code: value, name: payload.results[0]?.name ?? null }); })
      .catch(() => undefined);
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const suggest = () => { setQuery(""); run({ title, category, barcode }); };

  return <div className="uz-ikpu-box">
    {chosen && <p className={chosen.name ? "uz-ikpu-chosen" : "uz-error"}>
      {chosen.name ? `✓ ${t("uzum.product.ikpuChosen", { name: chosen.name })}` : t("uzum.product.ikpuUnknown")}
    </p>}
    <div className="uz-ikpu-actions">
      <button type="button" className="button secondary" onClick={suggest} disabled={loading || !(title || category || barcode)}>
        {t("uzum.product.ikpuSuggest")}
      </button>
      <input className="uz-input" type="search" value={query} autoComplete="off"
        placeholder={t("uzum.product.ikpuSearchPlaceholder")} aria-label={t("uzum.product.ikpuSearchPlaceholder")}
        onChange={(event) => setQuery(event.target.value)} />
    </div>
    {loading && <p className="uz-muted" role="status">{t("uzum.product.ikpuSuggesting")}</p>}
    {failure && <p className="uz-error" role="alert">{failure}</p>}
    {!ready && <p className="uz-muted">{t("uzum.product.ikpuNotReady")}</p>}
    {ready && results && !loading && !results.length && <p className="uz-muted">{t("uzum.product.ikpuEmpty")}</p>}
    {ready && results && results.length > 0 && <>
      <p className="uz-muted">{t("uzum.product.ikpuPickNote")}</p>
      <ul className="uz-catlist uz-ikpu-list">
        {results.map((item) => <li key={item.code}>
          <button type="button" aria-pressed={value === item.code} onClick={() => { onPick(item.code); setChosen({ code: item.code, name: item.name }); }}>
            <b>{item.name}</b>
            {item.nameUz && item.nameUz !== item.name && <span>{item.nameUz}</span>}
            <span>{item.path}</span>
            <code>{item.code}</code>
          </button>
        </li>)}
      </ul>
    </>}
  </div>;
}
