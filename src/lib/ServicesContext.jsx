import { createContext, useContext } from 'react';
import { base44 } from '@/api/base44Client';

// Serviços reais: as funções de backend do app.
export const realServices = {
  invoke: (name, payload) => base44.functions.invoke(name, payload),
};

// A demonstração troca este valor por um backend em memória.
const ServicesContext = createContext(null);

export function ServicesProvider({ services, children }) {
  return <ServicesContext.Provider value={services || null}>{children}</ServicesContext.Provider>;
}

export const useServices = () => useContext(ServicesContext) || realServices;