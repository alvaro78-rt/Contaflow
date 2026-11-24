import { useState } from 'react';
import { rh } from '@/api/rh';
import { useSession } from '@/lib/SessionContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import Field from '@/components/Field';
import { KINDS } from '@/components/time/TimeTable';

export default function TimeMarkForm({ employeeId, existing, onSaved }) {
  const { session } = useSession();
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [kind, setKind] = useState('entry');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const { toast } = useToast();

  const save = async () => {
    if (!date || !time || !reason.trim() || busy) return;
    if (existing.some((r) => r.date === date && r.kind === kind)) {
      setError('Esta marcação já existe. Use Correção de Ponto para preservar o histórico.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      // A inclusão tem justificativa, validação de empresa e auditoria no backend.
      await rh(session, 'addMark', {
        employee_id: employeeId, date, time, kind, reason: reason.trim(),
      });
      toast({ title: 'Marcação comprovada registrada' });
      setTime('');
      setReason('');
      onSaved();
    } catch (err) {
      setError(err.message || 'Não foi possível registrar a marcação.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3 border border-border bg-card p-4">
      <p className="text-sm text-muted-foreground">Registre apenas horários comprovados. Esta operação não simula leitura biométrica; o RH identifica e justifica cada inclusão.</p>
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
        <Field label="Data"><Input type="date" value={date} disabled={busy} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Tipo">
          <Select value={kind} onValueChange={setKind} disabled={busy}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{KINDS.map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field label="Horário"><Input type="time" value={time} disabled={busy} onChange={(e) => setTime(e.target.value)} /></Field>
        <Button variant="outline" disabled={!date || !time || !reason.trim() || busy} onClick={save}>
          {busy ? 'Registrando…' : 'Registrar ponto comprovado'}
        </Button>
      </div>
      <Field label="Justificativa e origem da comprovação">
        <Textarea value={reason} disabled={busy} onChange={(e) => setReason(e.target.value)}
          placeholder="Ex.: conferido com registro de acesso ou folha de frequência assinada" rows={2} />
      </Field>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
