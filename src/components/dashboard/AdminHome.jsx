import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { MODULES } from '@/lib/modules';
import { currentCompetence, competenceLabel, money } from '@/lib/format';

export default function AdminHome() {
  const [kpi, setKpi] = useState(null);
  const [erro, setErro] = useState('');
  const [loading, setLoading] = useState(true);
  const comp = currentCompetence();

  // Falha de leitura nunca vira "zero funcionários" nem "folha zerada".
  const load = async () => {
    setLoading(true);
    setErro('');
    try {
      const [ativos, afastados, agg, pay, fin] = await Promise.all([
        base44.entities.Employee.count({ $or: [{ status: 'ativo' }, { status: { $exists: false } }] }),
        base44.entities.Employee.count({ status: 'afastado' }),
        base44.entities.Payroll.aggregate({ query: { competence: comp }, sum: ['total_earnings', 'total_deductions', 'net_salary'] }),
        base44.entities.Payroll.count({ competence: comp }),
        base44.entities.Payroll.count({ competence: comp, status: 'finalizada' }),
      ]);
      const row = agg?.rows?.[0] || {};
      setKpi({
        ativos, afastados, pay, fin,
        prov: row.sum_total_earnings || 0,
        desc: row.sum_total_deductions || 0,
        liq: row.sum_net_salary || 0,
      });
    } catch {
      setKpi(null);
      setErro('Não foi possível carregar os números desta empresa. Nada aqui é exibido como zero por segurança.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [comp]);

  const stats = kpi
    ? [
        ['Funcionários ativos', kpi.ativos],
        ['Afastados', kpi.afastados],
        [`Folhas · ${competenceLabel(comp)}`, kpi.pay],
        ['Finalizadas', kpi.fin],
        ['Total de proventos', money(kpi.prov)],
        ['Total de descontos', money(kpi.desc)],
        ['Líquido a pagar', money(kpi.liq)],
      ]
    : [];

  return (
    <div>
      <div className="mb-10 grid gap-8 border-b border-border pb-10 md:grid-cols-[1.4fr_1fr] md:items-end">
        <div>
          <p className="mb-3 font-mono text-xs text-emerald-700">[PAINEL INICIAL]</p>
          <h1 className="text-4xl font-semibold leading-[1.1] tracking-tight md:text-5xl">Folha de pagamento,<br />com cada número conferido.</h1>
          <p className="mt-4 max-w-xl text-muted-foreground">Escolha uma área para cadastrar, controlar o ponto, processar a folha e emitir contracheques e relatórios.</p>
        </div>
        <div className="grid grid-cols-2 gap-px border border-border bg-border">
          {loading && !kpi && (
            <div className="col-span-2 bg-card px-4 py-4">
              <p className="text-xs text-muted-foreground">Carregando os números desta empresa…</p>
            </div>
          )}
          {erro && (
            <div className="col-span-2 space-y-3 bg-card px-4 py-4">
              <p className="border border-destructive bg-red-50 px-3 py-2 text-xs text-destructive">{erro}</p>
              <button onClick={load} disabled={loading} className="border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:border-emerald-600 hover:text-emerald-700 disabled:opacity-50">
                {loading ? 'Tentando…' : 'Tentar novamente'}
              </button>
            </div>
          )}
          {stats.map(([k, v]) => (
            <div key={k} className="bg-card px-4 py-4">
              <p className="font-mono text-xl font-semibold sm:text-2xl">{v}</p>
              <p className="text-xs text-muted-foreground">{k}</p>
            </div>
          ))}
        </div>
      </div>
      <div className="grid gap-px border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
        {MODULES.map((m) => (
          <Link key={m.path} to={m.path} className="group relative bg-card p-6 transition-colors hover:bg-accent">
            <div className="mb-8 flex items-center justify-between">
              <m.icon className="h-6 w-6 text-primary transition-colors group-hover:text-emerald-700" strokeWidth={1.5} />
              <span className="font-mono text-xs text-muted-foreground">[{m.code}]</span>
            </div>
            <h2 className="font-semibold">{m.title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{m.desc}</p>
            <span className="absolute bottom-0 left-0 h-0.5 w-0 bg-emerald-600 transition-all duration-500 group-hover:w-full" />
          </Link>
        ))}
      </div>
    </div>
  );
}