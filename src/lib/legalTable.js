// A tabela legal é global (vale para todas as empresas) e é escolhida pela vigência.
export const inForce = (table, competence) => {
  if (!table || !competence || table.active === false) return false;
  const start = table.start_competence || '';
  const end = table.end_competence || '';
  return (!start || competence >= start) && (!end || competence <= end);
};

export const vigenciaLabel = (t) =>
  `${t?.start_competence || '—'}${t?.end_competence ? ` a ${t.end_competence}` : ' em vigor'}`;
