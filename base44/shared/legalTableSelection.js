import { validDate, validMonth } from './attendance.js';
import { tableParameterProblems } from './payrollReview.js';

// A tabela legal é global e escolhida pela vigência (competência e pagamento).
export const covers = (t, comp) =>
  Boolean(comp) && validMonth(t.start_competence) &&
  t.start_competence <= comp && (!t.end_competence || t.end_competence >= comp);

export const tableLabel = (t) => `"${t.label || t.start_competence}"`;

// Seleção da tabela legal com diagnóstico específico: ausente, inativa,
// ambígua, fora da vigência do pagamento ou com parâmetros divergentes.
// Cada falha devolve um código técnico seguro e uma mensagem própria.
export function legalTableCheck(tables, competence, paymentDate) {
  const codes = [];
  const known = tables.filter((t) => validMonth(t.start_competence));
  if (!known.length) {
    return {
      table: null,
      codes: ['tabela_ausente'],
      problems: ['Nenhuma tabela legal está cadastrada. Cadastre a tabela oficial em Parâmetros legais.'],
    };
  }
  const covering = known.filter((t) => covers(t, competence));
  const active = covering.filter((t) => t.active !== false);
  if (!active.length) {
    const inactive = covering[0];
    return {
      table: null,
      codes: [inactive ? 'tabela_inativa' : 'tabela_ausente_competencia'],
      problems: [inactive
        ? `A tabela legal ${tableLabel(inactive)} está inativa e não pode ser usada na competência ${competence}. Ative-a ou cadastre a tabela vigente.`
        : `Não há tabela legal com vigência para a competência ${competence}. Ajuste a vigência em Parâmetros legais.`],
    };
  }
  if (active.length > 1) {
    return {
      table: null,
      codes: ['tabelas_sobrepostas'],
      problems: [`Há ${active.length} tabelas legais vigentes na competência ${competence} (${active.map(tableLabel).join(', ')}). Deixe apenas uma vigente para evitar ambiguidade no cálculo.`],
    };
  }
  const table = active[0];
  const paymentCompetence = validDate(paymentDate) ? paymentDate.slice(0, 7) : '';
  if (!paymentCompetence || !covers(table, paymentCompetence)) {
    return {
      table,
      codes: ['pagamento_fora_vigencia'],
      problems: [`A data de pagamento (${paymentDate || 'não informada'}) está fora da vigência da tabela legal ${tableLabel(table)}. Confira a data ou a vigência da tabela.`],
    };
  }
  const invalid = tableParameterProblems(table);
  if (invalid.length) return { table, codes: ['parametros_invalidos'], problems: invalid };
  if (!competence.startsWith('2026-') || !paymentDate.startsWith('2026-')) {
    return {
      table,
      codes: ['competencia_sem_referencia'],
      problems: [`A versão atual da folha valida parâmetros oficiais apenas para competências e pagamentos de 2026. Competência ${competence}, pagamento ${paymentDate}.`],
    };
  }
  return { table, codes, problems: [] };
}
