import { useEffect, useState } from "react";
import { useLanguage } from "../../../i18n/LanguageContext";
import type { GenerationSettings, ProductBrief, SlidePlan } from "../domain/types";

/**
 * План текста — то, что окажется НА карточке, показанное до генерации.
 *
 * Зачем: раньше единственный способ увидеть текст был сгенерировать
 * карточку за токен. Ошибку в языке или кривой заголовок человек замечал
 * уже после оплаты. Теперь он читает те же строки на экране, правит их как
 * обычный текст, и только потом платит.
 *
 * План считает сервер по уже проверенному брифу — мгновенно и бесплатно,
 * без обращения к модели.
 */

type Props = {
  brief: ProductBrief;
  settings: GenerationSettings;
  disabled: boolean;
  onChange: (plan: SlidePlan[]) => void;
  onRebuild: () => Promise<SlidePlan[] | null>;
};

export function TextPlan({ brief, settings, disabled, onChange, onRebuild }: Props) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const plan = settings.plan;

  // Бриф поменялся, а план остался старым — человек увидит на карточке не
  // то, что правил в брифе. Честнее сказать об этом, чем молча затирать
  // его правки.
  const [staleFrom, setStaleFrom] = useState("");
  const briefKey = `${brief.title}|${brief.subtitle}|${brief.benefits.join("|")}|${settings.language}|${settings.pages}`;
  useEffect(() => {
    if (!plan.length) { setStaleFrom(""); return; }
    setStaleFrom((current) => (current ? current : briefKey));
    // Ключ читаем при каждом изменении брифа: он и есть сигнал.
  }, [briefKey, plan.length]);
  const stale = Boolean(plan.length && staleFrom && staleFrom !== briefKey);

  const rebuild = async () => {
    setBusy(true);
    try {
      const next = await onRebuild();
      if (next) { setOpen(true); setStaleFrom(briefKey); }
    } finally { setBusy(false); }
  };

  const patch = (index: number, changes: Partial<SlidePlan>) => {
    onChange(plan.map((slide, position) => (position === index ? { ...slide, ...changes } : slide)));
  };

  const patchLine = (index: number, lineIndex: number, value: string) => {
    const lines = [...plan[index].lines];
    lines[lineIndex] = value;
    patch(index, { lines });
  };

  const removeLine = (index: number, lineIndex: number) => {
    patch(index, { lines: plan[index].lines.filter((_, position) => position !== lineIndex) });
  };

  const addLine = (index: number) => {
    if (plan[index].lines.length >= 3) return;
    patch(index, { lines: [...plan[index].lines, ""] });
  };

  return <section className="text-plan">
    <div className="text-plan-head">
      <div>
        <b>{t("plan.title")}</b>
        <small>{t("plan.hint")}</small>
      </div>
      <button type="button" className="button secondary" disabled={disabled || busy} onClick={() => void rebuild()}>
        {busy ? t("plan.building") : plan.length ? t("plan.rebuild") : t("plan.build")}
      </button>
    </div>

    {stale && <p className="text-plan-stale" role="status">{t("plan.stale")}</p>}

    {plan.length > 0 && <>
      <button type="button" className="text-plan-toggle" onClick={() => setOpen((value) => !value)}>
        {open ? t("plan.collapse") : t("plan.expand", { count: plan.length })}
      </button>

      {open && <div className="text-plan-slides">
        {plan.map((slide, index) => <article className="text-plan-slide" key={slide.id}>
          <header>
            <span>{plan.length > 1 ? t("plan.slide", { number: index + 1 }) : t("plan.single")}</span>
          </header>

          <label>
            <span>{t("plan.headline")}</span>
            <input value={slide.headline} maxLength={40} disabled={disabled}
              onChange={(event) => patch(index, { headline: event.target.value })} />
          </label>

          <label>
            <span>{t("plan.subtitle")}</span>
            <input value={slide.subtitle} maxLength={40} disabled={disabled}
              placeholder={t("plan.subtitleEmpty")}
              onChange={(event) => patch(index, { subtitle: event.target.value })} />
          </label>

          <div className="text-plan-lines">
            <span>{t("plan.lines")}</span>
            {slide.lines.map((line, lineIndex) => <div key={lineIndex}>
              <input value={line} maxLength={70} disabled={disabled}
                onChange={(event) => patchLine(index, lineIndex, event.target.value)} />
              <button type="button" aria-label={t("plan.removeLine")} disabled={disabled}
                onClick={() => removeLine(index, lineIndex)}>×</button>
            </div>)}
            {slide.lines.length < 3 && <button type="button" className="text-plan-add" disabled={disabled} onClick={() => addLine(index)}>
              {t("plan.addLine")}
            </button>}
          </div>
        </article>)}
      </div>}
    </>}
  </section>;
}
