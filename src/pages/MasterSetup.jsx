import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import AuthShell from '@/components/auth/AuthShell';
import Field from '@/components/Field';
import { formatCpf, onlyDigits } from '@/lib/format';
import { isValidCpf } from '@/lib/cpf';

export default function MasterSetup() {
  const [f, setF] = useState({ full_name: '', cpf: '', password: '', confirm: '', token: '' });
  const [exists, setExists] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  useEffect(() => {
    base44.functions.invoke('authCpf', { action: 'masterExists' })
      .then((r) => setExists(r.data?.exists === true ? true : r.data?.exists === false ? false : null))
      .catch(() => { setError('Não foi possível verificar se o cadastro inicial está disponível. Atualize a página.'); setExists(null); });
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    const cpf = onlyDigits(f.cpf);
    if (!f.full_name.trim()) return setError('Informe seu nome.');
    if (!isValidCpf(cpf)) return setError('CPF inválido. Confira os dígitos verificadores.');
    if (f.password.length < 6 || f.password.length > 128) return setError('A senha deve ter ao menos 6 caracteres.');
    if (f.password !== f.confirm) return setError('As senhas não conferem.');
    if (!f.token.trim()) return setError('Informe a chave de criação do acesso mestre.');
    setBusy(true);
    try {
      const res = await base44.functions.invoke('provisionMaster', {
        token: f.token.trim(),
        full_name: f.full_name.trim(),
        cpf,
        password: f.password,
      });
      const master = res.data?.master;
      if (!master) {
        setError('Não foi possível criar a conta mestre.');
        setBusy(false);
        return;
      }
      // Cadastro concluído: a entrada é feita na tela de login, com CPF e senha.
      navigate('/login?created=1', { replace: true });
    } catch (err) {
      const code = err?.response?.data?.error;
      const mensagens = {
        token_invalido: 'Chave de criação incorreta.',
        nao_configurado: 'A chave de criação ainda não foi configurada no painel.',
        ja_existe: 'Já existe uma conta mestre. Entre por ela.',
      };
      setError(mensagens[code] || 'Não foi possível criar a conta mestre.');
      setBusy(false);
    }
  };

  if (exists) return <Navigate to="/login" replace />;

  return (
    <AuthShell
      title="Primeiro acesso — cadastrar gerente"
      subtitle="A primeira conta recebe permissões de administração inicial (conta mestre). Funcionários são cadastrados pelo gerente após o login."
    >
      {exists === null && <p className="mb-3 text-sm">Conferindo se a instalação já possui usuários…</p>}
      <form onSubmit={submit} className="space-y-4">
        <Field label="Nome do gerente"><Input value={f.full_name} onChange={set('full_name')} /></Field>
        <Field label="CPF do gerente"><Input className="font-mono" inputMode="numeric" value={formatCpf(f.cpf)} onChange={set('cpf')} placeholder="000.000.000-00" /></Field>
        <Field label="Senha"><Input type="password" value={f.password} onChange={set('password')} placeholder="Mínimo 6 caracteres" autoComplete="new-password" /></Field>
        <Field label="Confirmar senha"><Input type="password" value={f.confirm} onChange={set('confirm')} autoComplete="new-password" /></Field>
        <Field label="Chave de criação"><Input type="password" value={f.token} onChange={set('token')} placeholder="Chave secreta definida no painel" autoComplete="off" /></Field>
        {error && <p className="border border-destructive bg-red-50 px-3 py-2 text-sm text-destructive">{error}</p>}
        <Button type="submit" className="w-full" disabled={busy || exists !== false}>{busy ? 'Criando…' : 'Cadastrar gerente'}</Button>
        <p className="text-muted-foreground text-center text-xs">
          Depois do cadastro inicial, o botão Cadastrar-se desaparece. Acesse com CPF e senha.
        </p>
      </form>
    </AuthShell>
  );
}
