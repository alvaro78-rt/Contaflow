export default function DiagnosticsHeader({ report }) {
  const checkedAt = report?.checked_at ? new Date(report.checked_at).toLocaleString('pt-BR') : '—';
  return (
    <section className="border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <h2 className="font-semibold">Versão e sessão</h2>
        <span className="border border-emerald-600/30 bg-emerald-50 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-emerald-700">
          somente leitura
        </span>
      </div>
      <dl className="grid gap-4 p-4 sm:grid-cols-2">
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Versão do backend que respondeu</dt>
          <dd className="mt-1 break-all font-mono text-sm">{report?.release || '—'}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Ambiente consultado</dt>
          <dd className="mt-1 break-all font-mono text-sm">{report?.environment?.host || '—'}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Consultado em</dt>
          <dd className="mt-1 font-mono text-sm">{checkedAt}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Sessão</dt>
          <dd className="mt-1 text-sm">{report?.session?.name || '—'} · {report?.session?.role || '—'}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Escopo</dt>
          <dd className="mt-1 text-sm">
            {report?.session?.scope === 'empresas_com_vinculo' ? 'Empresas com vínculo confirmado' : 'Empresa da sessão'}
          </dd>
        </div>
      </dl>
      {report?.truncated && (
        <p className="border-t border-border px-4 py-2 text-xs text-destructive">
          A base excede o limite de leitura desta consulta; os totais são parciais.
        </p>
      )}
    </section>
  );
}
