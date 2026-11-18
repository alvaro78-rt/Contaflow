export const STATUS_TEXT = { ativo: 'Ativo', afastado: 'Afastado', desligado: 'Desligado' };

const STYLES = {
  ativo: 'border-emerald-600 bg-accent text-accent-foreground',
  afastado: 'border-amber-500 bg-amber-50 text-amber-800',
  desligado: 'border-border bg-secondary text-muted-foreground',
};

export default function StatusBadge({ status }) {
  const s = status || 'ativo';
  return (
    <span className={`border px-1.5 py-0.5 text-[11px] ${STYLES[s] || STYLES.desligado}`}>
      {STATUS_TEXT[s] || s}
    </span>
  );
}