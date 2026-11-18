import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import Field from '@/components/Field';
import { useSession } from '@/lib/SessionContext';
import { formatCpf, onlyDigits } from '@/lib/format';
import { cpfMessage, isValidCpf } from '@/lib/cpf';
import { useServices } from '@/lib/ServicesContext';

const EMPTY = { name: '', owner_name: '', owner_cpf: '', password: '', confirm: '' };
const TIMEOUT_MS = 25000;

const EXPIRED = ['sessao_invalida', 'sessao_expirada', 'conta_desligada'];

const ERROR_TEXT = {
  empresa_inativa: 'Esta empresa está inativa.',
  dono_divergente: 'Os dados informados não conferem com o acesso do dono já cadastrado.',
  somente_mestre: 'Somente a conta mestre pode criar empresas.',
  cpf_ja_tem_acesso: 'Este CPF já está vinculado a outro cadastro. Confira os dados do dono.',
  senha_curta: 'A senha do dono deve ter ao menos 6 caracteres.',
  criacao_bloqueada:
    'O cadastro de empresa está bloqueado no servidor: ele ainda não garante cadastro único, então nada foi criado.',
  dados_invalidos: 'Confira o nome da empresa, o nome e o CPF do dono.',
  estado_parcial:
    'O servidor recebeu o cadastro, mas a empresa ainda não tem o dono vinculado.',
};

// onRefresh atualiza a lista do mestre por leitura, sem criar nada.
export default function NewCompanyForm({ onCreated, onRefresh }) {
  const services = useServices();
  const [f, setF] = useState(EMPTY);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const emAndamento = useRef(false);
  const { session, logout } = useSession();
  const { toast } = useToast();
  const navigate = useNavigate();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const sairPorSessao = () => {
    logout('expired');
    navigate('/login?expired=1', { replace: true });
  };

  const atualizarLista = async () => {
    if (!onRefresh) return;
    setRefreshing(true);
    try { await onRefresh(); } finally { setRefreshing(false); }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (emAndamento.current) return;
    setError('');
    setNotice('');
    const cpf = onlyDigits(f.owner_cpf);
    if (!f.name.trim()) return setError('Informe o nome da empresa.');
    if (!f.owner_name.trim()) return setError('Informe o nome do dono.');
    if (!isValidCpf(cpf)) return setError(cpfMessage);
    if (f.password.length < 6) return setError('A senha do dono deve ter ao menos 6 caracteres.');
    if (f.password !== f.confirm) return setError('As senhas não conferem.');

    emAndamento.current = true;
    setBusy(true);

    let expirou = false;
    try {
      const res = await Promise.race([
        services.invoke('createCompany', {
          token: session?.token,
          name: f.name.trim(),
          owner_name: f.owner_name.trim(),
          owner_cpf: cpf,
          owner_password: f.password,
        }),
        new Promise((_, reject) => setTimeout(() => reject({ timeout: true }), TIMEOUT_MS)),
      ]);

      const data = res.data;
      if (!data?.ok) {
        const code = data?.error || 'falha_servidor';
        if (EXPIRED.includes(code)) {
          expirou = true;
          sairPorSessao();
          return;
        }
        setError(ERROR_TEXT[code] || 'Não foi possível criar a empresa agora. Tente novamente.');
        return;
      }

      setF(EMPTY);
      toast({
        title: data.resumed ? 'Empresa confirmada' : 'Empresa criada',
        description: `${data.company.name} está com o dono vinculado.`,
      });
      onCreated?.(data.company);
    } catch (err) {
      const code = err?.data?.error ?? err?.response?.data?.error;
      if (EXPIRED.includes(code)) {
        expirou = true;
        sairPorSessao();
        return;
      }
      if (ERROR_TEXT[code] && code !== 'estado_parcial') {
        setError(ERROR_TEXT[code]);
        return;
      }
      if (err?.timeout) {
        setNotice('O servidor não respondeu a tempo e o resultado ainda é desconhecido: a empresa pode ter sido criada com ou sem o dono.');
      } else if (code === 'estado_parcial') {
        setNotice(ERROR_TEXT.estado_parcial);
      } else if (code === 'falha_servidor') {
        setNotice('O servidor respondeu com falha depois de receber o cadastro, então o resultado ainda é desconhecido.');
      } else {
        setNotice('Não foi possível confirmar a criação. O resultado ainda é desconhecido.');
      }
      const recarregar = onRefresh || onCreated;
      recarregar?.();
    } finally {
      if (!expirou) {
        emAndamento.current = false;
        setBusy(false);
      }
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4 border border-border bg-card p-5">
      <div>
        <p className="font-mono text-[11px] text-emerald-700">[NOVA EMPRESA]</p>
        <h2 className="font-semibold">Criar empresa</h2>
        <p className="mt-1 text-xs text-muted-foreground">O dono poderá entrar com o CPF e a senha definidos aqui.</p>
      </div>
      <Field label="Nome da empresa"><Input value={f.name} onChange={set('name')} placeholder="Ex.: Contabilidade Silva" /></Field>
      <Field label="Nome do dono"><Input value={f.owner_name} onChange={set('owner_name')} /></Field>
      <Field label="CPF do dono"><Input className="font-mono" inputMode="numeric" value={formatCpf(f.owner_cpf)} onChange={set('owner_cpf')} placeholder="000.000.000-00" /></Field>
      <Field label="Senha do dono"><Input type="password" value={f.password} onChange={set('password')} placeholder="Mínimo 6 caracteres" autoComplete="new-password" /></Field>
      <Field label="Confirmar senha"><Input type="password" value={f.confirm} onChange={set('confirm')} autoComplete="new-password" /></Field>
      {error && <p className="border border-destructive bg-red-50 px-3 py-2 text-sm text-destructive">{error}</p>}
      {notice && (
        <div className="space-y-2 border border-amber-600 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <p className="font-semibold">Resultado desconhecido</p>
          <p>{notice}</p>
          <p className="text-xs">
            Confira a lista ou envie novamente os mesmos dados para concluir o cadastro.
          </p>
          {onRefresh && (
            <Button type="button" size="sm" variant="outline" onClick={atualizarLista} disabled={refreshing}>
              {refreshing ? 'Atualizando…' : 'Atualizar lista'}
            </Button>
          )}
        </div>
      )}
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? 'Criando…' : 'Criar empresa'}
      </Button>
    </form>
  );
}