import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { LanguageProvider } from "./i18n/LanguageContext";
import "./styles/tokens.css";
import "./styles/global.css";
import { applyStoredTheme } from "./app/ThemeSwitcher";

applyStoredTheme();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <LanguageProvider>
      <App />
    </LanguageProvider>
  </StrictMode>,
);
