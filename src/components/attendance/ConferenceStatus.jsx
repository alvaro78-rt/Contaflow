import { Button } from '@/components/ui/button';

const moment = (iso) => {
  const parsed = Date.parse(iso || '');
  return Number.isFinite(parsed) ? new Date(parsed).toLocaleString('pt-BR') : '';
};

export default function ConferenceStatus({ conference, canRevoke, busy, onRevoke }) {
  if (!conference) return null;
  const authorized = conference.status === 'autorizada';
  return (
    <div className={`space-y-1 border px-4 py-3 text-sm ${authorized ? 'border-emerald-600 bg-accent' : 'border-border bg-card'}`}>
      <p className="font-medium">
        {authorized ? 'Conferência autorizada' : 'Rascunho — folha bloqueada até a autorização'}
        {authorized && conference.authorized_by_name ? ` por ${conference.authorized_by_name}` : ''}
        {authorized && conference.authorized_at ? ` em ${moment(conference.authorized_at)}` : ''}
      </p>
      {conference.revoked_at && (
        <p className="text-xs text-muted-foreground">Autorização revogada em {moment(conference.revoked_at)}.</p>
      )}
      {conference.saved_at && (
        <p className="text-xs text-muted-foreground">Último salvamento em {moment(conference.saved_at)}.</p>
      )}
      {authorized && canRevoke && (
        <Button variant="outline" size="sm" className="mt-2" disabled={busy} onClick={onRevoke}>
          Revogar autorização
        </Button>
      )}
    </div>
  );
}
