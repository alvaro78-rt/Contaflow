import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Image } from '@/components/ui/image';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import PageHeader from '@/components/PageHeader';
import Field from '@/components/Field';
import FormSection from '@/components/employees/FormSection';
import DependentsEditor from '@/components/employees/DependentsEditor';
import { employeeCatalog, employeeError, getEmployee, saveEmployee, SESSION_ERRORS } from '@/api/employeeAdmin';
import { useSession } from '@/lib/SessionContext';
import { formatCpf, formatPis, onlyDigits } from '@/lib/format';
import { cpfMessage, isValidCpf } from '@/lib/cpf';

const EMPTY = { full_name: '', cpf: '', rg: '', pis: '', photo_url: '', marital_status: '', birth_date: '', zip_code: '', address: '', address_number: '', address_complement: '', neighborhood: '', state: '', dependents: [], admission_date: '', position_id: '', contract_type: 'CLT', work_regime: 'Integral', schedule_id: '', base_salary: '', weekly_hours: '', bank_name: '', bank_agency: '', bank_account: '', pix: '', username: '', access_role: 'funcionario', department: '', status: 'ativo', status_reason: '', status_date: '' };

function Pick({ value, onChange, options, placeholder = undefined }) {
  return (
    <Select value={value || undefined} onValueChange={onChange}>
      <SelectTrigger><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>{options.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
    </Select>
  );
}

export default function EmployeeForm() {
  const { id } = useParams();
  const { session, logout } = useSession();
  const token = session?.token;
  const navigate = useNavigate();
  const { toast } = useToast();
  const [f, setF] = useState(EMPTY);
  const [password, setPassword] = useState('');
  const [positions, setPositions] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [errors, setErrors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setReady(false);
    setErrors([]);
    setPassword('');
    Promise.all([employeeCatalog(token), id ? getEmployee(token, id) : null])
      .then(([catalog, record]) => {
        if (!active) return;
        setPositions(catalog.positions);
        setSchedules(catalog.schedules);
        setF({ ...EMPTY, ...record?.employee });
        setReady(true);
      })
      .catch((error) => {
        if (!active) return;
        if (SESSION_ERRORS.includes(error.code)) {
          logout('expired');
          navigate('/login?expired=1', { replace: true });
          return;
        }
        setErrors([employeeError(error, 'Não foi possível carregar o cadastro. Atualize a página para tentar novamente.')]);
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id, token, logout, navigate]);

  const set = (k) => (e) => setF({ ...f, [k]: e.target ? e.target.value : e });
  const pickSchedule = (sid) => {
    const s = schedules.find((x) => x.id === sid);
    setF({ ...f, schedule_id: sid, weekly_hours: s ? s.weekly_hours : f.weekly_hours });
  };
  const upload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setF((current) => ({ ...current, photo_url: file_url }));
    } catch {
      setErrors(['Não foi possível enviar a foto.']);
    }
  };

  const save = async () => {
    const errs = [];
    const today = new Date().toISOString().slice(0, 10);
    if (!f.full_name.trim()) errs.push('Informe o nome completo.');
    if (!isValidCpf(f.cpf)) errs.push(cpfMessage);
    if (f.birth_date && f.birth_date > today) errs.push('A data de nascimento não pode estar no futuro.');
    if (f.admission_date && f.admission_date > today) errs.push('A data de admissão não pode estar no futuro.');
    if (f.pis && onlyDigits(f.pis).length !== 11) errs.push('O PIS deve ter 11 dígitos.');
    if (!f.admission_date) errs.push('Informe a data de admissão.');
    if (!f.position_id) errs.push('Selecione o cargo.');
    if (!f.schedule_id) errs.push('Selecione a jornada.');
    if (!(Number(f.base_salary) > 0)) errs.push('Informe o salário-base.');
    if (password && (password.length < 6 || password.length > 128)) errs.push('A senha deve ter entre 6 e 128 caracteres.');
    setErrors(errs);
    if (errs.length) return;
    setBusy(true);
    try {
      const employee = { ...f, cpf: onlyDigits(f.cpf), pis: onlyDigits(f.pis), base_salary: Number(f.base_salary), weekly_hours: f.weekly_hours === '' ? undefined : Number(f.weekly_hours) };
      await saveEmployee(token, { action: 'save', expected_company_id: session.company_id, id, employee, password });
      toast({ title: id ? 'Cadastro atualizado' : 'Cadastro do funcionário realizado' });
      navigate('/funcionarios');
    } catch (error) {
      if (SESSION_ERRORS.includes(error.code)) {
        logout('expired');
        navigate('/login?expired=1', { replace: true });
        return;
      }
      setErrors([employeeError(error, 'Não foi possível salvar o cadastro do funcionário.')]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-4xl space-y-5">
      <PageHeader code="RF03" title={id ? 'Editar funcionário' : 'Cadastro de funcionários'} description="Dados pessoais, endereço, dependentes, contrato, acesso ao sistema e informações bancárias." />
      {!id && <Button variant="outline" asChild><Link to="/funcionarios/novo/rapido">Cadastro rápido com CPF e senha</Link></Button>}
      {loading && <p className="text-sm text-muted-foreground">Carregando cadastro…</p>}
      {!loading && !ready && <p role="alert" className="text-sm text-destructive">{errors[0]}</p>}
      {ready && <>
      <FormSection code="01" title="Dados pessoais">
        <div className="flex items-center gap-5 sm:col-span-2">
          <div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden border border-border bg-secondary">
            {f.photo_url ? <Image src={f.photo_url} alt={f.full_name} className="h-20 w-20" fittingType="fill" /> : <span className="font-mono text-lg text-muted-foreground">{(f.full_name || '?').slice(0, 2).toUpperCase()}</span>}
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Foto do funcionário</p>
            <Input type="file" accept="image/*" onChange={upload} className="max-w-xs text-sm" />
            {f.photo_url && <button className="text-xs text-destructive underline" onClick={() => setF({ ...f, photo_url: '' })}>Remover foto</button>}
          </div>
        </div>
        <Field label="Nome completo" className="sm:col-span-2"><Input value={f.full_name} onChange={set('full_name')} /></Field>
        <Field label="CPF"><Input className="font-mono" value={formatCpf(f.cpf)} onChange={set('cpf')} placeholder="000.000.000-00" /></Field>
        <Field label="RG"><Input value={f.rg} onChange={set('rg')} /></Field>
        <Field label="PIS (11 dígitos)"><Input className="font-mono" inputMode="numeric" value={formatPis(f.pis)} onChange={set('pis')} placeholder="000.00000.00-0" /></Field>
        <Field label="Data de nascimento"><Input type="date" value={f.birth_date} onChange={set('birth_date')} /></Field>
        <Field label="Estado civil"><Pick value={f.marital_status} onChange={set('marital_status')} placeholder="Selecione" options={['Solteiro(a)', 'Casado(a)', 'União estável', 'Divorciado(a)', 'Viúvo(a)'].map((x) => [x, x])} /></Field>
      </FormSection>
      <FormSection code="02" title="Endereço">
        <Field label="CEP"><Input className="font-mono" inputMode="numeric" value={f.zip_code} onChange={set('zip_code')} placeholder="00000-000" /></Field>
        <Field label="Estado (UF)"><Input maxLength={2} className="font-mono uppercase" value={f.state} onChange={(e) => setF({ ...f, state: e.target.value.toUpperCase() })} placeholder="PE" /></Field>
        <Field label="Logradouro" className="sm:col-span-2"><Input value={f.address} onChange={set('address')} /></Field>
        <Field label="Número da casa"><Input className="font-mono" value={f.address_number} onChange={set('address_number')} /></Field>
        <Field label="Complemento"><Input value={f.address_complement} onChange={set('address_complement')} placeholder="Apto, bloco, casa…" /></Field>
        <Field label="Bairro" className="sm:col-span-2"><Input value={f.neighborhood} onChange={set('neighborhood')} /></Field>
      </FormSection>
      <section className="border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-5 py-3"><h2 className="font-semibold">Dependentes</h2><span className="font-mono text-xs text-muted-foreground">03</span></div>
        <div className="p-5"><DependentsEditor value={f.dependents} onChange={(d) => setF({ ...f, dependents: d })} /></div>
      </section>
      <FormSection code="04" title="Dados contratuais">
        <Field label="Data de admissão"><Input type="date" value={f.admission_date} onChange={set('admission_date')} /></Field>
        <Field label="Cargo"><Pick value={f.position_id} onChange={set('position_id')} placeholder="Selecione o cargo" options={positions.map((p) => [p.id, `${p.code} · ${p.name}`])} /></Field>
        <Field label="Tipo de contrato"><Pick value={f.contract_type} onChange={set('contract_type')} options={['CLT', 'Temporário', 'Estágio', 'Aprendiz'].map((x) => [x, x])} /></Field>
        <Field label="Regime de jornada"><Pick value={f.work_regime} onChange={set('work_regime')} options={['Integral', 'Parcial'].map((x) => [x, x])} /></Field>
        <Field label="Departamento"><Input value={f.department} onChange={set('department')} placeholder="Ex.: Administrativo" /></Field>
        <Field label="Situação"><Pick value={f.status} onChange={set('status')} options={[['ativo', 'Ativo'], ['afastado', 'Afastado'], ['desligado', 'Desligado']]} /></Field>
        {f.status !== 'ativo' && (
          <>
            <Field label="Motivo do afastamento/desligamento"><Input value={f.status_reason} onChange={set('status_reason')} placeholder="Ex.: licença médica, pedido de demissão" /></Field>
            <Field label="Data da mudança de situação"><Input type="date" value={f.status_date} onChange={set('status_date')} /></Field>
          </>
        )}
        <Field label="Jornada"><Pick value={f.schedule_id} onChange={pickSchedule} placeholder="Selecione a jornada" options={schedules.map((s) => [s.id, s.name])} /></Field>
        <Field label="Carga horária semanal (h)"><Input type="number" value={f.weekly_hours} onChange={set('weekly_hours')} /></Field>
        <Field label="Salário-base (R$)"><Input type="number" step="0.01" className="font-mono" value={f.base_salary} onChange={set('base_salary')} /></Field>
      </FormSection>
      <FormSection code="05" title="Acesso ao sistema">
        <Field label="Nome de usuário (opcional)"><Input value={f.username} onChange={set('username')} autoComplete="off" /></Field>
        <Field label={id ? 'Senha (deixe em branco para manter)' : 'Senha inicial (opcional)'}>
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••" maxLength={128} autoComplete="new-password" />
        </Field>
        <Field label="Perfil de acesso" className="sm:col-span-2">
          {session?.role === 'gerente' || (id && f.id === session?.id) ? (
            <p className="text-sm">{f.access_role === 'gerente' ? 'Gerente' : f.access_role === 'admin' ? 'Administrador' : 'Colaborador'}</p>
          ) : (
            <Pick value={f.access_role} onChange={set('access_role')} options={[['admin', 'Administrador'], ['gerente', 'Gerente'], ['funcionario', 'Colaborador']]} />
          )}
        </Field>
        <p className="text-xs text-muted-foreground sm:col-span-2">
          O login é feito com o CPF. Se a senha inicial ficar em branco, o cadastro fica salvo sem acesso até a senha ser definida.
        </p>
        <p className="border border-border bg-secondary/50 px-3 py-2 text-xs text-muted-foreground sm:col-span-2">
          Para passar o sistema a outro dono, use <strong>Minha conta → Trocar o dono do sistema</strong>: você escolhe o funcionário, define a senha dele e o seu acesso passa a ser de funcionário.
        </p>
      </FormSection>
      <FormSection code="06" title="Dados bancários">
        <Field label="Banco"><Input value={f.bank_name} onChange={set('bank_name')} /></Field>
        <Field label="Agência"><Input className="font-mono" value={f.bank_agency} onChange={set('bank_agency')} /></Field>
        <Field label="Conta"><Input className="font-mono" value={f.bank_account} onChange={set('bank_account')} /></Field>
        <Field label="Chave Pix"><Input value={f.pix} onChange={set('pix')} /></Field>
      </FormSection>
      {errors.length > 0 && <ul className="border border-destructive bg-red-50 px-4 py-3 text-sm text-destructive">{errors.map((e) => <li key={e}>• {e}</li>)}</ul>}
      <div className="flex gap-3">
        <Button onClick={save} disabled={busy}>{busy ? 'Salvando…' : 'Salvar'}</Button>
        <Button variant="ghost" onClick={() => navigate('/funcionarios')}>Cancelar</Button>
      </div>
      </>}
    </div>
  );
}