import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import AuthShell from '@/components/auth/AuthShell';
import Field from '@/components/Field';
import { useSession } from '@/lib/SessionContext';
import { useServices } from '@/lib/ServicesContext';
import { formatCpf, onlyDigits } from '@/lib/format';

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
      if (!emp) {
        setError('CPF ou senha inválidos.');
        setBusy(false);
        return;
      }
      if (emp.access_role === 'master') {
        login({ id: emp.id, name: emp.full_name, role: 'master', master: true, token: res.data?.token });
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
        token: res.data?.token,
      });
      if (afterLogin) { afterLogin(emp); return; }
      navigate('/', { replace: true });
    } catch (err) {
      const code = err?.response?.data?.error;
      setError(code === 'sem_acesso'
        ? 'Este CPF está na base, mas ainda não tem acesso criado. Fale com o administrador da empresa.'
        : code === 'conta_desligada'
          ? 'Este acesso está desligado. Fale com o administrador da empresa.'
          : 'CPF ou senha inválidos.');
      setBusy(false);
    }
  };

  return (
    <AuthShell title="Entrar" subtitle="Use o CPF e a senha do seu cadastro.">
      <form onSubmit={submit} className="space-y-4">
        <Field label="CPF">
          <Input className="font-mono" inputMode="numeric" value={formatCpf(form.cpf)} onChange={(e) => setForm({ ...form, cpf: e.target.value })} placeholder="000.000.000-00" autoComplete="username" />
        </Field>
        <Field label="Senha">
          <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="••••••" autoComplete="current-password" />
        </Field>
        {sessaoExpirada && (
          <p className="border border-amber-600 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Sua sessão expirou ou foi encerrada. Entre novamente com CPF e senha para continuar.
          </p>
        )}
        {criado && (
          <p className="border border-emerald-600 bg-accent px-3 py-2 text-sm text-accent-foreground">
            Gerente cadastrado com sucesso. Entre com seu CPF e senha.
          </p>
        )}
        {error && <p className="border border-destructive bg-red-50 px-3 py-2 text-sm text-destructive">{error}</p>}
        <Button type="submit" className="w-full" disabled={busy}>{busy ? 'Verificando…' : 'Entrar'}</Button>
        {noMaster && (
          <div className="space-y-2 border-emerald-600 bg-accent text-accent-foreground border px-3 py-2 text-xs">
            <p className="font-semibold">Primeiro acesso da instalação</p>
            <p>Nenhuma conta existe ainda. O gerente se cadastra com a chave de criação.</p>
            <Button asChild variant="outline" size="sm" className="w-full">
              <Link to="/mestre">Cadastrar-se</Link>
            </Button>
          </div>
        )}
      </form>
    </AuthShell>
  );
}