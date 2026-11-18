import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import PageHeader from '@/components/PageHeader';
import Field from '@/components/Field';
import EmployeePicker from '@/components/EmployeePicker';
import Payslip from '@/components/payroll/Payslip';
import BenefitHistory from '@/components/benefits/BenefitHistory';
import Summary from '@/components/benefits/Summary';
import { loadLegalTable } from '@/lib/legalTable';
import { calcVacation, currentAcquisitionStart, addDays, addMonths, todayIso } from '@/lib/benefits';
import { money, fmtDate } from '@/lib/format';

const EMPTY = { acquired_start: '', acquired_end: '', start_date: '', days: 30, abono_days: 0 };

export default function Vacations() {
  const { toast } = useToast();
  const [employee, setEmployee] = useState(null);
  const [positions, setPositions] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [table, setTable] = useState(null);
  const [records, setRecords] = useState([]);
  const [open, setOpen] = useState(null);
  const [error, setError] = useState('');

  const load = () => base44.entities.Vacation.filter({}, { sort: '-start_date', limit: 50 }).then((r) => setRecords(r.items));

  useEffect(() => {
    load();
    base44.entities.Position.filter({}, { sort: 'name', limit: 200 }).then((r) => setPositions(r.items));
  }, []);

  useEffect(() => {
    if (!form.start_date) return setTable(null);
    loadLegalTable(form.start_date.slice(0, 7)).then(setTable);
  }, [form.start_date]);

  const pickEmployee = (e) => {
    setEmployee(e);
    setOpen(null);
    setError('');
    if (!e) return;
    const start = currentAcquisitionStart(e.admission_date, todayIso());
    setForm((f) => ({ ...f, acquired_start: start || '', acquired_end: start ? addDays(addMonths(start, 12), -1) : '' }));
  };

  const positionName = positions.find((p) => p.id === employee?.position_id)?.name || '';
  const preview = employee && form.start_date && table
    ? calcVacation({
      employee,
      table,
      positionName,
      acquiredStart: form.acquired_start,
      acquiredEnd: form.acquired_end,
      startDate: form.start_date,
      days: form.days,
      abonoDays: form.abono_days,
    })
    : null;

  const save = async () => {
    const problems = [];
    if (!employee) problems.push('Selecione o funcionário.');
    if (!form.acquired_start || !form.acquired_end) problems.push('Informe o período aquisitivo.');
    if (form.acquired_start && form.acquired_end && form.acquired_start > form.acquired_end) problems.push('O fim do período aquisitivo deve ser depois do início.');
    if (!form.start_date) problems.push('Informe o início do gozo.');
    if (form.start_date && !table) problems.push('Nenhuma tabela legal vigente para esta competência — ajuste em Parâmetros legais.');
    setError(problems.join(' '));
    if (problems.length) return;
    await base44.entities.Vacation.create(preview);
    toast({ title: 'Férias registradas' });
    setForm(EMPTY);
    setEmployee(null);
    load();
  };

  const pay = async (record) => {
    await base44.entities.Vacation.update(record.id, { status: 'paga', paid_at: todayIso() });
    toast({ title: 'Férias marcadas como pagas' });
    load();
  };

  const remove = async (record) => {
    if (!window.confirm(`Excluir as férias de ${record.employee_name}?`)) return;
    await base44.entities.Vacation.delete(record.id);
    if (open?.id === record.id) setOpen(null);
    load();
  };

  return (
    <div>
      <PageHeader code="RF18" title="Férias" description="Programe e pague férias com 1/3 constitucional, abono pecuniário e identificação do período vencido." />
      <div className="mb-8 border border-border bg-card">
        <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Funcionário" className="sm:col-span-2"><EmployeePicker value={employee} onChange={pickEmployee} /></Field>
          <Field label="Início do período aquisitivo"><Input type="date" value={form.acquired_start} onChange={(e) => setForm({ ...form, acquired_start: e.target.value })} /></Field>
          <Field label="Fim do período aquisitivo"><Input type="date" value={form.acquired_end} onChange={(e) => setForm({ ...form, acquired_end: e.target.value })} /></Field>
          <Field label="Início do gozo"><Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} /></Field>
          <Field label="Dias de gozo"><Input type="number" min="0" max="30" value={form.days} onChange={(e) => setForm({ ...form, days: e.target.value })} /></Field>
          <Field label="Dias vendidos (abono)"><Input type="number" min="0" max="10" value={form.abono_days} onChange={(e) => setForm({ ...form, abono_days: e.target.value })} /></Field>
          <div className="flex items-end"><Button className="w-full" onClick={save} disabled={!employee || !form.start_date}>Registrar férias</Button></div>
        </div>
        {error && <p className="border-t border-border bg-red-50 px-5 py-3 text-sm text-destructive">{error}</p>}
        {preview && <Summary items={[['Proventos', money(preview.total_earnings)], ['Descontos', money(preview.total_deductions)], ['Líquido', money(preview.net_salary)]]} />}
        {preview?.expired && (
          <p className="border-t border-border bg-red-50 px-5 py-3 text-xs text-destructive">
            Período aquisitivo vencido em {fmtDate(preview.concessive_end)}: a dobra constitucional (art. 137) já está incluída no cálculo.
          </p>
        )}
        {preview && (
          <p className="border-t border-border px-5 py-2 font-mono text-[11px] text-muted-foreground">
            Tabela aplicada: {preview.legal_table_label || '—'} · INSS {money(preview.deductions[0]?.value)} · FGTS informativo {money(preview.calc_memory.fgts_value)}
          </p>
        )}
        {form.start_date && !table && (
          <p className="border-t border-border bg-red-50 px-5 py-3 text-xs text-destructive">Nenhuma tabela legal vigente para esta competência — ajuste em Parâmetros legais.</p>
        )}
      </div>

      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold">Férias registradas</h2>
        <p className="font-mono text-xs text-muted-foreground">{records.length} registro(s)</p>
      </div>
      {open && <div className="mb-6"><Payslip payroll={open} title="Recibo de férias" /></div>}
      <BenefitHistory
        records={records}
        empty="Nenhuma férias registrada."
        reference={(r) => `${fmtDate(r.start_date)} a ${fmtDate(r.end_date)} · ${r.days} dia(s)`}
        onOpen={setOpen}
        onStatus={pay}
        onDelete={remove}
      />
    </div>
  );
}