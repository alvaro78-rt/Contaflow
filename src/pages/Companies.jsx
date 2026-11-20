import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Building2, LogOut, RefreshCw } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import PageHeader from '@/components/PageHeader';
import { Input } from '@/components/ui/input';
import Field from '@/components/Field';
import { useSession } from '@/lib/SessionContext';
import { formatCpf } from '@/lib/format';
import { describeCompaniesError } from '@/lib/companiesError';

const EXPIRED = ['sessao_invalida', 'sessao_expirada', 'conta_desligada'];

export default function Companies() {
  const { session, logout, login } = useSession();
  const navigate = useNavigate();
  const [entrando, setEntrando] = useState('');
  const [companies, setCompanies] = useState(null);
  const [inactiveCompanies, setInactiveCompanies] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const request = useRef(0);
  const changing = useRef(false);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const [notice, setNotice] = useState('');
  const [actionError, setActionError] = useState('');

  // A lista vem do servidor: a sessão mestre é validada lá, as regras de Company seguem fechadas.
  const load = async () => {
    const current = ++request.current;
    setLoading(true);
    setError('');
    try {
      const res = await base44.functions.invoke('listCompanies', { token: session?.token, include_inactive: true });
      if (current !== request.current) return;
      const data = res.data;
      if (!data?.ok) throw new Error(data?.error || 'falha');
      // A resposta pode vir de uma versão antiga do backend; não reexibir empresas inativas.
      setCompanies((data.companies || []).filter((company) => company.status !== 'inativa'));
      setInactiveCompanies((data.companies || []).filter((company) => company.status === 'inativa'));
    } catch (err) {
      if (current !== request.current) return;
      const code = err?.data?.error ?? err?.response?.data?.error;
      if (EXPIRED.includes(code) || !session?.token) {
        logout('expired');
        navigate('/login?expired=1', { replace: true });
        return;
      }
      setError(describeCompaniesError(err));
    } finally {
      if (current === request.current) setLoading(false);
    }
  };

  useEffect(() => { load(); }, [session?.token]);

  async function manage(action, company) {
    if (changing.current) return;
    if (action === 'restore' && !window.confirm(`Reativar “${company.name}” e permitir novamente o acesso aos dados existentes?`)) return;
    if (action === 'delete' && !window.confirm(`Excluir “${company.name}” da lista? O acesso à empresa será encerrado. Os dados de folha e os vínculos ficarão preservados.`)) return;
    changing.current = true;
    setBusy(true);
    setNotice('');
    setActionError('');
    try {
      const payload = action === 'create' ? { name: name.trim() } : { id: company.id };
      const res = await base44.functions.invoke('manageCompany', { action, token: session.token, ...payload });
      if (!res.data?.ok) throw new Error('falha_servidor');
      if (action === 'create') {
        setName('');
        setNotice(res.data.resumed ? 'A empresa já está na sua lista.' : 'Empresa criada. Clique em Entrar para abrir o painel.');
      } else if (action === 'delete') {
        setCompanies(rows => rows?.filter(row => row.id !== company.id));
      } else if (action === 'restore') {
        setNotice('Empresa reativada. Os cadastros anteriores foram preservados.');
      }
      await load();
    } catch (err) {
      const code = err?.data?.error ?? err?.response?.data?.error;
      if (EXPIRED.includes(code)) {
        logout('expired');
        navigate('/login?expired=1', { replace: true });
        return;
      }
      const messages = {
        nome_invalido: 'Informe um nome de 2 a 150 caracteres.',
        mestre_incompleto: 'Confira o nome e o CPF cadastrados na conta mestre.',
        somente_mestre: 'Somente a conta mestre pode gerenciar empresas.',
      };
      setActionError(messages[code] || 'Não foi possível confirmar a operação. Atualize a lista antes de tentar novamente.');
      await load();
    } finally {
      changing.current = false;
      setBusy(false);
    }
  }

  const leave = () => { logout(); navigate('/login', { replace: true }); };

  // Abre a empresa na sessão do servidor; o identificador sozinho não autoriza nada.
  const enter = async (company) => {
    setError('');
    setEntrando(company.id);
    try {
      const res = await base44.functions.invoke('enterCompany', { token: session?.token, company_id: company.id });
      if (!res.data?.ok || !res.data?.company) throw new Error('falha');
      login({ ...session, company_id: res.data.company.id, company_name: res.data.company.name });
      navigate('/', { replace: true });
    } catch (err) {
      const code = err?.data?.error ?? err?.response?.data?.error;
      if (EXPIRED.includes(code)) {
        logout('expired');
        navigate('/login?expired=1', { replace: true });
        return;
      }
      if (code === 'empresa_pendente') {
        setError('O cadastro está pendente. Reenvie o formulário com os mesmos dados para concluir o vínculo do dono.');
        return;
      }
      setError(code === 'somente_mestre'
        ? 'Só a conta mestre abre empresas.'
        : 'Não foi possível abrir esta empresa agora. Tente novamente.');
    } finally {
      setEntrando('');
    }
  };

  return (
    <div className="min-h-screen">
      <header className="border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between gap-3 px-5">
          <span className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary font-mono text-[12px] font-bold text-primary-foreground">C</span>
            <span>Conta<span className="text-emerald-600">Flow</span></span>
          </span>
          <div className="flex items-center gap-3">
            {session?.company_id && (
              <Link to="/" className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-medium hover:border-primary/40">
                <ArrowLeft className="h-3.5 w-3.5" /> Voltar ao painel
              </Link>
            )}
            <span className="hidden truncate text-xs text-muted-foreground sm:inline">{session?.name}</span>
            <button onClick={leave} className="flex items-center gap-1.5 border border-border bg-card px-2.5 py-1.5 text-xs font-medium transition-colors hover:border-destructive hover:text-destructive">
              <LogOut className="h-3.5 w-3.5" /> Sair
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-5 py-10">
        <PageHeader
          code="MESTRE"
          title="Minhas empresas"
          description="Crie, acesse, desative e reative suas próprias empresas. Cadastros e históricos são preservados."
        />
        {notice && <p role="status" className="mb-3 text-sm text-emerald-700">{notice}</p>}
        {actionError && <p role="alert" className="mb-3 text-sm text-destructive">{actionError}</p>}
        <div className="grid gap-6 md:grid-cols-[1.2fr_1fr] md:items-start">
          <div className="border border-border bg-card">
            {loading && companies === null && <p className="px-4 py-6 text-sm text-muted-foreground">Carregando…</p>}
            {error && (
              <div className="space-y-3 px-4 py-6">
                <div role="alert" className="space-y-1 border border-destructive bg-red-50 px-3 py-2 text-sm text-destructive">
                  <p>{error.message || error}</p>
                  {error.details && <p className="font-mono text-xs">listCompanies · {error.details}</p>}
                </div>
                <Button size="sm" variant="outline" onClick={load} disabled={loading}>
                  <RefreshCw className="h-3.5 w-3.5" /> {loading ? 'Tentando…' : 'Tentar novamente'}
                </Button>
              </div>
            )}
            {!error && !loading && companies?.length === 0 && (
              <p className="px-4 py-6 text-sm text-muted-foreground">Nenhuma empresa cadastrada. Use o formulário para criar a primeira empresa.</p>
            )}
            {!error && companies?.map((company) => (
              <div key={company.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3 last:border-0">
                <div className="min-w-0">
                  <p className="truncate font-medium">{company.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {company.owner_name ? `Dono: ${company.owner_name}` : 'Sem dono definido'}
                    {company.owner_cpf ? ` · ${formatCpf(company.owner_cpf)}` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span
                    className={`hidden border px-2 py-1 font-mono text-[10px] uppercase tracking-wide sm:inline ${
                      company.owner_linked ? 'border-emerald-600 text-emerald-700' : 'border-border text-muted-foreground'
                    }`}
                  >
                    {company.owner_linked ? 'dono com acesso' : (company.owner_name || company.owner_cpf) ? 'dono informado' : 'sem dono informado'}
                  </span>
                  <Button size="sm" onClick={() => enter(company)} disabled={busy || Boolean(entrando)}>
                    {entrando === company.id ? 'Abrindo…' : 'Entrar'}
                  </Button>
                  <Button variant="outline" size="sm" className="text-destructive" onClick={() => manage('delete', company)} disabled={busy || Boolean(entrando)} aria-label={`Excluir ${company.name}`}>Excluir</Button>
                </div>
              </div>
            ))}
          </div>
          <div className="space-y-4">
            <form id="criar" className="scroll-mt-24 space-y-4 rounded-xl border border-border bg-card p-5 shadow-sm" onSubmit={event => { event.preventDefault(); manage('create'); }}>
              <h2 className="flex items-center gap-2 font-semibold"><Building2 className="h-4 w-4 text-primary" /> Criar empresa</h2>
              <Field label="Nome da empresa"><Input required minLength={2} maxLength={150} value={name} onChange={event => setName(event.target.value)} /></Field>
              <p className="text-xs text-muted-foreground">Sua conta mestre será o dono desta empresa.</p>
              <Button type="submit" disabled={busy || Boolean(entrando) || name.trim().length < 2}>Criar empresa</Button>
            </form>
            {inactiveCompanies.length > 0 && (
              <section className="space-y-3 border border-border bg-card p-5">
                <h2 className="font-semibold">Empresas desativadas</h2>
                <p className="text-xs text-muted-foreground">Reative uma empresa para voltar a acessar seus registros e funcionários existentes.</p>
                {inactiveCompanies.map(company => (
                  <div key={company.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
                    <span className="text-sm font-medium">{company.name}</span>
                    <Button type="button" size="sm" variant="outline" disabled={busy || Boolean(entrando)} onClick={() => manage('restore', company)}>Reativar</Button>
                  </div>
                ))}
              </section>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}