import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { employeeError, saveEmployee, SESSION_ERRORS } from '@/api/employeeAdmin';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import PageHeader from '@/components/PageHeader';
import Field from '@/components/Field';
import { useSession } from '@/lib/SessionContext';
import { formatCpf, onlyDigits } from '@/lib/format';
import { isValidCpf } from '@/lib/cpf';

const MENSAGENS = {
  cpf_invalido: 'CPF inválido. Confira os 11 dígitos.',
  cpf_ja_tem_acesso: 'Este CPF já tem acesso criado. Cada CPF é uma única conta.',
  senha_curta: 'A senha inicial precisa ter ao menos 6 caracteres.',
  nome_invalido: 'Informe o nome completo do funcionário.',
  sem_permissao: 'Seu perfil não pode cadastrar funcionários nesta empresa.',
  sem_empresa: 'Nenhuma empresa está aberta na sua sessão.',
  sessao_expirada: 'Sessão expirada. Entre novamente.',
  sessao_invalida: 'Sessão inválida. Entre novamente.',
  conta_desligada: 'Esta conta está desligada.',
};

export default function NewEmployee() {
  const { session, logout } = useSession();
  const navigate = useNavigate();
  const [f, setF] = useState({ full_name: '', cpf: '', password: '' });
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setError('');
    setOk('');
    const cpf = onlyDigits(f.cpf);
    if (f.full_name.trim().length < 3) return setError(MENSAGENS.nome_invalido);
    if (cpf.length !== 11 || !isValidCpf(cpf)) return setError(MENSAGENS.cpf_invalido);
    if (f.password.length < 6) return setError(MENSAGENS.senha_curta);

    setBusy(true);
    try {
      const { employee } = await saveEmployee(session.token, {
        action: 'quick',
        expected_company_id: session.company_id,
        full_name: f.full_name.trim(),
        cpf,
        password: f.password,
      });
      // A primeira versão do cadastro confirmava a criação com o ID da empresa.
      const legacyCreated = employee?.tem_acesso === undefined && employee?.company_id === session.company_id;
      if (!employee?.id || employee.duplicated || !(employee.tem_acesso === true || legacyCreated)) {
        setError('O servidor não confirmou a criação do acesso. Confira este CPF na consulta de funcionários antes de tentar novamente.');
        return;
      }
      // Só confirma depois que o servidor devolveu o vínculo salvo.
      setOk(`Funcionário cadastrado com sucesso. Login: ${formatCpf(cpf)} e a senha inicial definida.`);
      setF({ full_name: '', cpf: '', password: '' });
    } catch (err) {
      if (SESSION_ERRORS.includes(err.code)) {
        logout('expired');
        navigate('/login?expired=1', { replace: true });
        return;
      }
      setError(employeeError(err, 'Não foi possível cadastrar o funcionário agora.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-xl space-y-5">
      <PageHeader code="RF03" title="Novo funcionário" description="O CPF é o próprio nome de usuário. A empresa vem da sua sessão autorizada." />
      <form onSubmit={submit} className="space-y-4 border border-border bg-card p-5">
        <Field label="Nome completo">
          <Input value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} />
        </Field>
        <Field label="CPF">
          <Input className="font-mono" inputMode="numeric" value={formatCpf(f.cpf)} onChange={(e) => setF({ ...f, cpf: e.target.value })} placeholder="000.000.000-00" autoComplete="off" />
        </Field>
        <Field label="Senha inicial">
          <Input type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} placeholder="Mínimo 6 caracteres" maxLength={128} autoComplete="new-password" />
        </Field>
        {error && <p className="border border-destructive bg-red-50 px-3 py-2 text-sm text-destructive">{error}</p>}
        {ok && <p className="border border-emerald-600 bg-accent px-3 py-2 text-sm text-accent-foreground">{ok}</p>}
        <div className="flex gap-3">
          <Button type="submit" disabled={busy}>{busy ? 'Salvando…' : 'Cadastrar funcionário'}</Button>
          <Button variant="ghost" asChild><Link to="/funcionarios/novo">Cadastro completo</Link></Button>
        </div>
      </form>
    </div>
  );
}