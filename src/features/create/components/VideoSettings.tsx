import { useEffect, useRef, useState, type ChangeEvent } from "react";
import type { GenerationSettings, ProductAsset, ProductBrief, VideoSettings as VideoSettingsModel } from "../domain/types";
import { useLanguage } from "../../../i18n/LanguageContext";
import { MAX_UPLOAD_BYTES } from "../domain/uploadLimits";

type Props = {
  assets: ProductAsset[];
  brief: ProductBrief;
  settings: GenerationSettings;
  disabled: boolean;
  onChange: (patch: Partial<GenerationSettings>) => void;
};

const randomScenarios = [
  "Mahsulotga sekin yaqinlashish, detallarni yirik planda ko‘rsatish, yakunda toza marketplace kadr.",
  "Umumiy kadr, keyin detalga o‘tish, mahsulot shakli va asosiy afzalliklarini qisqa ko‘rsatish.",
  "Yumshoq tijoriy rolik: mahsulot markazda, kamera shakl va rangni tabiiy ko‘rsatadi.",
];

const quizOptions = {
  goal: ["Mahsulotni sotish", "Detallarni ko‘rsatish", "Lifestyle rolik qilish"],
  motion: ["Sekin yaqinlashish", "360° aylanish", "Dinamik rakurslar"],
  mood: ["Tijoriy", "Premium", "Energetik"],
};

function nextVideo(current: VideoSettingsModel, patch: Partial<VideoSettingsModel>) {
  return { ...current, ...patch };
}

export function VideoSettings({ assets, brief, settings, disabled, onChange }: Props) {
  const { t } = useLanguage();
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [ideaOpen, setIdeaOpen] = useState(false);
  const [quizOpen, setQuizOpen] = useState(false);
  const [fileError, setFileError] = useState("");
  const [quiz, setQuiz] = useState({ goal: quizOptions.goal[0], motion: quizOptions.motion[0], mood: quizOptions.mood[0] });
  const finalFrameInput = useRef<HTMLInputElement>(null);
  const selected = assets.find((asset) => asset.isPrimary) ?? assets[0];

  useEffect(() => {
    if (!ideaOpen) return;
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { setIdeaOpen(false); setQuizOpen(false); } };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [ideaOpen]);

  const updateVideo = (patch: Partial<VideoSettingsModel>) => onChange({ video: nextVideo(settings.video, patch) });
  const useRandomScenario = () => {
    const seed = (brief.title || brief.category || "mahsulot").toLowerCase();
    const text = randomScenarios[Math.floor(Math.random() * randomScenarios.length)].replace("Mahsulot", seed);
    updateVideo({ prompt: text });
    setIdeaOpen(false);
  };
  const completeQuiz = () => {
    updateVideo({ prompt: `${quiz.goal}: ${brief.title || "mahsulot"} ko‘rsatilsin. Kamera: ${quiz.motion.toLowerCase()}. Kayfiyat: ${quiz.mood.toLowerCase()}. Urg‘u: ${brief.benefits.filter(Boolean).slice(0, 2).join(" va ") || "asosiy afzalliklar"}. Yakun: toza marketplace kadr.` });
    setIdeaOpen(false);
    setQuizOpen(false);
  };
  const onFinalFrame = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > MAX_UPLOAD_BYTES) {
      setFileError(t("settings.video.finalFrameError"));
      event.target.value = "";
      return;
    }
    if (settings.video.finalFrameUrl.startsWith("blob:")) URL.revokeObjectURL(settings.video.finalFrameUrl);
    setFileError("");
    updateVideo({ finalFrameUrl: URL.createObjectURL(file), finalFrameName: file.name });
    event.target.value = "";
  };

  return <section className="video-settings" aria-label={t("settings.video.descTitle")}>
    <button className="video-reset" type="button" disabled={disabled} onClick={() => { if (settings.video.finalFrameUrl.startsWith("blob:")) URL.revokeObjectURL(settings.video.finalFrameUrl); setFileError(""); onChange({ video: nextVideo(settings.video, { prompt: "", finalFrameUrl: "", finalFrameName: "" }) }); }}>{t("settings.video.reset")}</button>
    <p className="video-copy">{t("settings.video.stub")}</p>
    <div className="video-source-row">
      {selected ? <img className="video-source" src={selected.url} alt={selected.name} /> : <div className="video-source empty">+</div>}
      {assets.length > 1 && <div className="video-source-list">{assets.slice(0, 4).map((asset) => <img key={asset.id} src={asset.url} alt={asset.name} />)}</div>}
    </div>

    <div className="video-title-row"><h3>{t("settings.video.descTitle")}</h3><button type="button" disabled={disabled} onClick={() => setIdeaOpen(true)}>{t("settings.video.ideaButton")}</button></div>
    <p className="video-copy">{t("settings.video.descHint")}</p>
    <label className="video-prompt"><textarea disabled={disabled} maxLength={1500} value={settings.video.prompt} onChange={(event) => updateVideo({ prompt: event.target.value })} placeholder={t("settings.video.promptPlaceholder")} /><span>{settings.video.prompt.length}/1500</span></label>

    <button className="video-advanced-toggle" type="button" disabled={disabled} onClick={() => setAdvancedOpen((open) => !open)}>{advancedOpen ? "⌃" : "⌄"} {t("settings.advanced.toggle")}</button>
    {advancedOpen && <div className="video-advanced-panel">
      <fieldset disabled={disabled}><legend>{t("settings.video.durationLegend")}</legend><div className="video-duration"><button type="button" aria-pressed={settings.video.duration === 5} onClick={() => updateVideo({ duration: 5 })}>5s</button><button type="button" aria-pressed={settings.video.duration === 10} onClick={() => updateVideo({ duration: 10 })}>10s</button></div></fieldset>
      <label className="video-switch">{t("settings.video.cardMode")} <input disabled={disabled} type="checkbox" checked={settings.video.cardMode} onChange={(event) => updateVideo({ cardMode: event.target.checked })} /><span /></label>
      <label className="video-switch">{t("settings.video.loop")} <input disabled={disabled} type="checkbox" checked={settings.video.loop} onChange={(event) => updateVideo({ loop: event.target.checked })} /><span /></label>
      <div className="final-frame"><b>{t("settings.video.finalFrame")}</b><button type="button" disabled={disabled} onClick={() => finalFrameInput.current?.click()}>{settings.video.finalFrameUrl ? <img src={settings.video.finalFrameUrl} alt={settings.video.finalFrameName} /> : "▧"}</button><small>{settings.video.finalFrameName || t("settings.video.finalFrameOptional")}</small><input ref={finalFrameInput} className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" onChange={onFinalFrame} />{fileError && <p className="field-error" role="alert">{fileError}</p>}</div>
    </div>}

    {ideaOpen && <div className="idea-modal-backdrop" role="presentation" onClick={() => { setIdeaOpen(false); setQuizOpen(false); }}>
      <div className="idea-modal" role="dialog" aria-label={t("settings.video.ideaAria")} onClick={(event) => event.stopPropagation()}>
        <button className="modal-close" type="button" aria-label={t("settings.video.close")} onClick={() => { setIdeaOpen(false); setQuizOpen(false); }}>×</button>
        {!quizOpen ? <>
          <h3>{t("settings.video.improveTitle")}</h3>
          <p>{t("settings.video.improveText")}</p>
          <button className="button primary" type="button" onClick={() => setQuizOpen(true)}>{t("settings.video.takeTest")}</button>
          <button className="button secondary" type="button" onClick={useRandomScenario}>{t("settings.video.randomScenario")}</button>
        </> : <>
          <h3>{t("settings.video.quizTitle")}</h3>
          <label>{t("settings.video.goal")}<select value={quiz.goal} onChange={(event) => setQuiz((current) => ({ ...current, goal: event.target.value }))}>{quizOptions.goal.map((value) => <option key={value}>{value}</option>)}</select></label>
          <label>{t("settings.video.cameraMotion")}<select value={quiz.motion} onChange={(event) => setQuiz((current) => ({ ...current, motion: event.target.value }))}>{quizOptions.motion.map((value) => <option key={value}>{value}</option>)}</select></label>
          <label>{t("settings.video.mood")}<select value={quiz.mood} onChange={(event) => setQuiz((current) => ({ ...current, mood: event.target.value }))}>{quizOptions.mood.map((value) => <option key={value}>{value}</option>)}</select></label>
          <button className="button primary" type="button" onClick={completeQuiz}>{t("settings.video.buildScenario")}</button>
          <button className="button secondary" type="button" onClick={() => setQuizOpen(false)}>{t("settings.video.back")}</button>
        </>}
      </div>
    </div>}
  </section>;
}
