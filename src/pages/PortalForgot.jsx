import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { unscoped as base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import AuthShell from '@/components/auth/AuthShell';
import Field from '@/components/Field';
import { hashPassword } from '@/lib/auth';
import { formatCpf, onlyDigits } from '@/lib/format';

export default function PortalForgot() {
  const [form, setForm] = useState({ cpf: '', birth_date: '', password: '', confirm: '' });
  const [employee, setEmployee] = useState(null);
  const [error, setError] = useState('');
  const { toast } = useToast();
  const navigate = useNavigate();
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const verify = async (e) => {
    e.preventDefault();
    setError('');
    const cpf = onlyDigits(form.cpf);
    const r = await base44.entities.Employee.filter({ cpf }, { limit: 1 });
    const emp = r.items[0];
    if (cpf.length !== 11 || !emp || !emp.birth_date || emp.birth_date !== form.birth_date) {
      setError('Não foi possível confirmar os dados. Confira o CPF e a data de nascimento, ou procure o RH.');
      return;
    }
    setEmployee(emp);
  };

  const reset = async (e) => {
    e.preventDefault();
    setError('');
    if (form.password.length < 6) return setError('A senha deve ter ao menos 6 caracteres.');
    if (form.password !== form.confirm) return setError('As senhas não conferem.');
    await base44.entities.Employee.update(employee.id, { password_hash: await hashPassword(employee.cpf, form.password) });
    toast({ title: 'Senha redefinida', description: 'Entre com a nova senha.' });
    navigate('/login', { replace: true });
  };

  return (
    <AuthShell
      title="Recuperar senha"
      subtitle={employee ? `Confirme a nova senha de ${employee.full_name}.` : 'Confirme seus dados para definir uma nova senha.'}
    >
      {!employee ? (
        <form onSubmit={verify} className="space-y-4">
          <Field label="CPF"><Input className="font-mono" inputMode="numeric" value={formatCpf(form.cpf)} onChange={set('cpf')} placeholder="000.000.000-00" /></Field>
          <Field label="Data de nascimento"><Input type="date" value={form.birth_date} onChange={set('birth_date')} /></Field>
          {error && <p className="border border-destructive bg-red-50 px-3 py-2 text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full">Verificar dados</Button>
          <p className="text-center text-sm text-muted-foreground">
            Lembrou a senha? <Link to="/login" className="font-medium text-primary underline">Entrar</Link>
          </p>
        </form>
      ) : (
        <form onSubmit={reset} className="space-y-4">
          <Field label="Nova senha"><Input type="password" value={form.password} onChange={set('password')} placeholder="Mínimo 6 caracteres" autoComplete="new-password" /></Field>
          <Field label="Confirmar nova senha"><Input type="password" value={form.confirm} onChange={set('confirm')} autoComplete="new-password" /></Field>
          {error && <p className="border border-destructive bg-red-50 px-3 py-2 text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full">Redefinir senha</Button>
          <button type="button" className="w-full text-center text-sm text-muted-foreground underline" onClick={() => { setEmployee(null); setForm({ ...form, password: '', confirm: '' }); }}>
            Não sou eu
          </button>
        </form>
      )}
    </AuthShell>
  );
}