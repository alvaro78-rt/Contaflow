import { useEffect, useState } from 'react';
import { useSession } from '@/lib/SessionContext';
import { rh } from '@/api/rh';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import EmployeePicker from '@/components/EmployeePicker';
import PageHeader from '@/components/PageHeader';
import Field from '@/components/Field';
import Payslip from '@/components/payroll/Payslip';
import BenefitHistory from './BenefitHistory';

const titles = { ferias: 'Férias', decimo: '13º salário', rescisao: 'Rescisão' };
const modes = {
  sem_justa_causa: 'Dispensa sem justa causa',
  com_justa_causa: 'Justa causa',
  pedido: 'Pedido de demissão',
  acordo: 'Acordo',
  termino: 'Término de contrato',
};
const fields = {
  ferias: [
    ['acquired_start', 'Início do período aquisitivo', 'date'],
    ['acquired_end', 'Fim do período aquisitivo', 'date'],
    ['start_date', 'Início das férias', 'date'],
    ['end_date', 'Último dia de férias', 'date'],
    ['abono_days', 'Dias de abono', 'number'],
  ],
  decimo: [
    ['year', 'Ano', 'text'],
    ['months_worked', 'Avos com direito (1 a 12)', 'number'],
    ['remuneration', 'Remuneração de dezembro com médias (R$)', 'number'],
    ['advance', 'Primeira parcela efetivamente adiantada (R$)', 'number'],
    ['tax_dependents', 'Dependentes fiscais', 'number'],
  ],
  rescisao: [['termination_date', 'Data de desligamento', 'date']],
};
const totalFields = [['total_earnings', 'Total de proventos do recibo', 'number'], [
  'total_deductions',
  'Total de descontos do recibo',
  'number',
], ['net_salary', 'Líquido do recibo', 'number']];

function Lines({ label, rows, onChange }) {
  return (
    <fieldset className='space-y-2'>
      <legend>{label}</legend>
      {rows.map((row, index) => (
        <div className='flex gap-2' key={index}>
          <Input
            aria-label='Descrição da verba'
            placeholder='Descrição do documento'
            value={row.description}
            onChange={(e) =>
              onChange(rows.map((r, i) => i === index ? { ...r, description: e.target.value } : r))}
          />
          <Input
            aria-label='Valor em reais'
            type='number'
            step='.01'
            min='0'
            value={row.value}
            onChange={(e) => onChange(rows.map((r, i) => i === index ? { ...r, value: e.target.value } : r))}
          />
          <Button variant='outline' onClick={() => onChange(rows.filter((_, i) => i !== index))}>
            Retirar linha
          </Button>
        </div>
      ))}
      <Button variant='outline' onClick={() => onChange([...rows, { description: '', value: '' }])}>
        Adicionar verba
      </Button>
    </fieldset>
  );
}

export default function BenefitRegister({ module }) {
  const { session } = useSession();
  const [employee, setEmployee] = useState(null);
  const [form, setForm] = useState(/** @type {Record<string, any>} */ ({}));
  const [rows, setRows] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [open, setOpen] = useState(null);
  const [paying, setPaying] = useState(null);
  const [paidAt, setPaidAt] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (name, value) => setForm((prev) => ({ ...prev, [name]: value, confirmed: false }));
  const load = async (next = null) => {
    const page = await rh(session, 'benefits', { module, cursor: next });
    setRows((old) => next ? [...old, ...page.items] : page.items);
    setCursor(page.next_cursor);
  };
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [module, session]);
  const isAnnual = module === 'decimo';
  const inputs = [...fields[module], ['payment_date', 'Data de pagamento do documento', 'date'], [
    'reference',
    'Referência do documento conferido',
    'text',
  ]];
  const write = async (pay = false) => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      if (pay) {
        await rh(session, 'payBenefit', { module, id: paying.id, paid_at: paidAt });
        setPaying(null);
        setPaidAt('');
      } else {
        const record = { ...form };
        for (const [name, , type] of [...inputs, ...(isAnnual ? [] : totalFields)]) {
          if (form[name] == null || form[name] === '') {
            throw new Error('Preencha os campos do documento, inclusive valores iguais a zero.');
          }
          if (type === 'number') record[name] = Number(form[name]);
        }
        if (!isAnnual) {
          for (const name of ['earnings', 'deductions']) {
            record[name] = (form[name] || []).map((row) => ({
              description: row.description,
              value: row.value === '' ? null : Number(row.value),
            }));
          }
        }
        const result = await rh(session, 'recordBenefit', { module, employee_id: employee.id, record });
        setOpen(result.record);
        setEmployee(null);
        setForm({});
      }
      setMessage(pay ? 'Pagamento registrado.' : 'Registro salvo.');
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const input = ([name, label, type]) => (
    <Field key={name} label={label}>
      <Input
        type={type}
        step={type === 'number' ? 'any' : undefined}
        value={form[name] ?? ''}
        onChange={(e) => set(name, e.target.value)}
      />
    </Field>
  );
  return (
    <div className='space-y-5'>
      <PageHeader
        code={{ ferias: 'RF18', decimo: 'RF19', rescisao: 'RF20' }[module]}
        title={titles[module]}
        description={isAnnual
          ? 'Apuração anual de dezembro para empregado CLT com um vínculo. Informe a primeira parcela já paga e as médias conferidas.'
          : module === 'ferias'
          ? 'Registre os períodos e transcreva as verbas do recibo de férias conferido pela contabilidade.'
          : 'Registre as verbas do TRCT conferido pela contabilidade. O cadastro do vínculo é administrado na ficha do funcionário.'}
      />
      <EmployeePicker
        value={employee}
        onChange={(e) => {
          setEmployee(e);
          setForm({});
          setOpen(null);
        }}
      />
      {employee && (
        <div className='space-y-4 border p-4'>
          <div className='grid gap-3 sm:grid-cols-2'>{inputs.map(input)}</div>
          {module === 'rescisao' && (
            <div className='flex gap-4'>
              <Field label='Modalidade'>
                <select value={form.type || ''} onChange={(e) => set('type', e.target.value)}>
                  <option value=''>Selecione</option>
                  {Object.entries(modes).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </Field>
              <Field label='Aviso prévio'>
                <select value={form.notice || ''} onChange={(e) => set('notice', e.target.value)}>
                  <option value=''>Selecione</option>
                  {['trabalhado', 'indenizado', 'dispensado'].map((v) => <option key={v}>{v}</option>)}
                </select>
              </Field>
            </div>
          )}
          {!isAnnual && (
            <>
              <Lines
                label='Proventos do documento'
                rows={form.earnings || []}
                onChange={(v) => set('earnings', v)}
              />
              <Lines
                label='Descontos do documento'
                rows={form.deductions || []}
                onChange={(v) => set('deductions', v)}
              />
              <div className='grid gap-3 sm:grid-cols-3'>{totalFields.map(input)}</div>
            </>
          )}
          <label className='block'>
            <input
              type='checkbox'
              checked={!!form.confirmed}
              onChange={(e) => setForm({ ...form, confirmed: e.target.checked })}
            />{' '}
            {isAnnual
              ? 'Conferi os avos, as médias, o adiantamento e as deduções. O cálculo é de um vínculo, sem pensão ou outras deduções.'
              : 'Conferi as bases, as incidências, as verbas e os totais com o documento de origem.'}
          </label>
          <Button disabled={busy || !form.confirmed} onClick={() => write()}>Registrar</Button>
        </div>
      )}
      {error && <p role='alert' className='text-destructive'>{error}</p>}
      {message && <p role='status'>{message}</p>}
      <h2 className='font-semibold'>Histórico</h2>
      <BenefitHistory
        records={rows}
        empty='Nenhum registro encontrado.'
        showStatus={module !== 'rescisao'}
        onOpen={setOpen}
        reference={(r) => r.start_date || r.year || r.termination_date}
        onStatus={(r) => {
          setPaying(r);
          setPaidAt('');
        }}
      />
      {cursor && (
        <Button variant='outline' onClick={() => load(cursor).catch((e) => setError(e.message))}>
          Carregar mais
        </Button>
      )}
      {paying && (
        <div className='space-y-3 border p-4'>
          <Field label={'Data do pagamento de ' + paying.employee_name}>
            <Input type='date' value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
          </Field>
          <Button disabled={busy || !paidAt} onClick={() => write(true)}>Confirmar pagamento</Button>{' '}
          <Button variant='outline' onClick={() => setPaying(null)}>Cancelar</Button>
        </div>
      )}
      {open && <Payslip payroll={open} title={titles[module]} />}
    </div>
  );
}
