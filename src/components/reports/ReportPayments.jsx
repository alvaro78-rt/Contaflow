import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import Field from '@/components/Field';
import Empty from '@/components/Empty';
import Choice from '@/components/benefits/Choice';
import { downloadCsv } from '@/lib/csv';
import { money, currentCompetence, formatCpf, competenceLabel } from '@/lib/format';

const num = (v) => (Number(v) || 0).toFixed(2).replace('.', ',');

export default function ReportPayments({ mode = 'payments' }) {
  const comp = currentCompetence();
  const [from, setFrom] = useState(comp);
  const [to, setTo] = useState(comp);
  const [department, setDepartment] = useState('all');
  const [departments, setDepartments] = useState([]);
  const [rows, setRows] = useState([]);

  useEffect(() => {
    base44.entities.Payroll.filter({}, { sort: 'department', limit: 500 }).then((r) => {
      setDepartments([...new Set(r.items.map((p) => p.department).filter(Boolean))]);
    });
  }, []);

  useEffect(() => {
    const query = {};
    if (from && to) query.competence = { $gte: from, $lte: to };
    else if (from) query.competence = { $gte: from };
    else if (to) query.competence = { $lte: to };
    if (department !== 'all') query.department = department;
    base44.entities.Payroll.filter(query, { sort: 'employee_name', limit: 1000 }).then((r) => setRows(r.items));
  }, [from, to, department]);

  const sum = (key) => rows.reduce((a, b) => a + (b[key] || 0), 0);
  const fgts = (p) => (p.informatives || []).find((i) => i.description.startsWith('FGTS'))?.value || 0;

  const exportCsv = () => {
    const headers = mode === 'fgts'
      ? ['Competência', 'Funcionário', 'CPF', 'Base', 'FGTS']
      : ['Competência', 'Funcionário', 'CPF', 'Salário-base', 'Proventos', 'Descontos', 'Líquido'];
    const data = rows.map((p) => (mode === 'fgts'
      ? [competenceLabel(p.competence), p.employee_name, formatCpf(p.employee_cpf), num(p.total_earnings), num(fgts(p))]
      : [competenceLabel(p.competence), p.employee_name, formatCpf(p.employee_cpf), num(p.base_salary), num(p.total_earnings), num(p.total_deductions), num(p.net_salary)]));
    downloadCsv(`folha-${mode}-${from || 'inicio'}-${to || 'fim'}.csv`, headers, data);
  };

  const period = from && to && from === to ? competenceLabel(from) : `${from ? competenceLabel(from) : 'início'} a ${to ? competenceLabel(to) : 'fim'}`;

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[170px_170px_1fr_auto] lg:items-end print:hidden">
        <Field label="Período — de"><Input type="month" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="Até"><Input type="month" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        <Field label="Departamento">
          <Choice value={department} onChange={setDepartment} options={[['all', 'Todos os departamentos'], ...departments.map((d) => [d, d])]} />
        </Field>
        <Button variant="outline" onClick={exportCsv} disabled={rows.length === 0}>Exportar CSV</Button>
      </div>

      <p className="font-mono text-xs text-muted-foreground print:hidden">Período: {period} · {rows.length} folha(s)</p>

      {rows.length === 0 ? <Empty>Nenhuma folha registrada para este filtro.</Empty> : (
        <>
          {mode === 'summary' && (
            <div className="grid gap-px border border-border bg-border sm:grid-cols-4">
              {[['Folhas', rows.length, false], ['Total de proventos', sum('total_earnings'), true], ['Total de descontos', sum('total_deductions'), true], ['Total líquido', sum('net_salary'), true]].map(([k, v, m]) => (
                <div key={k} className="bg-card px-4 py-4">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{k}</p>
                  <p className="font-mono text-xl font-semibold">{m ? money(v) : v}</p>
                </div>
              ))}
            </div>
          )}
          <div className="overflow-x-auto border border-border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2">Competência</th>
                  <th className="px-4 py-2">Funcionário</th>
                  <th className="px-4 py-2">CPF</th>
                  <th className="px-4 py-2">Departamento</th>
                  {mode === 'fgts' ? <><th className="px-4 py-2 text-right">Base</th><th className="px-4 py-2 text-right">FGTS</th></> : <>
                    <th className="px-4 py-2 text-right">Salário-base</th><th className="px-4 py-2 text-right">Proventos</th><th className="px-4 py-2 text-right">Descontos</th><th className="px-4 py-2 text-right">Líquido</th></>}
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id} className="border-b border-border/60">
                    <td className="px-4 py-2 whitespace-nowrap">{competenceLabel(p.competence)}</td>
                    <td className="px-4 py-2">{p.employee_name}</td>
                    <td className="px-4 py-2 font-mono text-xs">{formatCpf(p.employee_cpf)}</td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">{p.department || '—'}</td>
                    {mode === 'fgts' ? <><td className="px-4 py-2 text-right font-mono">{money(p.total_earnings)}</td><td className="px-4 py-2 text-right font-mono">{money(fgts(p))}</td></> : <>
                      <td className="px-4 py-2 text-right font-mono">{money(p.base_salary)}</td>
                      <td className="px-4 py-2 text-right font-mono">{money(p.total_earnings)}</td>
                      <td className="px-4 py-2 text-right font-mono">{money(p.total_deductions)}</td>
                      <td className="px-4 py-2 text-right font-mono font-semibold">{money(p.net_salary)}</td></>}
                  </tr>
                ))}
                {mode === 'fgts' && (
                  <tr className="font-semibold"><td className="px-4 py-2" colSpan={5}>Total a recolher (informativo)</td><td className="px-4 py-2 text-right font-mono">{money(rows.reduce((a, p) => a + fgts(p), 0))}</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {mode === 'fgts' && <p className="text-xs text-muted-foreground">Apenas informativo: a emissão de guia de recolhimento ainda está pendente de definição.</p>}
        </>
      )}
    </div>
  );
}