import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { loadSession } from '../../shared/sessionGuard.ts';

const respond = (status, error) => Response.json({ error }, { status });
const KINDS = ['entry', 'break_start', 'break_end', 'exit'];
const TZ = 'America/Recife'; // Fuso operacional inicial do ContaFlow; configurável em evolução futura.
const clockParts = () => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date());
  const v = (key) => parts.find((p) => p.type === key)?.value || '';
  return { date: `${v('year')}-${v('month')}-${v('day')}`, time: `${v('hour')}:${v('minute')}` };
};

export default async function (req) {
  if (req.method !== 'POST') return respond(405, 'metodo_invalido');
  try {
    const body = await req.json().catch(() => null);
    const client = createClientFromRequest(req);
    const loaded = await loadSession(client, body?.token);
    if (loaded.error) return respond(loaded.status, loaded.error);
    const { actor } = loaded;
    if (!actor.company_id || actor.status === 'desligado') return respond(403, 'conta_desligada');
    const entities = client.asServiceRole.entities;
    const company = await entities.Company.get(actor.company_id)
      .catch((e) => e.status === 404 ? null : Promise.reject(e));
    if (!company || company.status === 'inativa') return respond(403, 'conta_desligada');

    const action = body?.action || 'summary';
    if (!['summary', 'clock', 'payslip'].includes(action)) return respond(400, 'acao_invalida');

    if (action === 'clock') {
      if ((actor.access_role || 'funcionario') !== 'funcionario') return respond(403, 'sem_permissao');
      const kind = String(body?.kind || '');
      if (!KINDS.includes(kind)) return respond(400, 'tipo_invalido');
      const now = clockParts();
      const recent = await entities.TimeRecord.filter({
        company_id: actor.company_id, employee_id: actor.id, date: now.date,
      }, { sort: 'kind', limit: 25 });
      if (!Array.isArray(recent.items) || recent.next_cursor) return respond(409, 'ponto_requer_conferencia');
      if (recent.items.some((item) => item.kind === kind)) return respond(409, 'marcacao_duplicada');
      const last = recent.items.length ? Math.max(...recent.items.map((r) => KINDS.indexOf(r.kind))) : -1;
      const next = KINDS.indexOf(kind);
      // Intervalo é opcional: entry -> exit é permitido.
      if ((last < 0 && next !== 0) || (last === 0 && ![1, 3].includes(next)) ||
          (last === 1 && next !== 2) || (last === 2 && next !== 3) || last >= 3) {
        return respond(409, 'sequencia_invalida');
      }
      const record = await entities.TimeRecord.create({
        company_id: actor.company_id,
        employee_id: actor.id, date: now.date, kind, original_time: now.time,
        recorded_at: new Date().toISOString(), source: 'employee_web',
      });
      return Response.json({ ok: true, record: {
        id: record.id, date: record.date, kind: record.kind, original_time: record.original_time,
      }, timezone: TZ });
    }

    if (action === 'payslip') {
      const competence = String(body?.competence || '');
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(competence)) return respond(400, 'competencia_invalida');
      const result = await entities.Payroll.filter({
        company_id: actor.company_id, employee_id: actor.id, competence, status: 'finalizada',
      }, { limit: 2 });
      if (result.items.length > 1) return respond(409, 'folhas_duplicadas');
      return Response.json({ ok: true, payroll: result.items[0] || null });
    }

    const current = clockParts();
    const requested = String(body?.competence || '');
    const competence = /^\d{4}-(0[1-9]|1[0-2])$/.test(requested) ? requested : current.date.slice(0, 7);
    const [folhas, pontos] = await Promise.all([
      entities.Payroll.filter({
        company_id: actor.company_id, employee_id: actor.id, status: 'finalizada',
      }, { sort: '-competence', limit: 12 }),
      entities.TimeRecord.filter({
        company_id: actor.company_id, employee_id: actor.id,
        date: { $gte: `${competence}-01`, $lte: `${competence}-31` },
      }, { sort: 'date', limit: 500 }),
    ]);
    return Response.json({
      ok: true,
      employee: {
        id: actor.id, full_name: actor.full_name || '',
        access_role: actor.access_role || 'funcionario', company_name: company.name || '',
      },
      competence,
      payrolls: folhas.items.map((p) => ({
        id: p.id, competence: p.competence, total_earnings: p.total_earnings,
        total_deductions: p.total_deductions, net_salary: p.net_salary, status: p.status,
      })),
      time: {
        records: pontos.items.map((r) => ({
          id: r.id, date: r.date, kind: r.kind,
          original_time: r.original_time || '', corrected_time: r.corrected_time || '',
        })),
      },
      timezone: TZ,
    });
  } catch {
    return respond(500, 'falha_servidor');
  }
}
