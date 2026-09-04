import { useEffect, useRef, useState } from "react";
import {
  CARD_HEIGHT,
  CARD_WIDTH,
  DEFAULT_TEXT_STYLE,
  drawTextLayer,
  loadImage,
  type TextLayerSlide,
  type TextLayerStyle,
} from "../domain/drawTextLayer";
import { useLanguage } from "../../../i18n/LanguageContext";

type Props = {
  /** Фон от модели — без единой буквы. */
  plateUrl: string;
  slide: TextLayerSlide;
  saving: boolean;
  onSave: (imageDataUrl: string) => void;
};

/**
 * Правка текста поверх готового фона.
 *
 * Всё, что здесь делает человек, бесплатно и мгновенно: буквы рисует
 * браузер, а не модель. Раньше любая правка заголовка означала новую
 * генерацию за токен — и новый шанс получить кривые буквы.
 *
 * Кнопка «Сохранить» кладёт собранную картинку в проект: иначе в архиве
 * остался бы фон без надписей.
 */
export function TextLayerEditor({ plateUrl, slide, saving, onSave }: Props) {
  const { t } = useLanguage();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const plateRef = useRef<HTMLImageElement | null>(null);
  const [text, setText] = useState<TextLayerSlide>(slide);
  const [style, setStyle] = useState<TextLayerStyle>(DEFAULT_TEXT_STYLE);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => { setText(slide); }, [slide]);

  useEffect(() => {
    let alive = true;
    setReady(false);
    setFailed(false);
    loadImage(plateUrl)
      .then((image) => {
        if (!alive) return;
        plateRef.current = image;
        setReady(true);
      })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [plateUrl]);

  // Перерисовываем на каждое изменение: отрисовка одного кадра занимает
  // единицы миллисекунд, отдельная кнопка «применить» здесь только мешала бы.
  useEffect(() => {
    if (!canvasRef.current || !ready) return;
    drawTextLayer(canvasRef.current, plateRef.current, text, style);
  }, [text, style, ready]);

  const save = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // PNG, а не JPEG: на границе белых букв и цветного фона JPEG даёт
    // цветную кайму, и на увеличении она хорошо видна.
    onSave(canvas.toDataURL("image/png"));
  };

  const setLine = (index: number, value: string) => {
    setText((current) => {
      const lines = [...current.lines];
      lines[index] = value;
      return { ...current, lines };
    });
  };

  if (failed) return <p className="reference-warning">{t("textLayer.plateFailed")}</p>;

  return <div className="text-layer">
    <div className="text-layer-preview">
      <canvas ref={canvasRef} width={CARD_WIDTH} height={CARD_HEIGHT} aria-label={t("textLayer.previewAria")} />
      {!ready ? <span className="text-layer-loading">{t("textLayer.loading")}</span> : null}
    </div>

    <div className="text-layer-controls">
      <p className="text-layer-lead">{t("textLayer.lead")}</p>

      <label className="prompt-block">
        <span>{t("textLayer.headline")}</span>
        <input value={text.headline} maxLength={40} onChange={(event) => setText({ ...text, headline: event.target.value })} />
      </label>

      <label className="prompt-block">
        <span>{t("textLayer.subtitle")}</span>
        <input value={text.subtitle} maxLength={40} onChange={(event) => setText({ ...text, subtitle: event.target.value })} />
      </label>

      <fieldset className="text-layer-lines">
        <legend>{t("textLayer.lines")}</legend>
        {[0, 1, 2].map((index) => <input
          key={index}
          value={text.lines[index] ?? ""}
          maxLength={70}
          placeholder={t("textLayer.linePlaceholder", { number: index + 1 })}
          onChange={(event) => setLine(index, event.target.value)}
        />)}
      </fieldset>

      <div className="text-layer-row">
        <label>
          <span>{t("textLayer.placement")}</span>
          <select value={style.placement} onChange={(event) => setStyle({ ...style, placement: event.target.value as TextLayerStyle["placement"] })}>
            <option value="top">{t("textLayer.placementTop")}</option>
            <option value="bottom">{t("textLayer.placementBottom")}</option>
          </select>
        </label>
        <label>
          <span>{t("textLayer.color")}</span>
          <input type="color" value={style.color} onChange={(event) => setStyle({ ...style, color: event.target.value })} />
        </label>
        <label>
          <span>{t("textLayer.accent")}</span>
          <input type="color" value={style.accent} onChange={(event) => setStyle({ ...style, accent: event.target.value })} />
        </label>
      </div>

      <div className="text-layer-row">
        <label className="text-layer-scale">
          <span>{t("textLayer.size")}</span>
          <input type="range" min={0.7} max={1.3} step={0.05} value={style.scale} onChange={(event) => setStyle({ ...style, scale: Number(event.target.value) })} />
        </label>
        <label className="text-layer-check">
          <input type="checkbox" checked={style.scrim} onChange={(event) => setStyle({ ...style, scrim: event.target.checked })} />
          <span>{t("textLayer.scrim")}</span>
        </label>
      </div>

      <button type="button" className="button primary" disabled={saving || !ready} onClick={save}>
        {saving ? t("textLayer.saving") : t("textLayer.save")}
      </button>
      <small>{t("textLayer.freeNote")}</small>
    </div>
  </div>;
}
