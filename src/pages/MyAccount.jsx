import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import PageHeader from '@/components/PageHeader';
import Field from '@/components/Field';
import { useNavigate } from 'react-router-dom';
import { useSession } from '@/lib/SessionContext';

export default function MyAccount() {
  const { session, logout } = useSession();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [form, setForm] = useState({ current: '', password: '', confirm: '' });
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const save = async () => {
    setError('');
    if (form.password.length < 6) return setError('A nova senha deve ter ao menos 6 caracteres.');
    if (form.password !== form.confirm) return setError('A confirmação não confere com a nova senha.');
    try {
      const {data} = await base44.functions.invoke('authCpf', {
        action: 'changePassword', token: session.token, current: form.current, password: form.password,
      });
      if (!data?.ok) throw new Error();
      logout();
      toast({ title: 'Senha alterada', description: 'Entre novamente com a nova senha.' });
      navigate('/login', {replace: true});
    } catch (e) {
      const code = e.data?.error || e.response?.data?.error;
      setError(code === 'senha_atual_incorreta' ? 'Senha atual incorreta.' : 'Não foi possível alterar a senha.');
    }
  };

  return (
    <div className="max-w-xl">
      <PageHeader code="CONTA" title="Minha conta" description="Defina uma senha própria. Ela não fica visível em nenhuma tela do sistema." />
      <div className="space-y-4 border border-border bg-card p-6">
        <div className="grid gap-px border border-border bg-border sm:grid-cols-2">
          <div className="bg-card px-4 py-3">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Usuário</p>
            <p className="font-medium">{session?.name}</p>
          </div>
          <div className="bg-card px-4 py-3">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Nome de usuário</p>
            <p className="font-mono text-sm">{session?.username || '—'}</p>
          </div>
        </div>
        <Field label="Senha atual"><Input type="password" value={form.current} onChange={set('current')} autoComplete="current-password" /></Field>
        <Field label="Nova senha"><Input type="password" value={form.password} onChange={set('password')} placeholder="Mínimo 6 caracteres" autoComplete="new-password" /></Field>
        <Field label="Confirmar nova senha"><Input type="password" value={form.confirm} onChange={set('confirm')} autoComplete="new-password" /></Field>
        {error && <p className="border border-destructive bg-red-50 px-3 py-2 text-sm text-destructive">{error}</p>}
        <Button disabled={!form.current || !form.password || !form.confirm} onClick={save}>Salvar nova senha</Button>
        <p className="text-xs text-muted-foreground">Se você esqueceu a senha atual, saia e use "Esqueci minha senha" na tela de entrada.</p>
      </div>
    </div>
  );
}