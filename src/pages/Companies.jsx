import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, RefreshCw } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import PageHeader from '@/components/PageHeader';
import NewCompanyForm from '@/components/companies/NewCompanyForm';
import { useSession } from '@/lib/SessionContext';
import { formatCpf } from '@/lib/format';

const EXPIRED = ['sessao_invalida', 'sessao_expirada'];

export default function Companies() {
  const { session, logout, login } = useSession();
  const navigate = useNavigate();
  const [entrando, setEntrando] = useState('');
  const [companies, setCompanies] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const carregando = useRef(false);

  // A lista vem do servidor: a sessão mestre é validada lá, as regras de Company seguem fechadas.
  const load = async () => {
    if (carregando.current) return;
    carregando.current = true;
    setLoading(true);
    setError('');
    try {
      const res = await base44.functions.invoke('listCompanies', { token: session?.token });
      const data = res.data;
      if (!data?.ok) throw new Error(data?.error || 'falha');
      setCompanies(data.companies || []);
    } catch (err) {
      const code = err?.data?.error ?? err?.response?.data?.error;
      if (EXPIRED.includes(code) || !session?.token) {
        logout('expired');
        navigate('/login?expired=1', { replace: true });
        return;
      }
      setError('Não foi possível carregar as empresas agora. Tente novamente.');
    } finally {
      carregando.current = false;
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [session?.token]);

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
            <span className="grid h-6 w-6 place-items-center bg-primary font-mono text-[11px] text-primary-foreground">F</span>
            <span>Folha<span className="text-emerald-600">/</span>Ledger</span>
          </span>
          <div className="flex items-center gap-3">
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
          title="Escolha a empresa"
          description="Cada empresa tem o próprio dono, funcionários e folha. O painel de cada empresa é aberto pelo dono, entrando com o CPF e a senha dele."
        />
        <div className="grid gap-6 md:grid-cols-[1.2fr_1fr] md:items-start">
          <div className="border border-border bg-card">
            {loading && companies === null && <p className="px-4 py-6 text-sm text-muted-foreground">Carregando…</p>}
            {error && (
              <div className="space-y-3 px-4 py-6">
                <p className="border border-destructive bg-red-50 px-3 py-2 text-sm text-destructive">{error}</p>
                <Button size="sm" variant="outline" onClick={load} disabled={loading}>
                  <RefreshCw className="h-3.5 w-3.5" /> {loading ? 'Tentando…' : 'Tentar novamente'}
                </Button>
              </div>
            )}
            {!error && !loading && companies?.length === 0 && (
              <p className="px-4 py-6 text-sm text-muted-foreground">Nenhuma empresa cadastrada. O cadastro de empresa está bloqueado no servidor nesta versão.</p>
            )}
            {!error && companies?.map((company) => (
              <div key={company.id} className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 last:border-0">
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
                      company.owner_linked ? 'border-emerald-600 text-emerald-700' : 'border-destructive text-destructive'
                    }`}
                  >
                    {company.owner_linked ? 'dono com acesso' : 'sem dono vinculado'}
                  </span>
                  <Button size="sm" onClick={() => enter(company)} disabled={entrando === company.id}>
                    {entrando === company.id ? 'Abrindo…' : 'Entrar'}
                  </Button>
                </div>
              </div>
            ))}
          </div>
          <NewCompanyForm onCreated={load} onRefresh={load} />
        </div>
      </main>
    </div>
  );
}