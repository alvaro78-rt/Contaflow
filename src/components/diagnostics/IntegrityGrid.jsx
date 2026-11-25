const LABELS = [
  ['companies', 'Empresas'],
  ['employees', 'Funcionários'],
  ['payrolls', 'Folhas'],
  ['time_records', 'Marcações'],
  ['vacations', 'Férias'],
  ['thirteenth', '13º salário'],
  ['terminations', 'Rescisões'],
  ['rubrics', 'Rubricas'],
  ['positions', 'Cargos'],
  ['schedules', 'Jornadas'],
  ['legal_tables', 'Tabelas legais'],
  ['auth_sessions', 'Sessões'],
];

export default function IntegrityGrid({ integrity }) {
  return (
    <section className="border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <h2 className="font-semibold">Integridade da base</h2>
      </div>
      <ul className="grid grid-cols-2 gap-px bg-border sm:grid-cols-3 lg:grid-cols-4">
        {LABELS.map(([key, label]) => (
          <li key={key} className="bg-card px-4 py-3">
            <p className="font-mono text-lg font-semibold">{integrity?.[key] ?? '—'}</p>
            <p className="text-xs text-muted-foreground">{label}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
