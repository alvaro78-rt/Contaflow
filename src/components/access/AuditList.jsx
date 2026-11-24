import { formatCpf } from '@/lib/format';

const LABEL = { grant: 'Autorizou', revoke: 'Revogou' };
const SOURCE = { titular: 'titular registrado', administrador_da_empresa: 'administrador da empresa' };

export default function AuditList({ audit = [] }) {
  if (!audit.length) return null;
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Histórico de autorizações</p>
      <ul className="space-y-1">
        {audit.map((entry, index) => (
          <li key={`${entry.at}-${index}`} className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{LABEL[entry.action] || entry.action}</span>{' '}
            gestão para <span className="font-mono">{formatCpf(entry.cpf)}</span> · por{' '}
            <span className="font-mono">{formatCpf(entry.by_cpf)}</span>
            {entry.source ? ` (${SOURCE[entry.source] || entry.source})` : ''} ·{' '}
            {entry.at ? new Date(entry.at).toLocaleString('pt-BR') : ''}
          </li>
        ))}
      </ul>
    </div>
  );
}
