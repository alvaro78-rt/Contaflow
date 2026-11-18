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
import { calcThirteenth, thirteenthMonths, todayIso } from '@/lib/benefits';
import { money } from '@/lib/format';

export default function Thirteenth() {
  const { toast } = useToast();
  const [employee, setEmployee] = useState(null);
  const [positions, setPositions] = useState([]);
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [months, setMonths] = useState('12');
  const [table, setTable] = useState(null);
  const [records, setRecords] = useState([]);
  const [open, setOpen] = useState(null);
  const [error, setError] = useState('');

  const load = () => base44.entities.ThirteenthSalary.filter({}, { sort: '-year', limit: 50 }).then((r) => setRecords(r.items));

  useEffect(() => {
    load();
    base44.entities.Position.filter({}, { sort: 'name', limit: 200 }).then((r) => setPositions(r.items));
  }, []);

  useEffect(() => {
    const competence = `${year}-12`;
    loadLegalTable(competence).then(setTable);
  }, [year]);

  useEffect(() => {
    if (!employee) return;
    const avos = thirteenthMonths(employee.admission_date, `${year}-12-31`, Number(year));
    setMonths(String(avos));
  }, [employee, year]);

  const positionName = positions.find((p) => p.id === employee?.position_id)?.name || '';
  const preview = employee && table
    ? calcThirteenth({ employee, table, positionName, year, months })
    : null;

  const save = async () => {
    const problems = [];
    if (!employee) problems.push('Selecione o funcionário.');
    if (!(Number(months) > 0)) problems.push('Informe os avos de direito (meses com 15 dias ou mais).');
    if (!table) problems.push('Nenhuma tabela legal vigente para a competência de dezembro — ajuste em Parâmetros legais.');
    setError(problems.join(' '));
    if (problems.length) return;
    await base44.entities.ThirteenthSalary.create(preview);
    toast({ title: '13º calculado e registrado' });
    setEmployee(null);
    setOpen(null);
    load();
  };

  const pay = async (record) => {
    await base44.entities.ThirteenthSalary.update(record.id, { status: 'paga', paid_at: todayIso() });
    toast({ title: '13º marcado como pago' });
    load();
  };

  const remove = async (record) => {
    if (!window.confirm(`Excluir o 13º de ${record.employee_name} (${record.year})?`)) return;
    await base44.entities.ThirteenthSalary.delete(record.id);
    if (open?.id === record.id) setOpen(null);
    load();
  };

  return (
    <div>
      <PageHeader code="RF19" title="13º salário" description="Calcule as duas parcelas do 13º proporcional, com INSS e IRRF na 2ª parcela e histórico por ano." />
      <div className="mb-8 border border-border bg-card">
        <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Funcionário" className="sm:col-span-2"><EmployeePicker value={employee} onChange={(e) => { setEmployee(e); setOpen(null); setError(''); }} /></Field>
          <Field label="Ano de referência"><Input type="number" min="2000" max="2100" value={year} onChange={(e) => setYear(e.target.value)} /></Field>
          <Field label="Avos de direito (0 a 12)"><Input type="number" min="0" max="12" value={months} onChange={(e) => setMonths(e.target.value)} /></Field>
          <div className="flex items-end"><Button className="w-full" onClick={save} disabled={!employee}>Calcular e registrar</Button></div>
        </div>
        {error && <p className="border-t border-border bg-red-50 px-5 py-3 text-sm text-destructive">{error}</p>}
        {preview && (
          <Summary items={[
            ['13º bruto', money(preview.gross)],
            ['1ª parcela', money(preview.first_parcel)],
            ['2ª parcela (líquida)', money(preview.second_parcel)],
          ]} />
        )}
        {preview && (
          <p className="border-t border-border px-5 py-2 font-mono text-[11px] text-muted-foreground">
            Tabela aplicada: {preview.legal_table_label || '—'} · INSS {money(preview.inss)} · IRRF {money(preview.irrf)} · FGTS informativo {money(preview.calc_memory.fgts_value)}
          </p>
        )}
        {!table && <p className="border-t border-border bg-red-50 px-5 py-3 text-xs text-destructive">Nenhuma tabela legal vigente para dezembro de {year} — ajuste em Parâmetros legais.</p>}
      </div>

      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold">13º registrados</h2>
        <p className="font-mono text-xs text-muted-foreground">{records.length} registro(s)</p>
      </div>
      {open && <div className="mb-6"><Payslip payroll={open} title="Recibo de 13º salário" /></div>}
      <BenefitHistory
        records={records}
        empty="Nenhum 13º registrado."
        reference={(r) => `${r.year} · ${r.months_worked}/12 avos`}
        onOpen={setOpen}
        onStatus={pay}
        onDelete={remove}
      />
    </div>
  );
}