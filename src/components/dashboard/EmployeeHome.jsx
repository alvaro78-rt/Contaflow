import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useSession } from '@/lib/SessionContext';
import { competenceLabel, money } from '@/lib/format';

const SESSION_ERRORS = ['sessao_invalida', 'sessao_expirada', 'conta_desligada'];

// Área do funcionário: apenas os próprios dados, lidos no servidor pela sessão.
export default function EmployeeHome({ session }) {
  const { logout } = useSession();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const res = await base44.functions.invoke('employeePortal', { token: session?.token });
        if (!res.data?.ok) throw new Error('falha');
        if (ativo) setData(res.data);
      } catch (err) {
        const code = err?.data?.error ?? err?.response?.data?.error;
        if (SESSION_ERRORS.includes(code)) {
          logout('expired');
          navigate('/login?expired=1', { replace: true });
          return;
        }
        if (ativo) setError('Não foi possível carregar seus dados agora.');
      } finally {
        if (ativo) setLoading(false);
      }
    })();
    return () => { ativo = false; };
  }, [session?.token, logout, navigate]);

  const folha = data?.payrolls?.[0];
  const registros = data?.time?.records?.length || 0;

  return (
    <div>
      <div className="mb-10 border-b border-border pb-8">
        <p className="mb-3 font-mono text-xs text-emerald-700">[ÁREA DO FUNCIONÁRIO]</p>
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
          Olá, {data?.employee?.full_name?.split(' ')[0] || session?.name?.split(' ')[0]}.
        </h1>
        <p className="mt-2 text-muted-foreground">
          {data?.employee?.company_name ? `${data.employee.company_name} · ` : ''}
          você vê aqui apenas os seus próprios dados.
        </p>
      </div>

      <div className="mb-6 flex flex-wrap gap-3">
        <Link className="border border-border bg-card px-4 py-2 text-sm hover:bg-accent" to="/ponto">Bater meu ponto</Link>
        <Link className="border border-border bg-card px-4 py-2 text-sm hover:bg-accent" to="/contracheques">Meu contracheque</Link>
      </div>

      {loading && <p className="text-sm text-muted-foreground">Carregando seus dados…</p>}
      {error && <p className="border border-destructive bg-red-50 px-3 py-2 text-sm text-destructive">{error}</p>}

      {data && (
        <div className="grid gap-px border border-border bg-border sm:grid-cols-2">
          <div className="bg-card p-6">
            <p className="mb-4 font-mono text-[11px] uppercase tracking-wide text-muted-foreground">Contracheque</p>
            {folha ? (
              <>
                <p className="text-sm text-muted-foreground">Competência {competenceLabel(folha.competence)}</p>
                <p className="mt-2 font-mono text-2xl font-semibold">{money(folha.net_salary)}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Proventos {money(folha.total_earnings)} · Descontos {money(folha.total_deductions)} · {folha.status}
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Nenhum contracheque finalizado disponível para sua conta ainda.</p>
            )}
          </div>
          <div className="bg-card p-6">
            <p className="mb-4 font-mono text-[11px] uppercase tracking-wide text-muted-foreground">Ponto</p>
            <p className="font-mono text-2xl font-semibold">{registros}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              marcações em {competenceLabel(data.competence)}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}