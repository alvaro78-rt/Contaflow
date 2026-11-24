import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import Field from '@/components/Field';
import { useSession } from '@/lib/SessionContext';
import { hashPassword, ROLE_LABEL } from '@/lib/auth';
import { formatCpf } from '@/lib/format';

export default function TransferOwnerCard() {
  const { session, login } = useSession();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [employees, setEmployees] = useState(null);
  const [targetId, setTargetId] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    base44.entities.Employee.filter({}, { sort: 'full_name', limit: 500 }).then((r) => setEmployees(r.items));
  }, []);

  const others = (employees || []).filter((e) => e.id !== session?.id);
  const target = others.find((e) => e.id === targetId) || null;

  const transfer = async () => {
    setError('');
    if (!target) return setError('Selecione quem será o novo dono.');
    if (password.length < 6) return setError('Defina uma senha com ao menos 6 caracteres para o novo dono.');
    if (password !== confirm) return setError('A confirmação não confere com a senha definida.');
    setBusy(true);
    try {
      await base44.entities.Employee.update(target.id, {
        access_role: 'admin',
        password_hash: await hashPassword(target.cpf, password),
      });
      await base44.entities.Employee.update(session.id, { access_role: 'funcionario' });
      login({ ...session, role: 'funcionario' });
      toast({ title: 'Administração transferida', description: `${target.full_name} agora é o dono do sistema.` });
      navigate('/');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-8 space-y-4 border border-border bg-card p-6">
      <div>
        <h2 className="font-semibold">Trocar o dono do sistema</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Escolha quem passa a administrar tudo e defina a senha dele. Você continua com acesso, mas como funcionário (ponto e contracheque). O novo dono entra com o CPF e a senha definidos aqui.
        </p>
      </div>

      {employees && others.length === 0 ? (
        <p className="border border-border bg-secondary/50 px-3 py-2 text-sm text-muted-foreground">
          Nenhum outro cadastro disponível. <Link to="/funcionarios/novo" className="text-emerald-700 underline">Cadastre o novo dono em Funcionários → Novo</Link> (perfil Administrador) e volte aqui.
        </p>
      ) : (
        <>
          <Field label="Novo dono">
            <Select value={targetId || undefined} onValueChange={setTargetId}>
              <SelectTrigger><SelectValue placeholder="Selecione o funcionário" /></SelectTrigger>
              <SelectContent>
                {others.map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.full_name} · {formatCpf(e.cpf)} · {ROLE_LABEL[e.access_role] || 'Funcionário'}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nova senha do novo dono"><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mínimo 6 caracteres" autoComplete="new-password" /></Field>
            <Field label="Confirmar senha"><Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" /></Field>
          </div>
          {error && <p className="border border-destructive bg-red-50 px-3 py-2 text-sm text-destructive">{error}</p>}
          <Button disabled={busy || !targetId || !password || !confirm} onClick={transfer}>
            {busy ? 'Transferindo…' : 'Transferir administração'}
          </Button>
        </>
      )}
    </div>
  );
}
