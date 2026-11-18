import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import AuthShell from '@/components/auth/AuthShell';
import Field from '@/components/Field';
import { useSession } from '@/lib/SessionContext';
import { useServices } from '@/lib/ServicesContext';
import { formatCpf, onlyDigits } from '@/lib/format';

const LOGIN_ERRORS = {
  credenciais: 'CPF ou senha inválidos.',
  credenciais_incompletas: 'Informe o CPF e a senha.',
  cpf_invalido: 'CPF inválido. Confira os 11 dígitos.',
  sem_acesso: 'Este CPF está cadastrado, mas ainda precisa de uma senha de acesso. Fale com o responsável pela empresa.',
  cpf_duplicado: 'Há mais de uma conta com este CPF. Peça ao responsável pela empresa para conferir o cadastro.',
  conta_desligada: 'Este acesso está desligado. Fale com o responsável pela empresa.',
};

// afterLogin permite reaproveitar esta tela na demonstração, sem sair da rota.
export default function PortalLogin({ afterLogin }) {
  const services = useServices();
  const [form, setForm] = useState({ cpf: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [noMaster, setNoMaster] = useState(false);
  const [sessaoExpirada, setSessaoExpirada] = useState(false);
  const [criado, setCriado] = useState(false);
  const { login } = useSession();
  const navigate = useNavigate();

  useEffect(() => {
    services.invoke('authCpf', { action: 'masterExists' })
      .then((r) => setNoMaster(!r.data?.exists))
      .catch(() => setNoMaster(false));
    const params = new URLSearchParams(window.location.search);
    if (params.get('expired') === '1') setSessaoExpirada(true);
    if (params.get('created') === '1') setCriado(true);
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    const cpf = onlyDigits(form.cpf);
    if (cpf.length !== 11) return setError('Informe os 11 dígitos do CPF.');
    setBusy(true);
    try {
      const res = await services.invoke('authCpf', { action: 'login', cpf, password: form.password });
      const emp = res.data?.employee;
      const token = res.data?.token;
      const expires_at = res.data?.expires_at;
      if (!emp?.id || typeof token !== 'string' || !token.trim() || (emp.access_role !== 'master' && !emp.company_id)) {
        setError('O servidor não confirmou a sessão. Entre novamente.');
        setBusy(false);
        return;
      }
      if (emp.access_role === 'master') {
        login({ id: emp.id, name: emp.full_name, role: 'master', master: true, token, expires_at });
        if (afterLogin) { afterLogin(emp); return; }
        navigate('/empresas', { replace: true });
        return;
      }
      login({
        id: emp.id,
        name: emp.full_name,
        role: emp.access_role || 'funcionario',
        username: emp.username,
        company_id: emp.company_id,
        company_name: emp.company_name,
        token, expires_at,
      });
      if (afterLogin) { afterLogin(emp); return; }
      navigate('/', { replace: true });
    } catch (err) {
      const code = err?.data?.error ?? err?.response?.data?.error;
      setError(Object.hasOwn(LOGIN_ERRORS, code) ? LOGIN_ERRORS[code] : 'Não foi possível verificar o acesso no servidor. Tente entrar novamente.');
      setBusy(false);
    }
  };

  return (
    <AuthShell title="Entrar" subtitle="Use o CPF e a senha do seu cadastro.">
      {new URLSearchParams(window.location.search).get('activated') === '1' && (
        <p className="mb-4 text-sm text-emerald-700">Acesso criado. Entre com seu CPF e a senha que você definiu.</p>
      )}
      <form onSubmit={submit} className="space-y-4">
        <Field label="CPF">
          <Input className="font-mono" inputMode="numeric" value={formatCpf(form.cpf)} onChange={(e) => setForm({ ...form, cpf: e.target.value })} placeholder="000.000.000-00" autoComplete="username" />
        </Field>
        <Field label="Senha">
          <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="••••••" autoComplete="current-password" />
        </Field>
        {sessaoExpirada && (
          <p className="border border-amber-600 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Sua sessão foi encerrada. Para cadastrar um funcionário, entre com a conta que administra a empresa.
          </p>
        )}
        {criado && (
          <p className="border border-emerald-600 bg-accent px-3 py-2 text-sm text-accent-foreground">
            Gerente cadastrado com sucesso. Entre com seu CPF e senha.
          </p>
        )}
        {error && <p className="border border-destructive bg-red-50 px-3 py-2 text-sm text-destructive">{error}</p>}
        <Button type="submit" className="w-full" disabled={busy}>{busy ? 'Verificando…' : 'Entrar'}</Button>
        <Button asChild variant="outline" className="w-full"><Link to="/cadastro">Cadastrar-se</Link></Button>
        {noMaster && (
          <div className="space-y-2 border-emerald-600 bg-accent text-accent-foreground border px-3 py-2 text-xs">
            <p className="font-semibold">Primeiro acesso da instalação</p>
            <p>Nenhuma conta existe ainda. O gerente se cadastra com a chave de criação.</p>
            <Button asChild variant="outline" size="sm" className="w-full">
              <Link to="/mestre">Criar conta mestre</Link>
            </Button>
          </div>
        )}
      </form>
    </AuthShell>
  );
}