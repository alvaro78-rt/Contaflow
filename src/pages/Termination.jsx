import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/components/ui/use-toast';
import PageHeader from '@/components/PageHeader';
import Field from '@/components/Field';
import EmployeePicker from '@/components/EmployeePicker';
import Payslip from '@/components/payroll/Payslip';
import BenefitHistory from '@/components/benefits/BenefitHistory';
import Summary from '@/components/benefits/Summary';
import Choice from '@/components/benefits/Choice';
import { loadLegalTable } from '@/lib/legalTable';
import { calcTermination, TERMINATION_TYPE_LABEL, todayIso } from '@/lib/benefits';
import { money, fmtDate, round2 } from '@/lib/format';

const TYPES = Object.entries(TERMINATION_TYPE_LABEL);
const NOTICES = [['indenizado', 'Indenizado'], ['trabalhado', 'Trabalhado'], ['dispensado', 'Dispensado']];

export default function Termination() {
  const { toast } = useToast();
  const [employee, setEmployee] = useState(null);
  const [positions, setPositions] = useState([]);
  const [date, setDate] = useState(todayIso());
  const [type, setType] = useState('sem_justa_causa');
  const [notice, setNotice] = useState('indenizado');
  const [vencidas, setVencidas] = useState('0');
  const [fgts, setFgts] = useState('0');
  const [extra, setExtra] = useState('0');
  const [markOff, setMarkOff] = useState(true);
  const [table, setTable] = useState(null);
  const [records, setRecords] = useState([]);
  const [open, setOpen] = useState(null);
  const [error, setError] = useState('');

  const load = () => base44.entities.Termination.filter({}, { sort: '-termination_date', limit: 50 }).then((r) => setRecords(r.items));

  useEffect(() => {
    load();
    base44.entities.Position.filter({}, { sort: 'name', limit: 200 }).then((r) => setPositions(r.items));
  }, []);

  useEffect(() => {
    if (!date) return setTable(null);
    loadLegalTable(date.slice(0, 7)).then(setTable);
  }, [date]);

  useEffect(() => {
    if (!employee) return;
    base44.entities.Payroll.filter({ employee_id: employee.id }, { limit: 200 }).then((r) => {
      const deposited = r.items.reduce((sum, p) => sum + ((p.informatives || []).find((i) => i.description.startsWith('FGTS'))?.value || 0), 0);
      setFgts(String(round2(deposited)));
    });
  }, [employee]);

  const positionName = positions.find((p) => p.id === employee?.position_id)?.name || '';
  const preview = employee && table && date
    ? calcTermination({ employee, table, positionName, type, date, notice, vencidasDays: vencidas, fgtsBalance: fgts, extraDiscounts: extra })
    : null;

  const save = async () => {
    const problems = [];
    if (!employee) problems.push('Selecione o funcionário.');
    if (!date) problems.push('Informe a data do desligamento.');
    if (employee?.admission_date && date < employee.admission_date) problems.push('A data do desligamento não pode ser anterior à admissão.');
    if (date && !table) problems.push('Nenhuma tabela legal vigente para esta competência — ajuste em Parâmetros legais.');
    setError(problems.join(' '));
    if (problems.length) return;
    await base44.entities.Termination.create(preview);
    if (markOff) {
      await base44.entities.Employee.update(employee.id, {
        status: 'desligado',
        status_date: date,
        status_reason: TERMINATION_TYPE_LABEL[type],
      });
    }
    toast({ title: 'Rescisão registrada' });
    setEmployee(null);
    setVencidas('0');
    setExtra('0');
    setOpen(null);
    load();
  };

  const remove = async (record) => {
    if (!window.confirm(`Excluir a rescisão de ${record.employee_name}?`)) return;
    await base44.entities.Termination.delete(record.id);
    if (open?.id === record.id) setOpen(null);
    load();
  };

  return (
    <div>
      <PageHeader code="RF20" title="Rescisão contratual" description="Calcule as verbas rescisórias com memória de cálculo e revise antes de concluir." />
      <div className="mb-8 border border-border bg-card">
        <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Funcionário" className="sm:col-span-2"><EmployeePicker value={employee} onChange={(e) => { setEmployee(e); setOpen(null); setError(''); }} /></Field>
          <Field label="Data do desligamento"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="Modalidade"><Choice value={type} onChange={setType} options={TYPES} /></Field>
          <Field label="Aviso prévio"><Choice value={notice} onChange={setNotice} options={NOTICES} /></Field>
          <Field label="Dias de férias vencidas"><Input type="number" min="0" max="30" value={vencidas} onChange={(e) => setVencidas(e.target.value)} /></Field>
          <Field label="Saldo de FGTS (base da multa)"><Input type="number" step="0.01" className="font-mono" value={fgts} onChange={(e) => setFgts(e.target.value)} /></Field>
          <Field label="Outros descontos (R$)"><Input type="number" step="0.01" className="font-mono" value={extra} onChange={(e) => setExtra(e.target.value)} /></Field>
        </div>
        <label className="flex items-center gap-2 border-t border-border px-5 py-3 text-sm">
          <Checkbox checked={markOff} onCheckedChange={setMarkOff} />
          Atualizar a situação do funcionário para desligado
        </label>
        {error && <p className="border-t border-border bg-red-50 px-5 py-3 text-sm text-destructive">{error}</p>}
        {preview && (
          <Summary items={[
            ['Total de verbas', money(preview.total_earnings)],
            ['Descontos', money(preview.total_deductions)],
            ['Líquido a pagar', money(preview.net_salary)],
          ]} />
        )}
        {preview && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3">
            <p className="font-mono text-[11px] text-muted-foreground">
              Aviso {preview.notice_days} dia(s) · {preview.months_vacation}/12 férias · {preview.months_13}/12 de 13º · Multa FGTS {money(preview.fgts_fine)} · Tabela {preview.legal_table_label || '—'}
            </p>
            <Button size="sm" onClick={save} disabled={!employee || !date}>Registrar rescisão</Button>
          </div>
        )}
        {date && !table && <p className="border-t border-border bg-red-50 px-5 py-3 text-xs text-destructive">Nenhuma tabela legal vigente para esta competência — ajuste em Parâmetros legais.</p>}
      </div>

      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold">Rescisões registradas</h2>
        <p className="font-mono text-xs text-muted-foreground">{records.length} registro(s)</p>
      </div>
      {open && <div className="mb-6"><Payslip payroll={open} title="Termo de rescisão" /></div>}
      <BenefitHistory
        records={records}
        empty="Nenhuma rescisão registrada."
        showStatus={false}
        reference={(r) => `${fmtDate(r.termination_date)} · ${TERMINATION_TYPE_LABEL[r.type] || r.type}`}
        onOpen={setOpen}
        onDelete={remove}
      />
    </div>
  );
}