import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useSession } from '@/lib/SessionContext';
import PageHeader from '@/components/PageHeader';
import DiagnosticsHeader from '@/components/diagnostics/DiagnosticsHeader';
import IntegrityGrid from '@/components/diagnostics/IntegrityGrid';
import OrphanReconciliation from '@/components/diagnostics/OrphanReconciliation';
import PendingCompanies from '@/components/diagnostics/PendingCompanies';

const MESSAGES = {
  sem_permissao: 'Seu perfil não tem acesso ao diagnóstico.',
  sessao_expirada: 'Sua sessão expirou. Entre novamente.',
  sessao_invalida: 'Sua sessão não é válida. Entre novamente.',
};

// Consulta somente leitura: versão real do backend e reconciliação dos registros
// órfãos de ponto. Nenhum dado é criado, alterado ou excluído por esta tela.
export default function Diagnostics() {
  const { session } = useSession();
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { data } = await base44.functions.invoke('diagnostics', { token: session?.token });
        if (!data?.ok) throw new Error(MESSAGES[data?.error] || 'Não foi possível consultar o diagnóstico.');
        if (active) setReport(data);
      } catch (err) {
        const code = err?.data?.error || err?.response?.data?.error;
        if (active) setError(MESSAGES[code] || err.message || 'Não foi possível consultar o diagnóstico.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [session?.token]);

  return (
    <div className="max-w-5xl space-y-5">
      <PageHeader
        code="RF21"
        title="Diagnóstico do sistema"
        description="Consulta somente leitura da versão publicada do backend e da reconciliação dos registros históricos de ponto."
      />
      {loading && <p className="text-sm text-muted-foreground">Consultando o backend…</p>}
      {!loading && error && <p role="alert" className="border border-destructive bg-red-50 px-4 py-3 text-sm text-destructive">{error}</p>}
      {!loading && report && (
        <>
          <DiagnosticsHeader report={report} />
          <IntegrityGrid integrity={report.integrity} />
          <OrphanReconciliation
            timeRecords={report.time_records}
            orphans={report.orphan_employees}
            orphanPayrolls={report.orphan_payrolls}
          />
          <PendingCompanies companies={report.pending_companies} total={report.pending_companies_total} />
          <p className="text-xs text-muted-foreground">
            Esta tela não altera registros. Exclusão, mesclagem ou reatribuição de marcações exige autorização específica.
          </p>
        </>
      )}
    </div>
  );
}
