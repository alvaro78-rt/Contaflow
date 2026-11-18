import { createContext, useContext, useState } from 'react';

const KEY = 'folha_session';
export const SessionContext = createContext(null);

const read = () => {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY));
    if (!stored) return null;
    // Sessões antigas (sem empresa) precisam entrar de novo.
    if (!stored.master && !stored.company_id) return null;
    return stored;
  } catch {
    return null;
  }
};

export function SessionProvider({ children }) {
  const [session, setSession] = useState(read);
  const login = (data) => { localStorage.setItem(KEY, JSON.stringify(data)); setSession(data); };
  const logout = () => { localStorage.removeItem(KEY); setSession(null); };
  return <SessionContext.Provider value={{ session, login, logout }}>{children}</SessionContext.Provider>;
}

export const useSession = () => useContext(SessionContext);