// Regras de apresentação do formulário de folha. A validação final permanece no backend.
const operationalMonth = (today = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Recife', year: 'numeric', month: '2-digit',
  }).formatToParts(today);
  const get = (type) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get('year'), month: get('month') };
};

export function lastClosedCompetence(today = new Date()) {
  const { year, month } = operationalMonth(today);
  const y = month === 1 ? year - 1 : year;
  const m = month === 1 ? 12 : month - 1;
  return `${y}-${String(m).padStart(2, '0')}`;
}

const isDate = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + 'T00:00:00Z');
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};

const dateOfLastDay = (competence) => {
  const [year, month] = competence.split('-').map(Number);
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
};

export function payrollFormProblems({
  competence, paymentDate, taxDependents, dsrExtra, dsrDiscount, reviewedInputs,
}, today = new Date()) {
  const issues = [];
  const validComp = /^\d{4}-(0[1-9]|1[0-2])$/.test(competence || '');
  if (!validComp) issues.push('Selecione uma competência válida.');
  else if (competence > lastClosedCompetence(today)) {
    issues.push('A competência ainda não terminou. Selecione um mês encerrado, como ' +
      lastClosedCompetence(today) + '.');
  }

  if (!isDate(paymentDate)) {
    issues.push('Informe a data prevista ou efetiva de pagamento.');
  } else if (validComp && paymentDate < dateOfLastDay(competence)) {
    issues.push('A data de pagamento não pode ser anterior ao último dia da competência.');
  }

  const dependents = Number(taxDependents);
  if (taxDependents === '' || taxDependents == null ||
      !Number.isInteger(dependents) || dependents < 0 || dependents > 99) {
    issues.push('Confirme o número de dependentes fiscais (informe 0 quando não houver).');
  }

  for (const [value, label] of [
    [dsrExtra, 'reflexo de horas extras no DSR'],
    [dsrDiscount, 'desconto de DSR'],
  ]) {
    const amount = Number(value);
    if (value === '' || value == null || !Number.isFinite(amount) ||
        amount < 0 || Math.abs(amount * 100 - Math.round(amount * 100)) >= 0.00001) {
      issues.push('Informe o ' + label + ' em reais, inclusive 0 quando inaplicável.');
    }
  }

  if (!reviewedInputs) {
    issues.push('Confirme a conferência do ponto, salário, rubricas e condições do período.');
  }
  return issues;
}

/** Only completed payroll competences are available for final-month calculation. */
export function admissionMonth(admissionDate) {
  if (!isDate(admissionDate)) return null;
  return admissionDate.slice(0, 7);
}

export function suggestedCompetence(currentCompetence, admissionDate, lastClosed = lastClosedCompetence()) {
  const firstMonth = admissionMonth(admissionDate);
  if (firstMonth && firstMonth > currentCompetence && firstMonth <= lastClosed) return firstMonth;
  return currentCompetence;
}

export function competenceAdmissionProblem(competence, admissionDate, lastClosed = lastClosedCompetence()) {
  const firstMonth = admissionMonth(admissionDate);
  if (!firstMonth) return 'Confira a data de admissão no cadastro do funcionário.';
  if (competence > lastClosed) return 'A competência ainda não está encerrada. Selecione um mês já encerrado.';
  if (competence < firstMonth) {
    return firstMonth > lastClosed
      ? 'O funcionário foi admitido em ' + firstMonth +
        '. Ainda não existe uma competência encerrada desde a admissão.'
      : 'O funcionário foi admitido em ' + firstMonth +
        '. Selecione essa competência ou um mês posterior para processar a folha.';
  }
  return '';
}
