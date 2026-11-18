import { useEffect, useState } from 'react';
import { escapeRegExp } from 'lodash';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import PageHeader from '@/components/PageHeader';
import Field from '@/components/Field';
import Empty from '@/components/Empty';
import PayrollSheet, { STATUS_LABEL } from '@/components/payroll/PayrollSheet';
import { money, competenceLabel, formatCpf, onlyDigits } from '@/lib/format';

export default function PastPayrolls() {
  const [comp, setComp] = useState('');
  const [q, setQ] = useState('');
  const [rows, setRows] = useState(null);
  const [open, setOpen] = useState(null);

  const search = async () => {
    const query = {};
    if (comp) query.competence = comp;
    if (q) query.$or = [{ employee_name: { $regex: escapeRegExp(q), $options: 'i' } }, { employee_cpf: { $regex: onlyDigits(q) || 'x' } }];
    const r = await base44.entities.Payroll.filter(query, { sort: '-competence', limit: 100 });
    setRows(r.items);
  };
  useEffect(() => { search(); }, []);

  return (
    <div>
      <PageHeader code="RF13 · RF17" title="Folhas anteriores" description="Consulte os valores registrados em cada competência, sem recalcular." />
      <div className="mb-6 grid gap-3 sm:grid-cols-[200px_1fr_auto] sm:items-end">
        <Field label="Competência"><Input type="month" value={comp} onChange={(e) => setComp(e.target.value)} /></Field>
        <Field label="Funcionário (nome ou CPF)"><Input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && search()} /></Field>
        <Button onClick={search}>Pesquisar</Button>
      </div>
      {rows && rows.length === 0 && <Empty>Nenhuma folha correspondente foi encontrada.</Empty>}
      {rows && rows.length > 0 && (
        <div className="overflow-x-auto border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2">Competência</th><th className="px-4 py-2">Funcionário</th><th className="px-4 py-2">CPF</th><th className="px-4 py-2 text-right">Salário-base</th><th className="px-4 py-2 text-right">Líquido</th><th className="px-4 py-2">Situação</th><th />
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} className="border-b border-border/60">
                  <td className="px-4 py-2">{competenceLabel(p.competence)}</td>
                  <td className="px-4 py-2 font-medium">{p.employee_name}</td>
                  <td className="px-4 py-2 font-mono text-xs">{formatCpf(p.employee_cpf)}</td>
                  <td className="px-4 py-2 text-right font-mono">{money(p.base_salary)}</td>
                  <td className="px-4 py-2 text-right font-mono font-semibold">{money(p.net_salary)}</td>
                  <td className="px-4 py-2 text-xs">{STATUS_LABEL[p.status]}</td>
                  <td className="px-4 py-2 text-right"><button className="text-xs text-emerald-700 underline" onClick={() => setOpen(p)}>Detalhes</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader><DialogTitle>Folha registrada</DialogTitle></DialogHeader>
          {open && <PayrollSheet payroll={open} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}