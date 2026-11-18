import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AuthShell from '@/components/auth/AuthShell';
import TermsAcceptance from '@/components/auth/TermsAcceptance';
import Field from '@/components/Field';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useServices } from '@/lib/ServicesContext';
import { formatCpf, onlyDigits } from '@/lib/format';
import { cpfMessage, isValidCpf } from '@/lib/cpf';

export default function PortalRegister() {
  const services = useServices();
  const navigate = useNavigate();
  const [form, setForm] = useState({ cpf: '', birth_date: '', password: '', confirm: '' });
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const sending = useRef(false);
  const set = (field) => (event) => setForm({ ...form, [field]: event.target.value });

  async function submit(event) {
    event.preventDefault();
    if (sending.current) return;
    const cpf = onlyDigits(form.cpf);
    if (!isValidCpf(cpf)) return setError(cpfMessage);
    if (!form.birth_date) return setError('Informe sua data de nascimento.');
    if (form.password.length < 6) return setError('Use pelo menos 6 caracteres na senha.');
    if (form.password !== form.confirm) return setError('As senhas não conferem.');
    if (!accepted) return setError('Aceite o termo para continuar.');
    sending.current = true;
    setBusy(true);
    setError('');
    try {
      const { data } = await services.invoke('authCpf', {
        action: 'activate', cpf, birth_date: form.birth_date, password: form.password, accepted,
      });
      if (!data?.ok) throw new Error('ativacao');
      navigate('/login?activated=1', { replace: true });
    } catch (err) {
      const code = err?.response?.data?.error ?? err?.data?.error;
      setError(code === 'ativacao_indisponivel'
        ? 'Confira os dados cadastrados pelo RH. Se já criou uma senha, use Entrar.'
        : 'Não foi possível concluir o cadastro agora. Tente novamente.');
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }

  return (
    <AuthShell title="Cadastrar-se" subtitle="Se o RH já cadastrou você, confirme o CPF e a data de nascimento para criar sua senha.">
      <form onSubmit={submit} className="space-y-4">
        <Field label="CPF"><Input inputMode="numeric" autoComplete="username" value={formatCpf(form.cpf)} onChange={set('cpf')} required /></Field>
        <Field label="Data de nascimento"><Input type="date" autoComplete="bday" value={form.birth_date} onChange={set('birth_date')} required /></Field>
        <Field label="Senha"><Input type="password" autoComplete="new-password" minLength={6} maxLength={128} value={form.password} onChange={set('password')} required /></Field>
        <Field label="Confirmar senha"><Input type="password" autoComplete="new-password" value={form.confirm} onChange={set('confirm')} required /></Field>
        <TermsAcceptance checked={accepted} onChange={setAccepted} />
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <Button className="w-full" disabled={busy}>{busy ? 'Cadastrando…' : 'Criar meu acesso'}</Button>
        <Button asChild variant="outline" className="w-full"><Link to="/login">Voltar para entrar</Link></Button>
      </form>
      <details className="mt-4 border-t border-border pt-3 text-sm">
        <summary className="cursor-pointer font-medium">Criar minha empresa</summary>
        <p className="my-2 text-muted-foreground">A conta mestre cadastra a empresa e cria o acesso do dono.</p>
        <Link to="/empresas" className="underline">Acessar cadastro de empresas</Link>
      </details>
    </AuthShell>
  );
}
