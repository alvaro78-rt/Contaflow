function OrphanCard({ row }) {
  const company = row.company
    ? `${row.company.name}${row.company.status ? ` · ${row.company.status}` : ''}`
    : 'empresa sem cadastro';
  return (
    <article className="border border-border bg-card">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-4 py-3">
        <p className="break-all font-mono text-xs">{row.employee_id}</p>
        <span className="border border-amber-600/30 bg-amber-50 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-amber-700">
          sem cadastro
        </span>
      </div>
      <dl className="grid gap-3 px-4 py-3 text-sm sm:grid-cols-2">
        <div><dt className="text-xs text-muted-foreground">Empresa</dt><dd>{company}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Período</dt><dd className="font-mono text-xs">{row.first_day} → {row.last_day}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Marcações / dias</dt><dd className="font-mono">{row.total} / {row.days}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Duplicidades (data + tipo)</dt><dd className="font-mono">{row.duplicate_keys}</dd></div>
        <div className="sm:col-span-2">
          <dt className="text-xs text-muted-foreground">Tipos</dt>
          <dd className="font-mono text-xs">
            {Object.entries(row.kinds || {}).map(([kind, total]) => `${kind}: ${total}`).join(' · ') || '—'}
          </dd>
        </div>
      </dl>
      <div className="border-t border-border px-4 py-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Evidência documentada nas folhas</p>
        {row.evidence?.length ? (
          <ul className="mt-2 space-y-1 text-sm">
            {row.evidence.map((item) => (
              <li key={`${item.competence}-${item.name}`}>
                <span className="font-mono text-xs">{item.competence}</span> · {item.name || 'nome não registrado'}
                {item.cpf ? ` · CPF ${item.cpf}` : ''}{item.position ? ` · ${item.position}` : ''}
                {item.status ? ` · ${item.status}` : ''}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">Nenhuma folha registrada para este identificador.</p>
        )}
      </div>
    </article>
  );
}

export default function OrphanReconciliation({ timeRecords, orphans, orphanPayrolls }) {
  return (
    <section className="space-y-4">
      <div className="border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <h2 className="font-semibold">Reconciliação das marcações</h2>
        </div>
        <dl className="grid gap-3 px-4 py-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div><dt className="text-xs text-muted-foreground">Marcações no escopo</dt><dd className="font-mono">{timeRecords?.total_scoped ?? '—'}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Com vínculo atual</dt><dd className="font-mono">{timeRecords?.linked_to_employee ?? '—'}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Órfãs</dt><dd className="font-mono">{timeRecords?.orphan ?? '—'}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Chaves duplicadas</dt><dd className="font-mono">{timeRecords?.duplicate_keys ?? '—'}</dd></div>
        </dl>
        <p className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
          A folha consulta as marcações por funcionário <em>e</em> empresa. Registros órfãos não entram em cálculo de
          funcionário atual.
        </p>
      </div>

      {orphans?.length ? orphans.map((row) => <OrphanCard key={row.employee_id} row={row} />) : (
        <p className="border border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
          Nenhuma marcação órfã no escopo consultado.
        </p>
      )}

      {orphanPayrolls?.length > 0 && (
        <div className="border border-border bg-card">
          <div className="border-b border-border px-4 py-3">
            <h2 className="font-semibold">Folhas de funcionários sem cadastro</h2>
          </div>
          <ul className="divide-y divide-border text-sm">
            {orphanPayrolls.map((row) => (
              <li key={`${row.employee_id}-${row.competence}`} className="flex flex-wrap justify-between gap-2 px-4 py-2">
                <span className="font-mono text-xs">{row.competence}</span>
                <span className="flex-1">{row.name || 'nome não registrado'}</span>
                <span className="font-mono text-xs text-muted-foreground">{row.status}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
