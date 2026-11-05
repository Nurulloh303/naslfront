import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type Dispatch, type SetStateAction } from "react";
import { useLanguage } from "../../i18n/LanguageContext";
import { prepareImageDataUrl } from "../create/domain/prepareImage";
import {
  MAX_SKUS, NO_BRAND, STEPS, clearState, emptySku, emptyState, fieldDomId, formatSom, loadState, newKey,
  normalizeIssue, parseNumber, sameIssue, saveState, stepForIssue, type WizardState,
} from "./draft";
import { BilingualText, Combobox, Field, XlsmGlyph, apiMessage } from "./fields";
import { ExportDone } from "./ExportDone";
import {
  UzumApiError, mediaUrl, uzumApi,
  type UzumCategory, type UzumCategoryDetail, type UzumDraft, type UzumExport, type UzumIssue, type UzumPhoto, type UzumSku,
} from "./uzumApi";

type T = (path: string, vars?: Record<string, string | number>) => string;
type Check = { status: "idle" | "checking" | "done" | "failed"; ok: boolean; message: string };

const TEXT_KEYS = ["titleRu", "titleUz", "shortRu", "shortUz", "descriptionRu", "descriptionUz", "compositionRu", "compositionUz", "careRu", "careUz", "sizeChartRu", "sizeChartUz"] as const;
const DRAFT_STRING_KEYS = ["brand", "model", "country", "ikpu", "groupKey", ...TEXT_KEYS] as const;
const MAX_PHOTO_BYTES = 15 * 1024 * 1024;


export function UzumWizard({ projectId, projectName, onExit }: { projectId?: string; projectName?: string; onExit: () => void }) {
  const { t } = useLanguage();
  const [state, setState] = useState<WizardState>(() => loadState(projectId) ?? emptyState(projectId));
  const [detail, setDetail] = useState<UzumCategoryDetail | null>(null);
  const [detailError, setDetailError] = useState("");
  const [issues, setIssues] = useState<UzumIssue[]>([]);
  const [notice, setNotice] = useState("");
  const [prefilling, setPrefilling] = useState(Boolean(projectId));
  const [prefillRun, setPrefillRun] = useState(0);
  const [stepError, setStepError] = useState("");
  const [focusId, setFocusId] = useState<string | null>(null);
  const [check, setCheck] = useState<Check>({ status: "idle", ok: false, message: "" });
  const [exporting, setExporting] = useState(false);
  const [exported, setExported] = useState<UzumExport | null>(null);
  const checkedDraft = useRef<string>("");
  const idempotency = useRef<{ draft: string; key: string } | null>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const { step, draft } = state;

  // Avtomatik saqlash — har bir o'zgarishdan keyin biroz kutib.
  useEffect(() => {
    const timer = window.setTimeout(() => saveState(projectId, state), 400);
    return () => window.clearTimeout(timer);
  }, [projectId, state]);

  // Loyihadan to'ldirish: rasmlar ro'yxati har safar yangilanadi, matnlar esa faqat birinchi marta.
  useEffect(() => {
    if (!projectId) return;
    let alive = true;
    uzumApi.prefill(projectId)
      .then((prefill) => {
        if (!alive) return;
        setState((current) => {
          const images = Array.isArray(prefill.images) ? prefill.images : current.images;
          if (current.prefilled) return { ...current, images };
          const next: UzumDraft = { ...current.draft };
          const ai: Record<string, string> = {};
          for (const key of DRAFT_STRING_KEYS) {
            const value = prefill[key];
            if (typeof value === "string" && value.trim()) {
              next[key] = value;
              if ((TEXT_KEYS as readonly string[]).includes(key)) ai[key] = value;
            }
          }
          if (typeof prefill.categoryId === "number") next.categoryId = prefill.categoryId;
          if (Array.isArray(prefill.skus) && prefill.skus.length) next.skus = prefill.skus.slice(0, MAX_SKUS).map((sku) => ({ ...emptySku(), ...sku }));
          if (prefill.filters && typeof prefill.filters === "object") next.filters = prefill.filters;
          next.photos = Array.isArray(prefill.photos) && prefill.photos.length
            ? prefill.photos
            : images.map((image) => ({ jobId: image.jobId, resultIndex: image.resultIndex }));
          return { ...current, images, draft: next, ai, prefilled: true };
        });
      })
      .catch(() => { if (alive) setNotice(t("uzum.errors.prefill")); })
      .finally(() => { if (alive) setPrefilling(false); });
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, prefillRun]);

  // Kategoriya filtrlari (va prefill bergan kategoriyaning nomi).
  useEffect(() => {
    const id = draft.categoryId;
    if (typeof id !== "number") { setDetail(null); return; }
    if (detail?.id === id) return;
    let alive = true;
    setDetailError("");
    uzumApi.category(id)
      .then((payload) => {
        if (!alive) return;
        setDetail(payload);
        setState((current) => current.category?.id === id ? current : { ...current, category: { id, title: payload.title, path: payload.path } });
      })
      .catch((reason) => { if (alive) setDetailError(apiMessage(reason, t, "uzum.filters.loadFailed")); });
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.categoryId]);

  // "Tuzatish": kerakli maydonga o'tib, uni ajratib ko'rsatamiz.
  useEffect(() => {
    if (!focusId) return;
    const frame = window.requestAnimationFrame(() => {
      const element = document.getElementById(focusId);
      setFocusId(null);
      if (!element) return;
      const details = element.closest("details");
      if (details && !details.open) details.open = true;
      element.scrollIntoView({ block: "center", behavior: "smooth" });
      if (typeof (element as HTMLElement).focus === "function") (element as HTMLElement).focus({ preventScroll: true });
      const target = element.closest(".uz-field, .uz-flashable") ?? element;
      target.classList.remove("uz-flash");
      void (target as HTMLElement).offsetWidth;
      target.classList.add("uz-flash");
      window.setTimeout(() => target.classList.remove("uz-flash"), 2200);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [focusId, step]);

  const patch = useCallback((changes: Partial<UzumDraft>, touched?: { field: string; sku?: number }[]) => {
    setState((current) => ({ ...current, draft: { ...current.draft, ...changes } }));
    if (touched?.length) setIssues((list) => list.filter((issue) => !touched.some((item) => sameIssue(issue, item.field, item.sku))));
  }, []);

  const setSku = (index: number, changes: Partial<UzumSku>) => {
    setState((current) => ({ ...current, draft: { ...current.draft, skus: current.draft.skus.map((sku, i) => i === index ? { ...sku, ...changes } : sku) } }));
    setIssues((list) => list.filter((issue) => !(issue.sku === index && Object.keys(changes).includes(issue.field))));
  };

  const scrollTop = () => {
    const top = topRef.current?.getBoundingClientRect().top ?? 0;
    if (top < 0 || top > window.innerHeight * 0.5) window.scrollTo({ top: Math.max(0, window.scrollY + top - 84), behavior: "smooth" });
  };

  const goTo = (next: number) => {
    setStepError("");
    setState((current) => ({ ...current, step: Math.max(0, Math.min(STEPS.length - 1, next)) }));
    scrollTop();
  };

  const tryNext = () => {
    if (step === 0 && typeof draft.categoryId !== "number") { setStepError(t("uzum.category.required")); setFocusId("uzf-categoryId"); return; }
    if (step === 3 && !state.consent) { setStepError(t("uzum.photos.consentNeeded")); setFocusId("uzf-photos-consent"); return; }
    goTo(step + 1);
  };

  const fix = (issue: UzumIssue) => {
    const target = stepForIssue(issue);
    setState((current) => ({ ...current, step: target }));
    setFocusId(fieldDomId(issue.field, issue.sku));
  };

  const draftJson = useMemo(() => JSON.stringify(draft), [draft]);

  const runCheck = useCallback(async () => {
    setCheck({ status: "checking", ok: false, message: "" });
    try {
      const result = await uzumApi.validate(draft);
      const list = (result.errors ?? []).map(normalizeIssue);
      if (!state.consent) list.push({ field: "photos.consent", message: t("uzum.photos.consentNeeded") });
      setIssues(list);
      checkedDraft.current = draftJson;
      setCheck({ status: "done", ok: Boolean(result.ok) && list.length === 0, message: "" });
    } catch (reason) {
      setCheck({ status: "failed", ok: false, message: apiMessage(reason, t) });
    }
  }, [draft, draftJson, state.consent, t]);

  // Tekshirish qadamiga kirganda (yoki qoralama o'zgargan bo'lsa) — avtomatik tekshiramiz.
  useEffect(() => {
    if (step !== STEPS.length - 1 || exported) return;
    if (checkedDraft.current === draftJson && check.status === "done") return;
    void runCheck();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, exported]);

  const prepare = async () => {
    if (!idempotency.current || idempotency.current.draft !== draftJson) idempotency.current = { draft: draftJson, key: newKey("uzum") };
    setExporting(true);
    setCheck((current) => ({ ...current, message: "" }));
    try {
      const created = await uzumApi.createExport(draft, idempotency.current.key);
      setExported(created);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (reason) {
      if (reason instanceof UzumApiError && reason.errors.length) {
        setIssues(reason.errors.map(normalizeIssue));
        setCheck({ status: "done", ok: false, message: "" });
      } else {
        setCheck((current) => ({ ...current, message: apiMessage(reason, t) }));
      }
    } finally {
      setExporting(false);
    }
  };

  const reset = () => {
    if (!window.confirm(t("uzum.resetConfirm"))) return;
    clearState(projectId);
    setState((current) => ({ ...emptyState(projectId), images: current.images }));
    setIssues([]);
    setDetail(null);
    setCheck({ status: "idle", ok: false, message: "" });
    if (projectId) { setPrefilling(true); setPrefillRun((n) => n + 1); }
    goTo(0);
  };

  const issueFor = (field: string, sku?: number) => issues.find((issue) => sameIssue(issue, field, sku))?.message;
  const stepsWithIssues = new Set(issues.map(stepForIssue));

  if (exported) {
    return <ExportDone item={exported} onEdit={() => { setExported(null); goTo(STEPS.length - 1); }} onNew={() => { clearState(projectId); onExit(); }} onList={onExit} />;
  }

  return <div className="uz-wizard" ref={topRef}>
    {projectName && <p className="uz-project">{t("uzum.project", { name: projectName })}</p>}

    <nav className="uz-stepper" aria-label={t("uzum.title")}>
      <ol>
        {STEPS.map((key, index) => <li key={key} className={`${index === step ? "is-current" : ""} ${index < step ? "is-done" : ""} ${stepsWithIssues.has(index) ? "has-issue" : ""}`}>
          <button type="button" aria-current={index === step ? "step" : undefined} onClick={() => (index === step ? null : index > 0 && typeof draft.categoryId !== "number" ? tryNext() : goTo(index))}>
            <span className="uz-step-n">{index + 1}</span>
            <span className="uz-step-label">{t(`uzum.steps.${key}`)}</span>
          </button>
        </li>)}
      </ol>
      <p className="uz-step-mobile" aria-hidden="true"><b>{t(`uzum.steps.${STEPS[step]}`)}</b><span>{t("uzum.stepOf", { n: step + 1, total: STEPS.length })}</span></p>
    </nav>

    {notice && <p className="uz-notice" role="status">{notice}</p>}

    <section className="uz-panel" aria-live="polite">
      {step === 0 && <StepCategory state={state} setState={setState} t={t} error={issueFor("categoryId")} onPicked={() => setIssues((list) => list.filter((issue) => issue.field !== "categoryId"))} />}
      {step === 1 && <StepProduct draft={draft} ai={state.ai} patch={patch} issueFor={issueFor} t={t} loading={prefilling} />}
      {step === 2 && <StepSkus draft={draft} patch={patch} setSku={setSku} issueFor={issueFor} t={t} />}
      {step === 3 && <StepPhotos state={state} setState={setState} patch={patch} t={t} error={issueFor("photos")} loading={prefilling} onConsent={() => { setStepError(""); setIssues((list) => list.filter((issue) => issue.field !== "photos.consent")); }} />}
      {step === 4 && <StepFilters draft={draft} detail={detail} error={detailError} patch={patch} issueFor={issueFor} t={t} />}
      {step === 5 && <StepReview state={state} issues={issues} check={check} exporting={exporting} onCheck={() => void runCheck()} onFix={fix} onPrepare={() => void prepare()} t={t} />}

      {stepError && <p className="uz-step-error" role="alert">{stepError}</p>}
    </section>

    <div className="uz-nav">
      <button type="button" className="button secondary" onClick={() => (step === 0 ? onExit() : goTo(step - 1))}>{t("uzum.back")}</button>
      {step < STEPS.length - 1 && <button type="button" className="button primary" onClick={tryNext}>{t("uzum.next")} · {t(`uzum.steps.${STEPS[step + 1]}`)}</button>}
    </div>
    <p className="uz-autosave">{t("uzum.autosave")} <button type="button" className="uz-link" onClick={reset}>{t("uzum.reset")}</button></p>
  </div>;
}

/* ============================================================
   1. Kategoriya
   ============================================================ */

function crumbs(path: string): string[] {
  return path.split(/\s*(?:>|\/|→|»)\s*/).map((part) => part.trim()).filter(Boolean);
}

function StepCategory({ state, setState, t, error, onPicked }: {
  state: WizardState;
  setState: Dispatch<SetStateAction<WizardState>>;
  t: T;
  error?: string;
  onPicked: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UzumCategory[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [failure, setFailure] = useState("");
  const [searching, setSearching] = useState(!state.category);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setResults(null); setLoading(false); return; }
    const controller = new AbortController();
    setLoading(true);
    const timer = window.setTimeout(() => {
      uzumApi.categories(q, controller.signal)
        .then((list) => { setResults(list); setFailure(""); })
        .catch((reason) => { if (!controller.signal.aborted) setFailure(apiMessage(reason, t)); })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 300);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [query, t]);

  const pick = (category: UzumCategory) => {
    setState((current) => {
      const changed = current.draft.categoryId !== category.id;
      return { ...current, category, draft: { ...current.draft, categoryId: category.id, filters: changed ? {} : current.draft.filters } };
    });
    setSearching(false);
    setQuery("");
    onPicked();
  };

  const change = () => {
    if (Object.keys(state.draft.filters).length && !window.confirm(t("uzum.category.changeConfirm"))) return;
    setSearching(true);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  };

  return <>
    <StepHead title={t("uzum.category.title")} />
    <p className="uz-onefile">{t("uzum.category.oneFile")}</p>

    {state.category && !searching && <div className="uz-chosen uz-flashable" id="uzf-categoryId" tabIndex={-1}>
      <small>{t("uzum.category.selected")}</small>
      <ol className="uz-crumbs">{crumbs(state.category.path || state.category.title).map((part, index, all) => <li key={`${part}-${index}`} className={index === all.length - 1 ? "is-last" : ""}>{part}</li>)}</ol>
      <button type="button" className="button secondary" onClick={change}>{t("uzum.category.change")}</button>
    </div>}

    {searching && <div className="uz-catsearch">
      <Field id="uzf-categoryId" label={t("uzum.category.search")} error={error} hint={query.trim().length < 2 ? t("uzum.category.minChars") : undefined}>
        <input ref={inputRef} id="uzf-categoryId" className="uz-input uz-input-lg" type="search" value={query} placeholder={t("uzum.category.placeholder")} autoComplete="off" onChange={(event) => setQuery(event.target.value)} />
      </Field>
      {loading && <p className="uz-muted" role="status">{t("uzum.category.searching")}</p>}
      {failure && <p className="uz-error" role="alert">{failure}</p>}
      {results && !loading && !results.length && <p className="uz-muted">{t("uzum.category.empty")}</p>}
      {results && results.length > 0 && <ul className="uz-catlist">
        {results.map((category) => <li key={category.id}>
          <button type="button" aria-pressed={state.draft.categoryId === category.id} onClick={() => pick(category)}>
            <b>{category.title}</b>
            <span>{crumbs(category.path).slice(0, -1).join(" › ") || category.path}</span>
          </button>
        </li>)}
      </ul>}
      {state.category && <button type="button" className="uz-link" onClick={() => setSearching(false)}>← {state.category.title}</button>}
    </div>}
  </>;
}

function StepHead({ title, lead }: { title: string; lead?: string }) {
  return <header className="uz-head"><h2>{title}</h2>{lead && <p>{lead}</p>}</header>;
}

/* ============================================================
   2. Mahsulot
   ============================================================ */

type Patch = (changes: Partial<UzumDraft>, touched?: { field: string; sku?: number }[]) => void;
type IssueFor = (field: string, sku?: number) => string | undefined;

function StepProduct({ draft, ai, patch, issueFor, t, loading }: { draft: UzumDraft; ai: Record<string, string>; patch: Patch; issueFor: IssueFor; t: T; loading: boolean }) {
  const [ikpuBlurred, setIkpuBlurred] = useState(false);
  const ikpuLocal = ikpuBlurred && draft.ikpu.length > 0 && draft.ikpu.length !== 16 ? t("uzum.product.ikpuInvalid", { n: draft.ikpu.length }) : undefined;
  const ikpuError = issueFor("ikpu") ?? ikpuLocal;
  const text = (base: "title" | "short" | "description" | "composition" | "care" | "sizeChart") => ({
    values: { ru: (draft[`${base}Ru`] as string | undefined) ?? "", uz: (draft[`${base}Uz`] as string | undefined) ?? "" },
    errors: { ru: issueFor(`${base}Ru`), uz: issueFor(`${base}Uz`) },
    onChange: (lang: "ru" | "uz", value: string) => {
      const key = `${base}${lang === "ru" ? "Ru" : "Uz"}`;
      patch({ [key]: value } as Partial<UzumDraft>, [{ field: key }]);
    },
  });

  return <>
    <StepHead title={t("uzum.product.title")} />
    {loading && <p className="uz-muted" role="status">{t("uzum.loading")}</p>}

    <h3 className="uz-sub">{t("uzum.product.basics")}</h3>
    <div className="uz-grid">
      <Field id="uzf-brand" label={t("uzum.product.brand")} error={issueFor("brand")}>
        <Combobox id="uzf-brand" type="brand" value={draft.brand} placeholder={t("uzum.product.brandPlaceholder")} invalid={Boolean(issueFor("brand"))} describedBy={issueFor("brand") ? "uzf-brand-error" : undefined}
          quick={[{ label: t("uzum.product.brandNone"), value: NO_BRAND }]}
          onChange={(value) => patch({ brand: value }, [{ field: "brand" }])} />
      </Field>
      <Field id="uzf-model" label={t("uzum.product.model")} optional error={issueFor("model")}>
        <input id="uzf-model" className="uz-input" value={draft.model ?? ""} onChange={(event) => patch({ model: event.target.value }, [{ field: "model" }])} />
      </Field>
      <Field id="uzf-country" label={t("uzum.product.country")} error={issueFor("country")}>
        <Combobox id="uzf-country" type="country" value={draft.country} placeholder={t("uzum.product.countryPlaceholder")} invalid={Boolean(issueFor("country"))} describedBy={issueFor("country") ? "uzf-country-error" : undefined}
          onChange={(value) => patch({ country: value }, [{ field: "country" }])} />
      </Field>
      <Field id="uzf-ikpu" label={t("uzum.product.ikpu")} error={ikpuError}
        hint={<>{t("uzum.product.ikpuHint")} <a href="https://tasnif.soliq.uz/" target="_blank" rel="noopener noreferrer">{t("uzum.product.ikpuFind")} ↗</a></>}
        counter={`${draft.ikpu.length}/16`}>
        <input id="uzf-ikpu" className="uz-input uz-ikpu" inputMode="numeric" autoComplete="off" placeholder="0000000000000000"
          value={draft.ikpu} aria-invalid={ikpuError ? true : undefined} aria-describedby={ikpuError ? "uzf-ikpu-error" : "uzf-ikpu-hint"}
          onBlur={() => setIkpuBlurred(true)}
          onChange={(event) => { setIkpuBlurred(false); patch({ ikpu: event.target.value.replace(/\D/g, "").slice(0, 16) }, [{ field: "ikpu" }]); }} />
      </Field>
    </div>

    <h3 className="uz-sub">{t("uzum.product.texts")} <small>{t("uzum.product.textsHint")}</small></h3>
    <BilingualText base="title" label={t("uzum.product.name")} ai={ai} {...text("title")} />
    <BilingualText base="short" label={t("uzum.product.short")} ai={ai} multiline rows={3} {...text("short")} />
    <BilingualText base="description" label={t("uzum.product.full")} ai={ai} multiline rows={8} {...text("description")} />

    <details className="uz-more" open={Boolean(draft.compositionRu || draft.compositionUz || draft.careRu || draft.careUz || draft.sizeChartRu || draft.sizeChartUz) || undefined}>
      <summary><b>{t("uzum.product.more")}</b><span>{t("uzum.product.moreHint")}</span></summary>
      <BilingualText base="composition" label={t("uzum.product.composition")} ai={ai} multiline rows={2} optional {...text("composition")} />
      <BilingualText base="care" label={t("uzum.product.care")} ai={ai} multiline rows={2} optional {...text("care")} />
      <BilingualText base="sizeChart" label={t("uzum.product.sizeChart")} ai={ai} multiline rows={2} optional hint={t("uzum.product.sizeChartHint")} {...text("sizeChart")} />
    </details>
  </>;
}

/* ============================================================
   3. Variantlar (SKU)
   ============================================================ */

function NumberInput({ id, value, onChange, suffix, grouped, invalid, describedBy }: {
  id: string; value: number | null; onChange: (value: number | null) => void; suffix: string; grouped?: boolean; invalid?: boolean; describedBy?: string;
}) {
  return <div className="uz-num">
    <input id={id} className="uz-input" inputMode="numeric" autoComplete="off" aria-invalid={invalid || undefined} aria-describedby={describedBy}
      value={value === null ? "" : grouped ? formatSom(value) : String(value)}
      onChange={(event) => onChange(parseNumber(event.target.value))} />
    <span aria-hidden="true">{suffix}</span>
  </div>;
}

const DIM_KEYS = ["weightG", "heightMm", "widthMm", "lengthMm"] as const;

function StepSkus({ draft, patch, setSku, issueFor, t }: { draft: UzumDraft; patch: Patch; setSku: (index: number, changes: Partial<UzumSku>) => void; issueFor: IssueFor; t: T }) {
  const [applied, setApplied] = useState<number | null>(null);
  const skus = draft.skus;

  const add = (from?: UzumSku) => {
    if (skus.length >= MAX_SKUS) return;
    const base = from ?? skus[skus.length - 1];
    // Yangi variant: narx va qadoq odatda bir xil — ko'chiramiz; rang/o'lcham/kodlar esa yangidan.
    const next: UzumSku = from ? { ...from, barcode: undefined, sellerId: undefined } : { ...emptySku(), price: base?.price ?? null, oldPrice: base?.oldPrice ?? null, weightG: base?.weightG ?? null, heightMm: base?.heightMm ?? null, widthMm: base?.widthMm ?? null, lengthMm: base?.lengthMm ?? null };
    patch({ skus: [...skus, next] }, [{ field: "skus" }]);
    window.setTimeout(() => document.querySelectorAll(".uz-sku")[skus.length]?.scrollIntoView({ block: "start", behavior: "smooth" }), 30);
  };
  const remove = (index: number) => patch({ skus: skus.filter((_, i) => i !== index) });
  const applyAll = (index: number) => {
    const source = skus[index];
    patch({ skus: skus.map((sku) => ({ ...sku, weightG: source.weightG, heightMm: source.heightMm, widthMm: source.widthMm, lengthMm: source.lengthMm })) });
    setApplied(index);
    window.setTimeout(() => setApplied(null), 2400);
  };

  const err = (field: string, index: number) => issueFor(field, index);
  const desc = (field: string, index: number) => (err(field, index) ? `${fieldDomId(field, index)}-error` : undefined);

  return <>
    <StepHead title={t("uzum.skus.title")} lead={t("uzum.skus.hint")} />
    {issueFor("skus") && <p className="uz-error uz-flashable" id="uzf-skus" tabIndex={-1} role="alert">{issueFor("skus")}</p>}

    <ol className="uz-skus">
      {skus.map((sku, index) => {
        const oldLow = sku.price !== null && sku.oldPrice !== null && sku.oldPrice < sku.price;
        return <li className="uz-sku" key={index}>
          <div className="uz-sku-head">
            <h3>{t("uzum.skus.sku", { n: index + 1 })}{sku.color || sku.size ? <small>{[sku.color, sku.size].filter(Boolean).join(" / ")}</small> : null}</h3>
            <div>
              <button type="button" className="uz-link" disabled={skus.length >= MAX_SKUS} onClick={() => add(sku)}>{t("uzum.skus.duplicate")}</button>
              {skus.length > 1 && <button type="button" className="uz-link is-danger" onClick={() => remove(index)}>{t("uzum.skus.remove")}</button>}
            </div>
          </div>

          <div className="uz-grid uz-grid-4 uz-grid-main">
            <Field id={fieldDomId("color", index)} label={t("uzum.skus.color")} error={err("color", index)}>
              <Combobox id={fieldDomId("color", index)} type="color" value={sku.color ?? ""} invalid={Boolean(err("color", index))} describedBy={desc("color", index)} onChange={(value) => setSku(index, { color: value })} />
            </Field>
            <Field id={fieldDomId("size", index)} label={t("uzum.skus.size")} error={err("size", index)}>
              <Combobox id={fieldDomId("size", index)} type="size" value={sku.size ?? ""} placeholder={t("uzum.skus.sizePlaceholder")} invalid={Boolean(err("size", index))} describedBy={desc("size", index)} onChange={(value) => setSku(index, { size: value })} />
            </Field>
            <Field id={fieldDomId("price", index)} label={t("uzum.skus.price")} error={err("price", index)}>
              <NumberInput id={fieldDomId("price", index)} grouped suffix={t("uzum.skus.som")} value={sku.price} invalid={Boolean(err("price", index))} describedBy={desc("price", index)}
                onChange={(value) => setSku(index, { price: value, ...(sku.oldPrice === null || sku.oldPrice === sku.price ? { oldPrice: value } : {}) })} />
            </Field>
            <Field id={fieldDomId("oldPrice", index)} label={t("uzum.skus.oldPrice")} error={err("oldPrice", index) ?? (oldLow ? t("uzum.skus.oldPriceLow") : undefined)} hint={t("uzum.skus.oldPriceHint")}>
              <NumberInput id={fieldDomId("oldPrice", index)} grouped suffix={t("uzum.skus.som")} value={sku.oldPrice} invalid={Boolean(err("oldPrice", index)) || oldLow} describedBy={desc("oldPrice", index)} onChange={(value) => setSku(index, { oldPrice: value })} />
            </Field>
          </div>

          <div className="uz-pack">
            <p className="uz-pack-title"><PackGlyph />{t("uzum.skus.pack")}</p>
            <div className="uz-grid uz-grid-4">
              {DIM_KEYS.map((key) => {
                const label = key === "weightG" ? t("uzum.skus.weight") : key === "heightMm" ? t("uzum.skus.height") : key === "widthMm" ? t("uzum.skus.width") : t("uzum.skus.length");
                return <Field key={key} id={fieldDomId(key, index)} label={label} error={err(key, index)}>
                  <NumberInput id={fieldDomId(key, index)} suffix={key === "weightG" ? t("uzum.skus.g") : t("uzum.skus.mm")} value={sku[key]} invalid={Boolean(err(key, index))} describedBy={desc(key, index)} onChange={(value) => setSku(index, { [key]: value })} />
                </Field>;
              })}
            </div>
            {skus.length > 1 && <button type="button" className="uz-apply" onClick={() => applyAll(index)} disabled={DIM_KEYS.every((key) => sku[key] === null)}>
              {applied === index ? `✓ ${t("uzum.skus.applied")}` : t("uzum.skus.applyAll")}
            </button>}
          </div>

          <details className="uz-more is-compact" open={Boolean(sku.barcode || sku.sellerId || err("barcode", index) || err("sellerId", index)) || undefined}>
            <summary><b>{t("uzum.skus.extra")}</b><span>{t("uzum.optional")}</span></summary>
            <div className="uz-grid">
              <Field id={fieldDomId("barcode", index)} label={t("uzum.skus.barcode")} hint={t("uzum.skus.barcodeHint")} error={err("barcode", index)}>
                <input id={fieldDomId("barcode", index)} className="uz-input" inputMode="numeric" value={sku.barcode ?? ""} onChange={(event) => setSku(index, { barcode: event.target.value.replace(/\s/g, "") })} />
              </Field>
              <Field id={fieldDomId("sellerId", index)} label={t("uzum.skus.sellerId")} hint={t("uzum.skus.sellerIdHint")} error={err("sellerId", index)}>
                <input id={fieldDomId("sellerId", index)} className="uz-input" value={sku.sellerId ?? ""} onChange={(event) => setSku(index, { sellerId: event.target.value })} />
              </Field>
            </div>
          </details>
        </li>;
      })}
    </ol>

    <div className="uz-sku-add">
      <button type="button" className="button secondary" disabled={skus.length >= MAX_SKUS} onClick={() => add()}>{t("uzum.skus.add")}</button>
      {skus.length >= MAX_SKUS && <small>{t("uzum.skus.limit")}</small>}
    </div>

    <details className="uz-more is-compact" open={Boolean(issueFor("groupKey")) || undefined}>
      <summary><b>{t("uzum.skus.advanced")}</b></summary>
      <Field id="uzf-groupKey" label={t("uzum.skus.groupKey")} hint={t("uzum.skus.groupKeyHint")} error={issueFor("groupKey")} counter={`${draft.groupKey.length}/100`}>
        <input id="uzf-groupKey" className="uz-input" maxLength={100} value={draft.groupKey} onChange={(event) => patch({ groupKey: event.target.value }, [{ field: "groupKey" }])} />
      </Field>
    </details>
  </>;
}

function PackGlyph() {
  return <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"><path d="M12 3 3.5 7.5v9L12 21l8.5-4.5v-9L12 3Z" /><path d="M3.5 7.5 12 12l8.5-4.5M12 12v9" /></svg>;
}

/* ============================================================
   4. Rasmlar
   ============================================================ */

function photoKey(photo: UzumPhoto): string {
  return "dataUrl" in photo ? `d:${photo.dataUrl.slice(-32)}:${photo.dataUrl.length}` : `j:${photo.jobId}:${photo.resultIndex}`;
}

function StepPhotos({ state, setState, patch, t, error, loading, onConsent }: {
  state: WizardState; setState: Dispatch<SetStateAction<WizardState>>; patch: Patch; t: T; error?: string; loading: boolean; onConsent: () => void;
}) {
  const photos = state.draft.photos;
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const [fileError, setFileError] = useState("");

  const srcOf = (photo: UzumPhoto) => {
    if ("dataUrl" in photo) return photo.dataUrl;
    const image = state.images.find((item) => item.jobId === photo.jobId && item.resultIndex === photo.resultIndex);
    return image ? mediaUrl(image.url) : "";
  };
  const setPhotos = (next: UzumPhoto[]) => patch({ photos: next }, [{ field: "photos" }]);
  const move = (from: number, to: number) => {
    if (to < 0 || to >= photos.length || from === to) return;
    const next = [...photos];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    setPhotos(next);
  };
  const selectedIndex = (jobId: string, resultIndex: number) => photos.findIndex((photo) => !("dataUrl" in photo) && photo.jobId === jobId && photo.resultIndex === resultIndex);

  const addFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    setFileError("");
    const added: UzumPhoto[] = [];
    for (const file of files) {
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) { setFileError(t("uzum.photos.fileType")); continue; }
      if (file.size > MAX_PHOTO_BYTES) { setFileError(t("uzum.photos.fileSize")); continue; }
      try { added.push({ dataUrl: await prepareImageDataUrl(file) }); }
      catch { setFileError(t("uzum.photos.fileRead")); }
    }
    if (added.length) setPhotos([...photos, ...added]);
  };

  return <>
    <StepHead title={t("uzum.photos.title")} lead={t("uzum.photos.hint")} />

    <div className="uz-flashable" id="uzf-photos" tabIndex={-1}>
      <h3 className="uz-sub">{t("uzum.photos.order")}</h3>
      {error && <p className="uz-error" role="alert">{error}</p>}
      {!photos.length
        ? <p className="uz-photo-empty">{loading ? t("uzum.loading") : t("uzum.photos.empty")}</p>
        : <ol className="uz-order">
          {photos.map((photo, index) => <li
            key={photoKey(photo)}
            draggable
            className={`${dragFrom === index ? "is-dragging" : ""} ${dragOver === index && dragFrom !== index ? "is-over" : ""}`}
            onDragStart={(event) => { setDragFrom(index); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", String(index)); }}
            onDragOver={(event) => { event.preventDefault(); setDragOver(index); }}
            onDragLeave={() => setDragOver((current) => (current === index ? null : current))}
            onDrop={(event) => { event.preventDefault(); if (dragFrom !== null) move(dragFrom, index); setDragFrom(null); setDragOver(null); }}
            onDragEnd={() => { setDragFrom(null); setDragOver(null); }}
          >
            <figure>
              <img src={srcOf(photo)} alt={t("uzum.photos.photoN", { n: index + 1 })} draggable={false} />
              <span className={`uz-order-n ${index === 0 ? "is-main" : ""}`}>{index === 0 ? t("uzum.photos.main") : index + 1}</span>
              <button type="button" className="uz-order-x" aria-label={t("uzum.photos.remove")} onClick={() => setPhotos(photos.filter((_, i) => i !== index))}>×</button>
            </figure>
            <div className="uz-order-move">
              <button type="button" aria-label={`${t("uzum.photos.left")}: ${t("uzum.photos.photoN", { n: index + 1 })}`} disabled={index === 0} onClick={() => move(index, index - 1)}>‹</button>
              <button type="button" aria-label={`${t("uzum.photos.right")}: ${t("uzum.photos.photoN", { n: index + 1 })}`} disabled={index === photos.length - 1} onClick={() => move(index, index + 1)}>›</button>
            </div>
          </li>)}
        </ol>}
    </div>

    {state.images.length > 0 && <>
      <h3 className="uz-sub">{t("uzum.photos.project")} <small>{t("uzum.photos.projectHint")}</small></h3>
      <ul className="uz-pool">
        {state.images.map((image) => {
          const at = selectedIndex(image.jobId, image.resultIndex);
          return <li key={`${image.jobId}-${image.resultIndex}`}>
            <button type="button" aria-pressed={at >= 0} onClick={() => setPhotos(at >= 0 ? photos.filter((_, i) => i !== at) : [...photos, { jobId: image.jobId, resultIndex: image.resultIndex }])}>
              <img src={mediaUrl(image.url)} alt="" loading="lazy" />
              <span>{at >= 0 ? `✓ ${at + 1}` : "+"}</span>
            </button>
          </li>;
        })}
      </ul>
    </>}

    <div className="uz-photo-add">
      <button type="button" className="button secondary" onClick={() => inputRef.current?.click()}>+ {t("uzum.photos.addDevice")}</button>
      <input ref={inputRef} className="sr-only" type="file" multiple accept="image/jpeg,image/png,image/webp" onChange={(event) => void addFiles(event)} />
      {fileError && <p className="uz-error" role="alert">{fileError}</p>}
    </div>

    <label className={`uz-consent uz-flashable ${state.consent ? "is-on" : ""}`}>
      <input id="uzf-photos-consent" type="checkbox" checked={state.consent} onChange={(event) => { const checked = event.target.checked; setState((current) => ({ ...current, consent: checked })); if (checked) onConsent(); }} />
      <span>
        <b>{t("uzum.photos.consentTitle")}</b>
        <small>{t("uzum.photos.consent")}</small>
        <em>{t("uzum.photos.consentLabel")}</em>
      </span>
    </label>
  </>;
}

/* ============================================================
   5. Xususiyatlar
   ============================================================ */

const VISIBLE_VALUES = 14;

function StepFilters({ draft, detail, error, patch, issueFor, t }: { draft: UzumDraft; detail: UzumCategoryDetail | null; error: string; patch: Patch; issueFor: IssueFor; t: T }) {
  if (typeof draft.categoryId !== "number") return <><StepHead title={t("uzum.filters.title")} /><p className="uz-muted">{t("uzum.filters.needCategory")}</p></>;
  return <>
    <StepHead title={t("uzum.filters.title")} lead={t("uzum.filters.hint")} />
    {error && <p className="uz-error" role="alert">{error}</p>}
    {!detail && !error && <p className="uz-muted" role="status">{t("uzum.loading")}</p>}
    {detail && !detail.filters.length && <p className="uz-muted">{t("uzum.filters.none")}</p>}
    {detail && [...detail.filters].sort((a, b) => Number(b.required) - Number(a.required)).map((filter) => {
      const key = String(filter.id);
      const field = `filters.${key}`;
      return <FilterGroup key={key} filter={filter} value={draft.filters[key]} error={issueFor(field)} t={t}
        onChange={(value) => {
          const next = { ...draft.filters };
          if (value === undefined || (Array.isArray(value) && !value.length)) delete next[key];
          else next[key] = value;
          patch({ filters: next }, [{ field }]);
        }} />;
    })}
  </>;
}

function FilterGroup({ filter, value, error, onChange, t }: {
  filter: UzumCategoryDetail["filters"][number]; value: string | string[] | undefined; error?: string; onChange: (value: string | string[] | undefined) => void; t: T;
}) {
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState("");
  const selected = Array.isArray(value) ? value : value ? [value] : [];
  const long = filter.values.length > VISIBLE_VALUES;
  const q = query.trim().toLowerCase();
  const visible = q
    ? filter.values.filter((item) => item.toLowerCase().includes(q))
    : expanded || !long ? filter.values
    : [...filter.values.slice(0, VISIBLE_VALUES), ...selected.filter((item) => !filter.values.slice(0, VISIBLE_VALUES).includes(item))];

  const toggle = (item: string) => {
    if (filter.multiple) onChange(selected.includes(item) ? selected.filter((entry) => entry !== item) : [...selected, item]);
    else onChange(selected[0] === item ? undefined : item);
  };

  return <fieldset className={`uz-filter uz-flashable ${error ? "has-error" : ""}`} id={fieldDomId(`filters.${filter.id}`)} tabIndex={-1}>
    <legend>
      <b>{filter.name}</b>
      {filter.required && <span className="uz-req">{t("uzum.filters.required")}</span>}
      <small>{filter.multiple ? t("uzum.filters.multiple") : t("uzum.filters.single")}</small>
    </legend>
    {long && <input className="uz-input uz-filter-search" type="search" value={query} placeholder={t("uzum.filters.search", { name: filter.name })} aria-label={t("uzum.filters.search", { name: filter.name })} onChange={(event) => setQuery(event.target.value)} />}
    <div className="uz-chips" role="group" aria-label={filter.name}>
      {visible.map((item) => <button key={item} type="button" className={filter.multiple ? "is-multi" : ""} aria-pressed={selected.includes(item)} onClick={() => toggle(item)}>{item}</button>)}
      {long && !q && <button type="button" className="uz-chip-more" onClick={() => setExpanded((current) => !current)}>{expanded ? t("uzum.filters.showLess") : t("uzum.filters.showAll", { n: filter.values.length })}</button>}
    </div>
    {error && <p className="uz-field-error" role="alert">{error}</p>}
  </fieldset>;
}

/* ============================================================
   6. Tekshirish
   ============================================================ */

function StepReview({ state, issues, check, exporting, onCheck, onFix, onPrepare, t }: {
  state: WizardState; issues: UzumIssue[]; check: Check; exporting: boolean; onCheck: () => void; onFix: (issue: UzumIssue) => void; onPrepare: () => void; t: T;
}) {
  const { draft } = state;
  const groups = STEPS.map((key, index) => ({ key, index, items: issues.filter((issue) => stepForIssue(issue) === index) })).filter((group) => group.items.length);
  const ready = check.status === "done" && check.ok && !issues.length;

  return <>
    <StepHead title={t("uzum.review.title")} lead={t("uzum.review.lead")} />

    <dl className="uz-summary">
      <div><dt>{t("uzum.review.summaryCategory")}</dt><dd>{state.category?.title ?? "—"}</dd></div>
      <div><dt>{t("uzum.product.name")}</dt><dd>{draft.titleRu || draft.titleUz || "—"}</dd></div>
      <div><dt>{t("uzum.steps.skus")}</dt><dd>{t("uzum.review.summarySkus", { n: draft.skus.length })}</dd></div>
      <div><dt>{t("uzum.steps.photos")}</dt><dd>{t("uzum.review.summaryPhotos", { n: draft.photos.length })}</dd></div>
    </dl>

    <SheetPreview draft={draft} t={t} />

    <div className="uz-check" role="status" aria-live="polite">
      {check.status === "checking" && <p className="uz-check-line"><span className="pulse-dot" />{t("uzum.review.checking")}</p>}
      {check.status === "failed" && <p className="uz-error">{check.message}</p>}
      {check.status === "done" && ready && <p className="uz-check-ok">✓ {t("uzum.review.ok")}</p>}
      {check.status === "done" && issues.length > 0 && <div className="uz-issues">
        <p className="uz-issues-title">{t("uzum.review.problems", { n: issues.length })}</p>
        {groups.map((group) => <section key={group.key}>
          <h3>{group.index + 1}. {t(`uzum.steps.${group.key}`)}</h3>
          <ul>
            {group.items.map((issue, index) => <li key={`${issue.field}-${issue.sku ?? "x"}-${index}`}>
              <span>{typeof issue.sku === "number" && <b>{t("uzum.review.sku", { n: issue.sku + 1 })}: </b>}{issue.message}</span>
              {group.index < STEPS.length - 1 && <button type="button" className="button secondary" onClick={() => onFix(issue)}>{t("uzum.review.fix")}</button>}
            </li>)}
          </ul>
        </section>)}
      </div>}
      {check.message && check.status !== "failed" && <p className="uz-error" role="alert">{check.message}</p>}
    </div>

    <div className="uz-prepare">
      <button type="button" className="uz-cta" disabled={!ready || exporting} onClick={onPrepare}>
        <XlsmGlyph />{exporting ? t("uzum.review.preparing") : t("uzum.review.prepare")}
      </button>
      <button type="button" className="uz-link" disabled={check.status === "checking" || exporting} onClick={onCheck}>{t("uzum.review.recheck")}</button>
    </div>
  </>;
}

/** Fayl ichidagi satrlar — Excel ko'rinishida: ustun harflari va 4-satrdan boshlanadigan raqamlar. */
function SheetPreview({ draft, t }: { draft: UzumDraft; t: T }) {
  const columns: { letter: string; label: string; value: (sku: UzumSku) => string; num?: boolean }[] = [
    { letter: "A", label: t("uzum.review.colName"), value: () => draft.titleRu },
    { letter: "W", label: t("uzum.skus.color"), value: (sku) => sku.color ?? "" },
    { letter: "X", label: t("uzum.skus.size"), value: (sku) => sku.size ?? "" },
    { letter: "Y", label: t("uzum.skus.price"), value: (sku) => formatSom(sku.price), num: true },
    { letter: "Z", label: t("uzum.skus.oldPrice"), value: (sku) => formatSom(sku.oldPrice), num: true },
    { letter: "AA", label: `${t("uzum.skus.weight")}, ${t("uzum.skus.g")}`, value: (sku) => (sku.weightG === null ? "" : String(sku.weightG)), num: true },
  ];
  return <figure className="uz-sheet">
    <figcaption><b>{t("uzum.review.previewTitle")}</b><span>{t("uzum.review.previewHint")}</span></figcaption>
    <div className="uz-sheet-scroll" tabIndex={0}>
      <table>
        <thead>
          <tr className="uz-sheet-letters"><th aria-hidden="true" />{columns.map((column) => <th key={column.letter} aria-hidden="true">{column.letter}</th>)}</tr>
          <tr><th aria-hidden="true">2</th>{columns.map((column) => <th key={column.letter} scope="col" className={column.num ? "is-num" : ""}>{column.label}</th>)}</tr>
        </thead>
        <tbody>
          {draft.skus.map((sku, index) => <tr key={index}>
            <th scope="row">{index + 4}</th>
            {columns.map((column) => <td key={column.letter} className={`${column.num ? "is-num" : ""} ${column.value(sku) ? "" : "is-empty"}`}>{column.value(sku) || "—"}</td>)}
          </tr>)}
        </tbody>
      </table>
    </div>
  </figure>;
}
