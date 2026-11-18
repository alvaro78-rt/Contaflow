import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MODULES } from '@/lib/modules';
import { useSession } from '@/lib/SessionContext';
import { useServices } from '@/lib/ServicesContext';
import { competenceLabel, money } from '@/lib/format';

// Primeiro painel do dono depois de entrar.
// Toda a leitura vem de uma única chamada ao servidor, que deriva a empresa e o perfil
// da sessão validada. Campos usados: company{id,name,status}, profile{name,role},
// counts{ativos,afastados,sem_acesso}, competence, payroll{folhas,finalizadas,proventos,descontos,liquido}.

const ROLE_LABEL = { admin: 'Dono / administrador', gerente: 'Gerente', funcionario: 'Funcionário', master: 'Conta mestre' };
const EXPIRED = ['sessao_invalida', 'sessao_expirada'];

export default function OwnerPanel() {
  const { session } = useSession();
  const services = useServices();
  const [data, setData] = useState(null);
  const [erro, setErro] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    setErro(null);
    try {
      const res = await services.invoke('companyDashboard', { token: session?.token });
      const payload = res?.data;
      if (!payload?.ok) throw { code: payload?.error, status: 200 };
      setData(payload);
    } catch (err) {
      setData(null);
      setErro({
        code: err?.response?.data?.error || err?.code || '',
        status: err?.response?.status || err?.status || 0,
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [session?.token]);

  const empresa = data?.company?.name || session?.company_name || 'Sua empresa';
  const status = data?.company?.status || 'ativa';

  const mensagem = () => {
    if (!erro) return '';
    if (EXPIRED.includes(erro.code)) return 'Sua sessão expirou. Entre novamente para ver os números desta empresa.';
    if (erro.code === 'sem_empresa') return 'Seu cadastro não está vinculado a nenhuma empresa. Fale com a conta mestre.';
    if (erro.status === 404 || erro.code === 'funcao_inexistente') {
      return 'A leitura deste painel no servidor ainda não foi aprovada. Nada é exibido como zero enquanto isso.';
    }
    return 'Não foi possível ler o painel desta empresa agora. Nada aqui é exibido como zero por segurança.';
  };

  const numeros = data
    ? [
        ['Funcionários ativos', data.counts.ativos],
        ['Afastados', data.counts.afastados],
        ['Sem acesso criado', data.counts.sem_acesso],
        [`Folhas · ${competenceLabel(data.competence)}`, data.payroll.folhas],
        ['Finalizadas', data.payroll.finalizadas],
        ['Proventos', money(data.payroll.proventos)],
        ['Descontos', money(data.payroll.descontos)],
        ['Líquido a pagar', money(data.payroll.liquido)],
      ]
    : [];

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-border pb-6">
        <div>
          <p className="mb-2 font-mono text-xs text-emerald-700">[PAINEL DA EMPRESA]</p>
          <h1 className="text-3xl font-semibold tracking-tight">{empresa}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {data ? `${data.profile.name} · ${ROLE_LABEL[data.profile.role] || data.profile.role}` : session?.name || '—'}
            {' · '}empresa {status}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="border border-border bg-card px-2.5 py-1 font-mono text-[11px] text-muted-foreground">
            somente leitura
          </span>
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className="h-3.5 w-3.5" /> {loading ? 'Lendo…' : 'Atualizar'}
          </Button>
        </div>
      </div>

      {loading && !data && (
        <p className="border border-border bg-card px-4 py-6 text-sm text-muted-foreground">Lendo o painel desta empresa no servidor…</p>
      )}

      {erro && (
        <div className="mb-6 space-y-3 border border-border bg-card px-4 py-4">
          <p className="border border-destructive bg-red-50 px-3 py-2 text-sm text-destructive">{mensagem()}</p>
          <p className="text-xs text-muted-foreground">Código do servidor: {erro.code || '—'}</p>
        </div>
      )}

      {data && (
        <div className="mb-6 grid grid-cols-2 gap-px border border-border bg-border lg:grid-cols-4">
          {numeros.map(([k, v]) => (
            <div key={k} className="bg-card px-4 py-4">
              <p className="font-mono text-xl font-semibold">{v}</p>
              <p className="text-xs text-muted-foreground">{k}</p>
            </div>
          ))}
        </div>
      )}

      {data && data.payroll.folhas === 0 && (
        <p className="mb-6 border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
          Nenhuma folha calculada em {competenceLabel(data.competence)}. Comece pelos funcionários e pela jornada.
        </p>
      )}

      {data && (
        <p className="mb-6 text-xs text-muted-foreground">
          Leitura feita no servidor às {new Date(data.read_at).toLocaleTimeString('pt-BR')}. Este painel não grava nada: aprovação, fechamento e pagamento seguem bloqueados.
        </p>
      )}

      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <h2 className="text-sm font-semibold">Módulos preservados nesta versão</h2>
        <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">bloqueados no servidor</span>
      </div>
      <div className="grid gap-px border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
        {MODULES.map((m) => (
          <div key={m.path} className="relative bg-card p-6 opacity-60">
            <div className="mb-8 flex items-center justify-between">
              <m.icon className="h-6 w-6 text-muted-foreground" strokeWidth={1.5} />
              <span className="font-mono text-xs text-muted-foreground">[{m.code}]</span>
            </div>
            <h2 className="font-semibold">{m.title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{m.desc}</p>
            <p className="mt-3 font-mono text-[10px] uppercase tracking-wide text-destructive">indisponível nesta versão</p>
          </div>
        ))}
      </div>
    </div>
  );
}