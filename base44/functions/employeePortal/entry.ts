import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { loadSession } from '../../shared/sessionGuard.ts';

// Área do funcionário: somente os próprios dados, ponto e contracheques.
export default async function (req) {
  if (req.method !== 'POST') {
    return Response.json({ error: 'metodo_invalido' }, { status: 405 });
  }

  const base44 = createClientFromRequest(req);
  const body = await req.json().catch(() => ({}));

  try {
    const loaded = await loadSession(base44, body?.token);
    if (loaded.error) return Response.json({ error: loaded.error }, { status: loaded.status });
    const { actor } = loaded;

    const info = String(body?.competence || '');
    const current = new Date();
    const competence = /^\d{4}-\d{2}$/.test(info)
      ? info
      : `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}`;

    const [folhas, pontos, company] = await Promise.all([
      base44.asServiceRole.entities.Payroll.filter(
        { employee_id: actor.id },
        { sort: '-competence', limit: 12 },
      ),
      base44.asServiceRole.entities.TimeRecord.filter(
        { employee_id: actor.id, date: { $gte: `${competence}-01`, $lte: `${competence}-31` } },
        { sort: 'date', limit: 500 },
      ),
      actor.company_id
        ? base44.asServiceRole.entities.Company.get(actor.company_id).catch((e) => (e.status === 404 ? null : Promise.reject(e)))
        : Promise.resolve(null),
    ]);

    if (!company || company.status === 'inativa') return Response.json({ error: 'conta_desligada' }, { status: 403 });
    return Response.json({
      ok: true,
      employee: {
        id: actor.id,
        full_name: actor.full_name || '',
        access_role: actor.access_role || 'funcionario',
        company_name: company?.name || '',
      },
      competence,
      payrolls: folhas.items.map((p) => ({
        id: p.id,
        competence: p.competence || '',
        total_earnings: p.total_earnings || 0,
        total_deductions: p.total_deductions || 0,
        net_salary: p.net_salary || 0,
        status: p.status || 'rascunho',
      })),
      time: {
        records: pontos.items.map((r) => ({
          id: r.id,
          date: r.date,
          kind: r.kind,
          original_time: r.original_time || '',
          corrected_time: r.corrected_time || '',
        })),
      },
    });
  } catch (error) {
    return Response.json({ error: 'falha_servidor', message: error.message }, { status: 500 });
  }
}