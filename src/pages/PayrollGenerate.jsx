import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import PageHeader from '@/components/PageHeader';
import Field from '@/components/Field';
import EmployeePicker from '@/components/EmployeePicker';
import PayrollSheet from '@/components/payroll/PayrollSheet';
import PayrollActions from '@/components/payroll/PayrollActions';
import { currentCompetence } from '@/lib/format';
import { buildPayroll, monthStats, paramsFromTable, validatePayrollInput } from '@/lib/payroll';
import { loadLegalTable } from '@/lib/legalTable';

export default function PayrollGenerate() {
  const [emp, setEmp] = useState(null);
  const [comp, setComp] = useState(currentCompetence());
  const [payroll, setPayroll] = useState(null);
  const [message, setMessage] = useState('');
  const [problems, setProblems] = useState([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const process = async () => {
    setLoading(true); setMessage(''); setProblems([]);
    const [pos, sched, recs, rubrics, existing, table] = await Promise.all([
      emp.position_id ? base44.entities.Position.get(emp.position_id) : null,
      emp.schedule_id ? base44.entities.WorkSchedule.get(emp.schedule_id) : null,
      base44.entities.TimeRecord.filter({ employee_id: emp.id, date: { $gte: `${comp}-01`, $lte: `${comp}-31` } }, { limit: 500 }),
      base44.entities.Rubric.filter({ auto_apply: true }, { limit: 100 }),
      base44.entities.Payroll.filter({ employee_id: emp.id, competence: comp }, { limit: 1 }),
      loadLegalTable(comp),
    ]);

    const blocked = validatePayrollInput({ employee: emp, schedule: sched, table });
    if (blocked.length) {
      setProblems(blocked);
      setPayroll(null);
      setLoading(false);
      return;
    }

    const old = existing.items[0];
    if (old?.status === 'finalizada') {
      setPayroll(old);
      setMessage('Esta folha já foi finalizada e não pode ser recalculada. Exibindo o resultado registrado.');
      return setLoading(false);
    }

    const stats = monthStats(recs.items, sched, comp, paramsFromTable(table));
    const data = buildPayroll({ employee: emp, positionName: pos?.name, competence: comp, stats, rubrics: rubrics.items, table });
    const saved = old ? { ...data, id: old.id, ...(await base44.entities.Payroll.update(old.id, data)) } : await base44.entities.Payroll.create(data);
    setPayroll({ ...data, id: saved.id });
    toast({ title: 'Folha calculada e salva para conferência', description: `Tabela legal aplicada: ${table.label}` });
    setLoading(false);
  };

  return (
    <div className="space-y-6">
      <PageHeader code="RF10 · RF12 · RF16" title="Folha de pagamento" description="Selecione a competência e o funcionário. INSS, IRRF e FGTS são calculados pela tabela legal vigente e a folha passa por conferência antes de ser finalizada." />
      <div className="grid gap-4 md:grid-cols-[1fr_200px_auto] md:items-end">
        <Field label="Funcionário"><EmployeePicker value={emp} onChange={(e) => { setEmp(e); setPayroll(null); setProblems([]); }} /></Field>
        <Field label="Competência"><Input type="month" value={comp} onChange={(e) => { setComp(e.target.value); setPayroll(null); setProblems([]); }} /></Field>
        <Button disabled={!emp || !comp || loading} onClick={process}>{loading ? 'Processando…' : 'Processar folha'}</Button>
      </div>
      {problems.length > 0 && (
        <ul className="border border-destructive bg-red-50 px-4 py-3 text-sm text-destructive">
          {problems.map((p) => <li key={p}>• {p}</li>)}
        </ul>
      )}
      {message && <p className="text-sm text-amber-700">{message}</p>}
      {payroll && (
        <div className="space-y-4">
          <PayrollActions key={payroll.id + payroll.status} payroll={payroll} onChange={setPayroll} />
          <PayrollSheet payroll={payroll} />
        </div>
      )}
    </div>
  );
}