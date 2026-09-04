import { useEffect, useRef, useState, type FormEvent } from "react";
import { CreateCardPage } from "../features/create/CreateCardPage";
import { AccountProvider, useAccount } from "./account/AccountContext";
import { SocialAuth } from "./account/SocialAuth";
import { ApiPage, BillingPage, HistoryPage, OfferPage, PrivacyPage, ProfilePage, ProjectsPage, ReferralsPage, TermsPage } from "./cabinet/CabinetPages";
import { AuditPage } from "./cabinet/AuditPage";
import { ListingPage } from "./cabinet/ListingPage";
import { AdminPage } from "./admin/AdminPage";
import { BrandMark } from "./BrandMark";
import { WelcomeTour } from "./onboarding/WelcomeTour";
import { routeFromHash, type CabinetRoute } from "./routes";
import { useLanguage } from "../i18n/LanguageContext";

export function App() {
  return <AccountProvider><AppContent /></AccountProvider>;
}

function AppContent() {
  const [route, setRoute] = useState<CabinetRoute>(() => routeFromHash(window.location.hash));
  const [isRouteLoading, setRouteLoading] = useState(false);
  const [pendingRoute, setPendingRoute] = useState<CabinetRoute | null>(null);
  const [introLoading, setIntroLoading] = useState(true);
  const { account, loading, logout } = useAccount();
  const { t } = useLanguage();

  useEffect(() => {
    const timer = window.setTimeout(() => setIntroLoading(false), 1150);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const onHashChange = () => setRoute(routeFromHash(window.location.hash));
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const navigate = (next: CabinetRoute) => {
    if (next === route) return;
    const applyRoute = () => {
      window.location.hash = next === "create" ? "top" : next;
      setRoute(next);
      window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    };
    setPendingRoute(next);
    setRouteLoading(true);
    window.setTimeout(() => {
      applyRoute();
      window.setTimeout(() => {
        setRouteLoading(false);
        setPendingRoute(null);
      }, 120);
    }, 260);
  };

  const signOut = () => { void logout(); };
  const page = introLoading ? <IntroLoader />
    : loading && !account ? <AppBootLoader />
    : !account ? <AuthPage />
    : route === "create" ? <CreateCardPage onNavigate={navigate} onLogout={signOut} />
    : route === "projects" ? <ProjectsPage onNavigate={navigate} onLogout={signOut} />
    : route === "billing" ? <BillingPage onNavigate={navigate} onLogout={signOut} />
    : route === "history" ? <HistoryPage onNavigate={navigate} onLogout={signOut} />
    : route === "profile" ? <ProfilePage onNavigate={navigate} onLogout={signOut} />
    : route === "referrals" ? <ReferralsPage onNavigate={navigate} onLogout={signOut} />
    : route === "privacy" ? <PrivacyPage onNavigate={navigate} onLogout={signOut} />
    : route === "terms" ? <TermsPage onNavigate={navigate} onLogout={signOut} />
    : route === "offer" ? <OfferPage onNavigate={navigate} onLogout={signOut} />
    : route === "audit" ? <AuditPage onNavigate={navigate} onLogout={signOut} />
    : route === "listing" ? <ListingPage onNavigate={navigate} onLogout={signOut} />
    : route === "admin" ? <AdminPage onNavigate={navigate} onLogout={signOut} />
    : <ApiPage onNavigate={navigate} onLogout={signOut} />;

  return <>
    <div className="app-route-shell" key={route}>{page}</div>
    {/* Раньше здесь было `&& !isRouteLoading`: при переходе между разделами
        компонент размонтировался и монтировался заново, а вместе с ним
        заново запускалось приветствие. */}
    {account && <WelcomeTour userId={account.user.id} userName={account.user.name} />}
    {isRouteLoading && <div className="route-loader" role="status" aria-live="polite">
      <div className="route-loader-card"><span /><b>{t("loader.route")}</b><small>{labelForRoute(pendingRoute ?? route, t)}</small></div>
    </div>}
  </>;
}

function IntroLoader() {
  const { t } = useLanguage();
  const [percent, setPercent] = useState(0);
  // 0 → 100 за ~900 мс: в начале быстро, к концу чуть притормаживает.
  useEffect(() => {
    let frame = 0;
    const started = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - started) / 900);
      setPercent(Math.round((1 - Math.pow(1 - progress, 2.4)) * 100));
      if (progress < 1) frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, []);

  return <main className="intro-loader" role="status" aria-live="polite">
    <b className="intro-brand"><BrandMark size={34} /> {t("auth.logo")}</b>
    <div className="intro-bar" aria-hidden="true"><i style={{ width: `${percent}%` }} /></div>
    <div className="intro-meta">
      <span>{t("loader.intro")}</span>
      <em>{percent}%</em>
    </div>
  </main>;
}

function AppBootLoader() {
  const { t } = useLanguage();
  return <main className="reference-app auth-page"><div className="route-loader-card" role="status"><span /><b>{t("loader.session")}</b><small>Naslai Studio</small></div></main>;
}

function AuthPage() {
  const { login, register, loading, error } = useAccount();
  const { t } = useLanguage();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [localError, setLocalError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const authFormRef = useRef<HTMLElement>(null);
  const changeMode = (next: "login" | "register") => {
    setMode(next);
    setLocalError("");
    setName("");
    setEmail("");
    setPassword("");
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setLocalError("");
    try {
      if (mode === "login") await login({ email, password });
      else await register({ name, email, password });
    } catch (reason) {
      setLocalError(reason instanceof Error ? reason.message : t("auth.failed"));
    }
  };

  return <main className="reference-app auth-split">
    <section className="auth-split-left">
      <span className="auth-logo-mark"><BrandMark size={26} /> {t("auth.logo")}</span>
      <h1>{t("auth.heroTitle")}</h1>
      <p>{t("auth.heroText")}</p>
      <div className="auth-marketplaces" aria-hidden="true">
        <span>Uzum</span><span>Wildberries</span><span>Ozon</span><span>✦ AI</span>
      </div>
    </section>

    <section className="auth-split-right">
      <section className="auth-card auth-form-card" ref={authFormRef} aria-labelledby="auth-title">
        <p className="eyebrow">{t("auth.eyebrow")}</p>
        <h2 id="auth-title" className="sr-only">{mode === "login" ? t("auth.loginTitle") : t("auth.registerTitle")}</h2>
        <div className="auth-tabs" aria-label={t("auth.tabsAria")}>
          <button type="button" aria-pressed={mode === "login"} onClick={() => changeMode("login")}>{t("auth.loginTitle")}</button>
          <button type="button" aria-pressed={mode === "register"} onClick={() => changeMode("register")}>{t("auth.registerTab")}</button>
        </div>
        <form className="auth-form" onSubmit={(event) => void submit(event)}>
          {mode === "register" && <label>{t("auth.name")}<input autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} required maxLength={80} /></label>}
          <label>Email<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
          <label>{t("auth.password")}
            <span className="pass-wrap">
              <input type={showPassword ? "text" : "password"} autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} required />
              <button type="button" className="pass-eye" aria-label={showPassword ? t("auth.hidePassword") : t("auth.showPassword")} onClick={() => setShowPassword((value) => !value)}>{showPassword ? "◎" : "◉"}</button>
            </span>
          </label>
          {(localError || error) && <p className="auth-error" role="alert">{localError || error}</p>}
          <button className="button primary" type="submit" disabled={loading}>{loading ? t("auth.checking") : mode === "login" ? t("auth.loginTitle") : t("auth.submitRegister")}</button>
        </form>
        <SocialAuth onError={setLocalError} />
      </section>
    </section>
  </main>;
}

function labelForRoute(route: CabinetRoute, t: (path: string) => string) {
  return t(`routes.${route}`);
}
