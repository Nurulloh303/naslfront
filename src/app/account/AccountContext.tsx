import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { accountApi, type AccountSnapshot, type AccountUser } from "./accountApi";

type Credentials = { email: string; password: string };
type Registration = Credentials & { name: string };

type AccountContextValue = {
  account: AccountSnapshot | null;
  loading: boolean;
  error: string | null;
  login: (input: Credentials) => Promise<void>;
  loginWithGoogle: (credential: string) => Promise<void>;
  loginWithTelegram: (payload: Record<string, unknown>) => Promise<void>;
  register: (input: Registration) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<AccountSnapshot | null>;
  updateProfile: (input: Pick<AccountUser, "name" | "email" | "language">) => Promise<void>;
  setBalance: (balance: number) => void;
};

const AccountContext = createContext<AccountContextValue | null>(null);

export function AccountProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<AccountSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void accountApi.session().then((session) => { if (active) setAccount(session.account); }).catch(() => { if (active) setAccount(null); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const runAuth = useCallback(async (action: () => Promise<{ account: AccountSnapshot }>) => {
    setLoading(true);
    setError(null);
    try { setAccount((await action()).account); }
    catch (reason) { const message = reason instanceof Error ? reason.message : "Kirishda xatolik"; setError(message); throw reason; }
    finally { setLoading(false); }
  }, []);

  const refresh = useCallback(async () => {
    try {
      const next = await accountApi.get();
      setAccount(next);
      return next;
    } catch (reason) {
      if (reason instanceof Error && /Kabinetga kiring/.test(reason.message)) setAccount(null);
      return null;
    }
  }, []);

  const value = useMemo<AccountContextValue>(() => ({
    account,
    loading,
    error,
    login: (input) => runAuth(() => accountApi.login(input)),
    loginWithGoogle: (credential) => runAuth(() => accountApi.loginWithGoogle(credential)),
    loginWithTelegram: (payload) => runAuth(() => accountApi.loginWithTelegram(payload)),
    register: (input) => runAuth(() => accountApi.register(input)),
    logout: async () => { try { await accountApi.logout(); } finally { setAccount(null); } },
    refresh,
    updateProfile: async (input) => { setAccount(await accountApi.updateProfile(input)); },
    setBalance: (balance) => setAccount((current) => current ? { ...current, balance } : current),
  }), [account, error, loading, refresh, runAuth]);

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

export function useAccount() {
  const value = useContext(AccountContext);
  if (!value) throw new Error("useAccount must be used inside AccountProvider");
  return value;
}
