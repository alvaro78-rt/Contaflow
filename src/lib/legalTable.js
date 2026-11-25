import { unscoped } from '@/api/base44Client';

// A tabela legal é global (vale para todas as empresas) e é escolhida pela vigência.
export const inForce = (table, competence) => {
  if (!table || !competence || table.active === false) return false;
  const start = table.start_competence || '';
  const end = table.end_competence || '';
  return (!start || competence >= start) && (!end || competence <= end);
};

export const vigenciaLabel = (t) =>
  `${t?.start_competence || '—'}${t?.end_competence ? ` a ${t.end_competence}` : ' em vigor'}`;

export async function loadLegalTable(competence) {
  const { items } = await unscoped.entities.LegalTable.filter({}, { sort: '-start_competence', limit: 100 });
  return items.find((t) => inForce(t, competence)) || null;
}

export async function loadLegalTables() {
  const { items } = await unscoped.entities.LegalTable.filter({}, { sort: '-start_competence', limit: 100 });
  return items;
}
