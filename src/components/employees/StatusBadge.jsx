
export const STATUS_TEXT = {
  ativo: 'Ativo',
  inativo: 'Inativo',
  afastado: 'Afastado',
  desligado: 'Desligado',
};

const STYLES = {
  ativo:
    'border-emerald-600 bg-emerald-50 text-emerald-700',

  inativo:
    'border-gray-400 bg-gray-100 text-gray-700',

  afastado:
    'border-amber-500 bg-amber-50 text-amber-800',

  desligado:
    'border-red-400 bg-red-50 text-red-700',
};

export default function StatusBadge({ status }) {
  const currentStatus = status || 'ativo';

  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-sm border px-2 py-1 text-xs font-medium ${
        STYLES[currentStatus] || STYLES.inativo
      }`}
    >
      {STATUS_TEXT[currentStatus] || currentStatus}
    </span>
  );
}
