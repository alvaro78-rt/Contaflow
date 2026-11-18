import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { FlaskConical, ShieldCheck } from 'lucide-react';
import { SessionContext } from '@/lib/SessionContext';
import { ServicesProvider } from '@/lib/ServicesContext';
import { createDemoBackend, DEMO_SEED } from '@/lib/demoEngine';
import PortalLogin from '@/pages/PortalLogin';
import NewCompanyForm from '@/components/companies/NewCompanyForm';
import OwnerPanel from '@/components/dashboard/OwnerPanel';
import DemoCompanyList from '@/components/demo/DemoCompanyList';
import DemoTestPanel from '@/components/demo/DemoTestPanel';

const STEPS = [
  { key: 'entrar', code: '01', label: 'Entrar (real)' },
  { key: 'empresas', code: '02', label: 'Criar empresa (real)' },
  { key: 'painel', code: '03', label: 'Painel do dono (real)' },
  { key: 'testes', code: '04', label: 'Testes (simulados)' },
];

export default function Demo() {
  const [backend] = useState(() => createDemoBackend());
  const services = useMemo(() => ({ invoke: (name, payload) => backend.invoke(name, payload) }), [backend]);
  const [session, setSession] = useState(null);
  const [step, setStep] = useState('entrar');
  const [version, setVersion] = useState(0);
  const [falhaVinculo, setFalhaVinculo] = useState(false);
  const [perdeResposta, setPerdeResposta] = useState(false);

  const api = useMemo(() => ({
    session,
    login: (data) => setSession(data),
    logout: () => setSession(null),
  }), [session]);

  const refresh = () => {
    setVersion((v) => v + 1);
    // Cada falha vale para uma criação: ao voltar o resultado, a chave é desarmada.
    if (falhaVinculo) { setFalhaVinculo(false); backend.faults.ownerLinkFailures = 0; }
    if (perdeResposta) { setPerdeResposta(false); backend.faults.lostResponses = 0; }
  };

  const toggleFalhaVinculo = (on) => {
    setFalhaVinculo(on);
    backend.faults.ownerLinkFailures = on ? 1 : 0;
  };
  const togglePerdeResposta = (on) => {
    setPerdeResposta(on);
    backend.faults.lostResponses = on ? 1 : 0;
  };

  return (
    <ServicesProvider services={services}>
      <SessionContext.Provider value={api}>
        <div className="min-h-screen bg-background">
          <div className="sticky top-0 z-20 border-b border-amber-600 bg-amber-50">
            <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-5 py-2">
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-amber-900">
                <FlaskConical className="h-4 w-4" /> Demonstração · dados fictícios em memória
              </p>
              <p className="text-xs text-amber-900">Nada é gravado na base · nenhuma chamada ao backend hospedado</p>
            </div>
          </div>

          <header className="border-b border-border">
            <div className="mx-auto flex max-w-6xl flex-wrap items-end justify-between gap-4 px-5 py-6">
              <div>
                <p className="font-mono text-xs text-emerald-700">[PERCURSO COMPLETO]</p>
                <h1 className="text-2xl font-semibold tracking-tight">Mestre cria a empresa, dono entra e vê só a dele</h1>
                <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                  Login, formulário e painel são os componentes reais do app. Só o backend é simulado: uma função em memória no lugar das funções de servidor.
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="border border-emerald-600 bg-emerald-50 px-2 py-1 font-mono text-emerald-800">real: telas</span>
                <span className="border border-amber-600 bg-amber-50 px-2 py-1 font-mono text-amber-900">simulado: serviços</span>
                {session
                  ? <button onClick={() => { setSession(null); setStep('entrar'); }} className="border border-border bg-card px-2.5 py-1 font-medium">Sair da sessão fictícia</button>
                  : null}
              </div>
            </div>
          </header>

          <main className="mx-auto max-w-6xl px-5 py-6">
            <nav className="mb-6 flex flex-wrap gap-2">
              {STEPS.map((s) => (
                <button
                  key={s.key}
                  onClick={() => setStep(s.key)}
                  className={`border px-3 py-1.5 text-xs font-medium transition-colors ${step === s.key ? 'border-emerald-600 bg-accent text-accent-foreground' : 'border-border bg-card hover:border-emerald-600'}`}
                >
                  <span className="mr-1.5 font-mono">[{s.code}]</span>{s.label}
                </button>
              ))}
            </nav>

            {session && (
              <p className="mb-4 font-mono text-xs text-muted-foreground">
                sessão fictícia: {session.name} · papel {session.role} · empresa {session.company_name || '—'} · token {String(session.token).slice(0, 14)}…
              </p>
            )}

            {step === 'entrar' && (
              <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr] lg:items-start">
                <Deck />
                <div className="border border-border bg-card">
                  <p className="border-b border-border px-4 py-2 font-mono text-[11px] text-emerald-700">componente real · PortalLogin</p>
                  <div className="overflow-hidden">
                    <PortalLogin
                      afterLogin={(emp) => setStep(emp.access_role === 'master' ? 'empresas' : 'painel')}
                    />
                  </div>
                </div>
              </div>
            )}

            {step === 'empresas' && (
              <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr] lg:items-start">
                {session?.master ? (
                  <div className="space-y-4">
                    <NewCompanyForm onCreated={refresh} onRefresh={refresh} />
                    <div className="space-y-2 border border-amber-600 bg-amber-50 px-4 py-3 text-xs text-amber-900">
                      <p className="font-semibold">Falhas para a apresentação</p>
                      <label className="flex items-center gap-2">
                        <input type="checkbox" checked={falhaVinculo} onChange={(e) => toggleFalhaVinculo(e.target.checked)} />
                        próxima criação falha ao vincular o dono (estado parcial)
                      </label>
                      <label className="flex items-center gap-2">
                        <input type="checkbox" checked={perdeResposta} onChange={(e) => togglePerdeResposta(e.target.checked)} />
                        próxima criação grava e perde a resposta (resultado desconhecido)
                      </label>
                      <p className="text-amber-800">Os dois cenários mostram a mensagem de “cadastro pendente de confirmação”, sem reenvio automático.</p>
                    </div>
                  </div>
                ) : (
                  <p className="border border-border bg-card px-4 py-6 text-sm text-muted-foreground">
                    Este passo é da conta mestre. Volte ao passo 01 e entre com o CPF de mestre.
                  </p>
                )}
                <DemoCompanyList token={session?.token} version={version} />
              </div>
            )}

            {step === 'painel' && (
              <div>
                <p className="mb-3 flex items-center gap-2 font-mono text-[11px] text-emerald-700">
                  <ShieldCheck className="h-3.5 w-3.5" /> componente real · OwnerPanel · leitura no servidor simulado
                </p>
                {session?.company_id
                  ? <OwnerPanel />
                  : (
                    <p className="border border-border bg-card px-4 py-6 text-sm text-muted-foreground">
                      Entre com o CPF de um dono no passo 01 para ver o painel dele.
                    </p>
                  )}
              </div>
            )}

            {step === 'testes' && <DemoTestPanel />}

            <p className="mt-10 text-xs text-muted-foreground">
              Esta tela não existe no app real para o cliente final: é uma rota de demonstração. <Link to="/" className="underline">Voltar ao app</Link>.
            </p>
          </main>
        </div>
      </SessionContext.Provider>
    </ServicesProvider>
  );
}

function Deck() {
  const empresas = DEMO_SEED.companies;
  return (
    <div className="space-y-4">
      <div className="border border-border bg-card">
        <p className="border-b border-border px-4 py-2 font-mono text-[11px] text-emerald-700">CPFs fictícios desta demonstração</p>
        <div className="divide-y divide-border text-sm">
          <div className="px-4 py-3">
            <p className="font-medium">Conta mestre</p>
            <p className="font-mono text-xs text-muted-foreground">{DEMO_SEED.master.cpf} · senha {DEMO_SEED.master.password}</p>
            <p className="text-xs text-muted-foreground">Passo 01 → cria empresa no passo 02.</p>
          </div>
          {empresas.map((c) => (
            <div key={c.owner.cpf} className="px-4 py-3">
              <p className="font-medium">Dono · {c.name}</p>
              <p className="font-mono text-xs text-muted-foreground">{c.owner.cpf} · senha {c.owner.password}</p>
              <p className="text-xs text-muted-foreground">Passo 01 → painel só desta empresa no passo 03.</p>
            </div>
          ))}
        </div>
      </div>
      <div className="border border-border bg-card px-4 py-3 text-xs text-muted-foreground">
        <p className="mb-1 font-semibold text-foreground">Duas empresas já vêm na memória</p>
        <p>Os donos acima já existem para comparar o painel de cada uma. A empresa criada no passo 02 nasce vazia, com folhas zeradas de verdade.</p>
      </div>
    </div>
  );
}