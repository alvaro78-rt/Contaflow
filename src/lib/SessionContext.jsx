import { createContext, useCallback, useContext, useEffect, useState } from 'react';

const KEY = 'folha_session';
export const SessionContext = createContext(null);

const read = () => {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY));
    if (!stored?.id || typeof stored.token !== 'string' || !stored.token.trim()) return null;
    if (stored.expires_at && !(Date.parse(stored.expires_at) > Date.now())) return null;
    // Sessões antigas (sem empresa) precisam entrar de novo.
    if (!stored.master && !stored.company_id) return null;
    return stored;
  } catch {
    return null;
  }
};

export function SessionProvider({ children }) {
  const [session, setSession] = useState(read);
  const [expired, setExpired] = useState(false);
  const login = (data) => { setExpired(false); localStorage.setItem(KEY, JSON.stringify(data)); setSession(data); };
  const logout = useCallback((reason) => {
    setExpired(reason === 'expired');
    localStorage.removeItem(KEY);
    setSession(null);
  }, []);
  useEffect(() => {
    const sync = (event) => {
      if (event.storageArea === localStorage && (event.key === KEY || event.key === null)) {
        // Recarrega os dados da empresa e descarta formulários abertos na sessão anterior.
        window.location.reload();
      }
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);
  return <SessionContext.Provider value={{ session, login, logout, expired }}>{children}</SessionContext.Provider>;
}

export const useSession = () => useContext(SessionContext);