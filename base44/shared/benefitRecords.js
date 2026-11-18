import { hasUnscopedHistory, validDate, withEmployeeLock } from './attendance.js';
import { calcInss, calcIrrf } from './payrollCalculation.js';
import { consistentReceipt, verifiedTable } from './payrollReview.js';

export const benefitEntities = new Map([['ferias', 'Vacation'], ['decimo', 'ThirteenthSalary'], ['rescisao', 'Termination']]);
const round = (n) => Math.round(n * 100) / 100;
const answer = (status, data) => Response.json(data, { status });
const reject = (message) => answer(422, { error: 'dados_incompletos', problems: [message] });
const amount = (n) =>
  Number.isFinite(n) && n >= 0 && n <= 1e9 && Math.abs(n * 100 - Math.round(n * 100)) < .00001;
const dayCount = (a, b) => (Date.parse(b) - Date.parse(a)) / 86400000 + 1;

export async function recordBenefit({ entities, companyId, actor }, employee, body) {
  const entity = entities[benefitEntities.get(body.module)];
  const input = body.record;
  if (
    !entity || !input || !employee.full_name || !employee.cpf || !validDate(input.payment_date) ||
    !validDate(employee.admission_date) ||
    typeof input.reference !== 'string' || !input.reference.trim() || input.reference.length > 180 ||
    input.confirmed !== true
  ) {
    return reject('Informe o documento de conferência, admissão e data de pagamento.');
  }
  const scope = { company_id: companyId, employee_id: employee.id };
  return withEmployeeLock(entities, employee, async () => {
    if (await hasUnscopedHistory(entity, { employee_id: employee.id })) {
      return answer(409, { error: 'historico_sem_empresa' });
    }
    let record;
    if (body.module === 'decimo') {
      const { year, months_worked, remuneration, advance, tax_dependents } = input;
      if (
        typeof year !== 'string' || !/^\d{4}$/.test(year) || year !== input.payment_date.slice(0, 4) ||
        employee.contract_type !== 'CLT' ||
        !Number.isInteger(months_worked) || months_worked < 1 || months_worked > 12 ||
        !amount(remuneration) || remuneration <= 0 ||
        !amount(advance) || !Number.isInteger(tax_dependents) || tax_dependents < 0 || tax_dependents > 99
      ) {
        return reject(
          'Confira salário de dezembro com médias, avos, adiantamento efetivo e dependentes fiscais.',
        );
      }
      let maximum = 0;
      for (let m = 1; m <= 12; m++) {
        const end = new Date(Date.UTC(Number(year), m, 0)).toISOString().slice(0, 10);
        const start = end.slice(0, 8) + '01';
        if (dayCount(start > employee.admission_date ? start : employee.admission_date, end) >= 15) maximum++;
      }
      if (months_worked > maximum) return reject('Avos incompatíveis com a admissão.');
      const existing = await entity.filter({ ...scope, year }, { limit: 1 });
      if (existing.items.length) return answer(409, { error: 'beneficio_existente' });
      const competence = year + '-12';
      const tables = await entities.LegalTable.filter({}, { limit: 100 });
      const active = tables.items.filter((t) =>
        t.active !== false && t.start_competence && t.start_competence <= competence &&
        (!t.end_competence || t.end_competence >= competence)
      );
      if (
        tables.next_cursor || active.length !== 1 ||
        !verifiedTable(active[0], competence, input.payment_date) ||
        input.payment_date.slice(0, 7) !== competence
      ) return reject('Confira a tabela oficial e a data da quitação anual em dezembro.');
      const table = active[0];
      const gross = round(remuneration * months_worked / 12);
      const inss = calcInss(gross, table.inss_bands);
      const irrf = calcIrrf({
        earnings: gross,
        inss,
        dependents: tax_dependents,
        table,
        paymentDate: input.payment_date,
      }).tax;
      const total = round(inss + irrf);
      const net = round(gross - total);
      if (advance > net) {
        return reject('Adiantamento superior ao líquido anual. Concilie a diferença antes de registrar.');
      }
      record = {
        year,
        months_worked,
        competence,
        base_salary: remuneration,
        gross,
        inss,
        irrf,
        first_parcel: advance,
        second_parcel: round(net - advance),
        earnings: [{ description: '13º proporcional', value: gross }],
        deductions: [{ description: 'INSS sobre 13º', value: inss }, {
          description: 'IRRF sobre 13º',
          value: irrf,
        }],
        informatives: [{ description: 'Adiantamento já pago', value: advance }, {
          description: 'Saldo da segunda parcela',
          value: round(net - advance),
        }, { description: 'FGTS anual sobre o 13º', value: round(gross * table.fgts_rate) }],
        total_earnings: gross,
        total_deductions: total,
        net_salary: net,
        legal_table_label: table.label,
        status: 'a_pagar',
      };
    } else {
      const { earnings, deductions, total_earnings, total_deductions, net_salary } = input;
      if (
        ![earnings, deductions].every((a) =>
          Array.isArray(a) && a.length <= 80 &&
          a.every((i) =>
            typeof i?.description === 'string' && i.description.trim() && i.description.length <= 150 &&
            amount(i.value)
          )
        ) ||
        !consistentReceipt({ earnings, deductions, total_earnings, total_deductions, net_salary }) ||
        total_earnings <= 0
      ) {
        return reject(
          'Transcreva as verbas e os três totais do recibo. Os valores precisam conciliar em centavos.',
        );
      }
      const lines = (rows) => rows.map((i) => ({ description: i.description.trim(), value: i.value }));
      record = {
        earnings: lines(earnings),
        deductions: lines(deductions),
        total_earnings,
        total_deductions,
        net_salary,
      };
      if (body.module === 'ferias') {
        const { acquired_start, acquired_end, start_date, end_date, abono_days } = input;
        if (
          ![acquired_start, acquired_end, start_date, end_date].every(validDate) ||
          acquired_start < employee.admission_date ||
          acquired_end < acquired_start || start_date <= acquired_end || end_date < start_date ||
          !Number.isInteger(abono_days) || abono_days < 0 || abono_days > 10 ||
          dayCount(start_date, end_date) + abono_days > 30
        ) {
          return reject('Confira os períodos aquisitivo e de gozo e a quantidade de dias de abono.');
        }
        const existing = await entity.filter(scope, { limit: 500 });
        if (
          existing.next_cursor ||
          existing.items.some((r) =>
            !validDate(r.start_date) || !validDate(r.end_date) ||
            (r.start_date <= end_date && r.end_date >= start_date)
          )
        ) return reject('Há férias sobrepostas ou com período incompleto no histórico.');
        const days = dayCount(start_date, end_date);
        const used = existing.items.filter((r) => r.acquired_start === acquired_start)
          .reduce((n, r) => n + dayCount(r.start_date, r.end_date) + (r.abono_days || 0), 0);
        if (used + days + abono_days > 30) return reject('Os dias registrados excedem o período aquisitivo.');
        Object.assign(record, {
          acquired_start,
          acquired_end,
          start_date,
          end_date,
          days,
          abono_days,
          competence: start_date.slice(0, 7),
          status: 'programada',
        });
      } else {
        const { termination_date, type, notice } = input;
        if (
          !validDate(termination_date) || termination_date < employee.admission_date ||
          !['sem_justa_causa', 'com_justa_causa', 'pedido', 'acordo', 'termino'].includes(type) ||
          !['indenizado', 'trabalhado', 'dispensado'].includes(notice)
        ) return reject('Confira a data, a modalidade e o aviso do TRCT.');
        if ((await entity.filter({ ...scope, termination_date }, { limit: 1 })).items.length) {
          return answer(409, { error: 'beneficio_existente' });
        }
        Object.assign(record, {
          termination_date,
          type,
          notice,
          competence: termination_date.slice(0, 7),
          status: 'registrada',
        });
      }
    }
    const saved = await entity.create({
      ...scope,
      ...record,
      employee_name: employee.full_name,
      employee_cpf: employee.cpf,
      source_reference: input.reference.trim(),
      recorded_by: actor.id,
      payment_date: input.payment_date,
    });
    return answer(200, { ok: true, record: saved });
  });
}
