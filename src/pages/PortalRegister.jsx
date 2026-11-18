import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { unscoped } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import AuthShell from '@/components/auth/AuthShell';
import Field from '@/components/Field';
import TermsAcceptance from '@/components/auth/TermsAcceptance';
import { hashPassword } from '@/lib/auth';
import { formatCpf, onlyDigits } from '@/lib/format';
import { cpfMessage, isValidCpf } from '@/lib/cpf';

export default function PortalRegister() {
  const [mode, setMode] = useState('existing');
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [companyId, setCompanyId] = useState('');
  const [cpf, setCpf] = useState('');
  const [found, setFound] = useState(null);
  const [creds, setCreds] = useState({ birth_date: '', username: '', password: '', confirm: '' });
  const [accepted, setAccepted] = useState(false);
  const [errors, setErrors] = useState([]);
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();
  const setC = (k) => (e) => setCreds({ ...creds, [k]: e.target.value });

  const loadCompanies = async () => {
    const r = await unscoped.entities.Company.filter({ status: 'ativa' }, { sort: 'name', limit: 200 });
    setCompanies(r.items);
    setLoading(false);
    if (r.items.length === 1) setCompanyId(r.items[0].id);
    if (r.items.length === 0) setMode('new');
    return r.items;
  };

  useEffect(() => { loadCompanies(); }, []);

  const companyName = (id) => companies.find((c) => c.id === id)?.name || '';

  const verify = async (e) => {
    e.preventDefault();
    setErrors([]);
    setFound(null);
    const digits = onlyDigits(cpf);
    const errs = [];
    if (!companyId) errs.push('Selecione a empresa em que você trabalha.');
    if (!isValidCpf(digits)) errs.push(cpfMessage);
    if (errs.length) return setErrors(errs);
    setChecking(true);
    const res = await unscoped.entities.Employee.filter({ cpf: digits, company_id: companyId }, { limit: 1 });
    setChecking(false);
    const emp = res.items[0];
    if (!emp) return setErrors(['CPF não encontrado na base desta empresa. O acesso é liberado apenas para quem já foi cadastrado pelo RH — peça a inclusão do seu CPF.']);
    if (emp.status === 'desligado') return setErrors(['O vínculo deste CPF está encerrado. Fale com o RH da empresa.']);
    if (emp.password_hash) return setErrors(['Este CPF já possui acesso criado. Use "Entrar"; se esqueceu a senha, use "Esqueci minha senha".']);
    setFound(emp);
  };

  const createAccount = async (e) => {
    e.preventDefault();
    const errs = [];
    const username = creds.username.trim();
    if (found.birth_date && !creds.birth_date) errs.push('Informe a data de nascimento para confirmar seus dados.');
    if (found.birth_date && creds.birth_date && creds.birth_date !== found.birth_date) errs.push('Data de nascimento não confere com o cadastro da empresa.');
    if (!username) errs.push('Informe um nome de usuário.');
    if (creds.password.length < 6) errs.push('A senha deve ter ao menos 6 caracteres.');
    if (creds.password !== creds.confirm) errs.push('As senhas não conferem.');
    if (!accepted) errs.push('É necessário aceitar o termo de uso para concluir o cadastro.');
    if (errs.length) return setErrors(errs);
    setBusy(true);
    const dup = await unscoped.entities.Employee.filter({ username, company_id: found.company_id }, { limit: 1 });
    if (dup.items.length) {
      setBusy(false);
      return setErrors(['Este nome de usuário já está em uso nesta empresa.']);
    }
    await unscoped.entities.Employee.update(found.id, {
      username,
      password_hash: await hashPassword(found.cpf, creds.password),
      status: found.status || 'ativo',
      terms_accepted: true,
      terms_accepted_at: new Date().toISOString(),
    });
    toast({ title: 'Acesso criado', description: 'Entre com seu CPF e a senha que você acabou de definir.' });
    navigate('/login', { replace: true });
  };

  const back = () => { setFound(null); setErrors([]); setCreds({ birth_date: '', username: '', password: '', confirm: '' }); };

  return (
    <AuthShell title="Criar acesso" subtitle="Só quem já está na base da empresa pode criar a conta.">
      {loading ? (
        <p className="text-sm text-muted-foreground">Carregando empresas…</p>
      ) : (
        <div className="space-y-5">
          {companies.length > 0 && (
            <div className="grid grid-cols-2 gap-px border border-border bg-border">
              {[['existing', 'Tenho cadastro'], ['new', 'Criar minha empresa']].map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => { setMode(key); setFound(null); setErrors([]); }}
                  className={`px-2 py-2 text-sm font-medium transition-colors ${mode === key ? 'bg-accent text-accent-foreground' : 'bg-card text-muted-foreground'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          {mode === 'new' && (
            <div className="space-y-3 border border-border bg-card px-3 py-3 text-sm">
              <p className="font-semibold">O sistema da empresa é criado pela conta mestre</p>
              <p className="text-muted-foreground text-xs">
                Entre com a conta mestre, abra as empresas e use "Criar um novo sistema" informando o nome do dono, o CPF e a senha. A partir daí você entra normalmente com esse CPF.
              </p>
              <Button asChild variant="outline" className="w-full"><Link to="/login">Entrar como mestre</Link></Button>
            </div>
          )}

          {mode === 'existing' && !found && (
            <form onSubmit={verify} className="space-y-4">
              <Field label="Empresa">
                <Select value={companyId || undefined} onValueChange={(v) => { setCompanyId(v); setFound(null); setErrors([]); }}>
                  <SelectTrigger><SelectValue placeholder="Selecione sua empresa" /></SelectTrigger>
                  <SelectContent>
                    {companies.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="CPF">
                <Input
                  className="font-mono"
                  inputMode="numeric"
                  value={formatCpf(cpf)}
                  onChange={(e) => { setCpf(e.target.value); setFound(null); setErrors([]); }}
                  placeholder="000.000.000-00"
                />
              </Field>
              <p className="text-muted-foreground text-xs">
                Consultamos o CPF na base da empresa. Se ele não estiver cadastrado pelo RH, o acesso não é liberado.
              </p>
              {errors.length > 0 && <ul className="border border-destructive bg-red-50 px-3 py-2 text-sm text-destructive">{errors.map((e) => <li key={e}>• {e}</li>)}</ul>}
              <Button type="submit" className="w-full" disabled={checking}>{checking ? 'Verificando CPF…' : 'Verificar CPF'}</Button>
            </form>
          )}

          {mode === 'existing' && found && (
            <form onSubmit={createAccount} className="space-y-4">
              <div className="border border-emerald-600 bg-accent px-3 py-2 text-sm text-accent-foreground">
                <p className="font-semibold">CPF localizado</p>
                <p>{found.full_name}</p>
                <p className="text-xs">{companyName(found.company_id)} · {formatCpf(found.cpf)}</p>
              </div>
              {found.birth_date && (
                <Field label="Data de nascimento"><Input type="date" value={creds.birth_date} onChange={setC('birth_date')} /></Field>
              )}
              <Field label="Nome de usuário"><Input value={creds.username} onChange={setC('username')} autoComplete="username" /></Field>
              <Field label="Senha"><Input type="password" value={creds.password} onChange={setC('password')} placeholder="Mínimo 6 caracteres" autoComplete="new-password" /></Field>
              <Field label="Confirmar senha"><Input type="password" value={creds.confirm} onChange={setC('confirm')} autoComplete="new-password" /></Field>
              <TermsAcceptance checked={accepted} onChange={setAccepted} />
              {errors.length > 0 && <ul className="border border-destructive bg-red-50 px-3 py-2 text-sm text-destructive">{errors.map((e) => <li key={e}>• {e}</li>)}</ul>}
              <Button type="submit" className="w-full" disabled={busy}>{busy ? 'Criando acesso…' : 'Criar minha conta'}</Button>
              <button type="button" onClick={back} className="w-full text-center text-xs text-muted-foreground underline">Usar outro CPF</button>
            </form>
          )}

          <p className="text-muted-foreground text-center text-sm">
            Já tem acesso? <Link to="/login" className="text-primary font-medium underline">Entrar</Link>
          </p>
        </div>
      )}
    </AuthShell>
  );
}