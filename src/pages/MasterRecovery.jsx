import { useState } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import AuthShell from '@/components/auth/AuthShell';
import Field from '@/components/Field';
import { useSession } from '@/lib/SessionContext';
import { formatCpf, onlyDigits } from '@/lib/format';
import { cpfMessage, isValidCpf } from '@/lib/cpf';

const EMPTY = { full_name: '', cpf: '', password: '', confirm: '', key: '' };

const ERROR_TEXT = {
  nao_autenticado:
    'Esta tela é exclusiva do proprietário do aplicativo no Base44. Abra a pré-visualização logado na sua conta Base44.',
  somente_proprietario: 'Esta tela é exclusiva do proprietário do aplicativo no Base44.',
  chave_nao_configurada: 'A chave de recuperação não está definida em Segredos (MASTER_RECOVERY_KEY).',
  chave_obrigatoria: 'Informe a chave de recuperação.',
  chave_invalida: 'Chave de recuperação incorreta.',
  chave_em_andamento: 'Já existe uma tentativa em andamento. Aguarde alguns segundos e tente novamente.',
  recuperacao_em_andamento:
    'Já existe uma recuperação em andamento para esta chave. Aguarde cerca de 20 segundos e tente de novo.',
  chave_ja_usada: 'Esta chave já foi usada numa recuperação. Defina uma nova em Segredos.',
  nome_invalido: 'Informe o nome completo do novo mestre.',
  cpf_invalido: cpfMessage,
  cpf_em_uso: 'Este CPF já tem acesso em uma empresa. Use outro CPF para a conta mestre.',
  senha_curta: 'A senha deve ter ao menos 6 caracteres.',
  falha_revertida: 'A substituição falhou e o acesso anterior foi restaurado. Nada mudou.',
  falha_reverter:
    'A substituição falhou e o acesso anterior precisa ser revisado no painel antes de tentar de novo.',
  falha_servidor: 'Não foi possível concluir agora. Nenhuma alteração foi confirmada.',
};

export default function MasterRecovery() {
  const [f, setF] = useState(EMPTY);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const { logout } = useSession();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    const cpf = onlyDigits(f.cpf);
    if (f.full_name.trim().length < 3) return setError('Informe o nome completo do novo mestre.');
    if (!isValidCpf(cpf)) return setError(cpfMessage);
    if (f.password.length < 6) return setError('A senha deve ter ao menos 6 caracteres.');
    if (f.password !== f.confirm) return setError('As senhas não conferem.');
    if (!f.key.trim()) return setError('Informe a chave de recuperação.');
    if (busy) return;
    setBusy(true);

    try {
      const res = await base44.functions.invoke('recoverMaster', {
        key: f.key.trim(),
        full_name: f.full_name.trim(),
        cpf,
        password: f.password,
      });
      setResult(res.data);
      logout();
      setF(EMPTY);
    } catch (err) {
      const code = err?.response?.data?.error || 'falha_servidor';
      setError(ERROR_TEXT[code] || ERROR_TEXT.falha_servidor);
    }
    setBusy(false);
  };

  if (result?.master) {
    return (
      <AuthShell
        title="Conta mestre substituída"
        subtitle="A conta antiga perdeu o papel de mestre e as sessões dela foram encerradas."
      >
        <div className="space-y-4">
          <div className="border border-emerald-600 bg-accent p-4 text-sm text-accent-foreground">
            <p className="font-semibold">{result.master.full_name}</p>
            <p className="text-xs">Nova conta mestre criada · {result.master.id}</p>
            <ul className="mt-2 space-y-1 font-mono text-[11px]">
              <li>mestres ativos: {result.mestres_ativos}</li>
              <li>sessões encerradas: {result.sessoes_invalidadas}</li>
              <li>contas neutralizadas: {(result.contas_anteriores_neutralizadas || []).length}</li>
              <li>chave usada: consumida</li>
            </ul>
          </div>
          {result.mestres_ativos !== 1 && (
            <p className="border border-destructive bg-red-50 px-3 py-2 text-sm text-destructive">
              A conferência final não encontrou exatamente um mestre ativo. Revise a base antes de publicar.
            </p>
          )}
          <Button asChild className="w-full">
            <Link to="/login">Entrar com a nova conta</Link>
          </Button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Recuperar acesso mestre"
      subtitle="Uso exclusivo do proprietário do aplicativo no Base44. A conta antiga é neutralizada, não excluída."
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
          Ao concluir: a conta mestre anterior fica desativada e sem senha, as sessões dela são encerradas e esta
          chave deixa de funcionar. As empresas e seus dados não são tocados.
        </div>
        <Field label="Nome completo do novo mestre">
          <Input value={f.full_name} onChange={set('full_name')} autoComplete="name" />
        </Field>
        <Field label="CPF do novo mestre">
          <Input
            className="font-mono"
            inputMode="numeric"
            value={formatCpf(f.cpf)}
            onChange={set('cpf')}
            placeholder="000.000.000-00"
            autoComplete="off"
          />
        </Field>
        <Field label="Nova senha">
          <Input
            type="password"
            value={f.password}
            onChange={set('password')}
            placeholder="Mínimo 6 caracteres"
            autoComplete="new-password"
          />
        </Field>
        <Field label="Confirmar nova senha">
          <Input type="password" value={f.confirm} onChange={set('confirm')} autoComplete="new-password" />
        </Field>
        <Field label="Chave de recuperação">
          <Input
            type="password"
            value={f.key}
            onChange={set('key')}
            placeholder="Chave definida em Segredos"
            autoComplete="off"
          />
        </Field>
        {error && <p className="border border-destructive bg-red-50 px-3 py-2 text-sm text-destructive">{error}</p>}
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? 'Substituindo…' : 'Substituir conta mestre'}
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          <Link to="/login" className="underline">Voltar para o login</Link>
        </p>
      </form>
    </AuthShell>
  );
}