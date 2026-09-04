import { useState } from "react";
import type { ProductListing } from "../domain/types";

/**
 * Общие блоки для показа готового тавсифа.
 *
 * Раньше это жило только внутри отдельной страницы "Tavsif yozish".
 * Теперь тот же тавсиф может появиться прямо под результатом генерации
 * (галочка "Uzum uchun tavsif ham yozilsin"), поэтому разметку вынесли
 * сюда, чтобы не дублировать её в двух местах.
 */

/** Кнопка «скопировать» с подтверждением прямо на себе. */
export function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  if (!text) return null;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Старый Safari и http без TLS: запасной путь через скрытое поле.
      const area = document.createElement("textarea");
      area.value = text;
      document.body.append(area);
      area.select();
      document.execCommand("copy");
      area.remove();
    }
    setDone(true);
    window.setTimeout(() => setDone(false), 1600);
  };
  return <button type="button" className={`listing-copy ${done ? "is-done" : ""}`} onClick={() => void copy()}>
    {done ? "✓" : label}
  </button>;
}

export function ListingBlock({ title, uz, ru, copyLabel }: { title: string; uz: string; ru: string; copyLabel: string }) {
  if (!uz && !ru) return null;
  return <section className="listing-block">
    <h3>{title}</h3>
    <div className="listing-columns">
      <article>
        <header><span>O‘zbekcha</span><CopyButton text={uz} label={copyLabel} /></header>
        <p>{uz || "—"}</p>
      </article>
      <article>
        <header><span>Русский</span><CopyButton text={ru} label={copyLabel} /></header>
        <p>{ru || "—"}</p>
      </article>
    </div>
  </section>;
}

/**
 * Полный вывод тавсифа: заголовок, УТП, короткое и полное описание,
 * характеристики и ключевые слова — сразу на двух языках.
 */
export function ListingResult({ listing, labels }: {
  listing: ProductListing;
  labels: { title: string; utp: string; short: string; full: string; characteristics: string; keywords: string; copy: string };
}) {
  const keywords = { uz: listing.keywords.uz.join(", "), ru: listing.keywords.ru.join(", ") };
  const characteristicsText = (lang: "uz" | "ru") =>
    (listing.characteristics ?? []).map((item) => `${item.name[lang]}: ${item.value[lang]}`).join("\n");

  return <div className="listing-result">
    <ListingBlock title={labels.title} uz={listing.title.uz} ru={listing.title.ru} copyLabel={labels.copy} />
    <ListingBlock title={labels.utp} uz={listing.utp.uz} ru={listing.utp.ru} copyLabel={labels.copy} />
    <ListingBlock title={labels.short} uz={listing.shortDescription.uz} ru={listing.shortDescription.ru} copyLabel={labels.copy} />
    <ListingBlock title={labels.full} uz={listing.fullDescription.uz} ru={listing.fullDescription.ru} copyLabel={labels.copy} />

    {listing.characteristics.length > 0 && <section className="listing-block">
      <h3>{labels.characteristics}</h3>
      <div className="listing-columns">
        <article>
          <header><span>O‘zbekcha</span><CopyButton text={characteristicsText("uz")} label={labels.copy} /></header>
          <table className="listing-table"><tbody>
            {listing.characteristics.map((item, index) => <tr key={`uz-${index}`}><td>{item.name.uz}</td><td>{item.value.uz}</td></tr>)}
          </tbody></table>
        </article>
        <article>
          <header><span>Русский</span><CopyButton text={characteristicsText("ru")} label={labels.copy} /></header>
          <table className="listing-table"><tbody>
            {listing.characteristics.map((item, index) => <tr key={`ru-${index}`}><td>{item.name.ru}</td><td>{item.value.ru}</td></tr>)}
          </tbody></table>
        </article>
      </div>
    </section>}

    <ListingBlock title={labels.keywords} uz={keywords.uz} ru={keywords.ru} copyLabel={labels.copy} />
    <p className="analysis-note">{listing.notice}</p>
  </div>;
}
