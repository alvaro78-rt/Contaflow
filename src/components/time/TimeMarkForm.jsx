import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import Field from '@/components/Field';
import { KINDS } from '@/components/time/TimeTable';

export default function TimeMarkForm({ employeeId, existing, onSaved }) {
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [kind, setKind] = useState('entry');
  const { toast } = useToast();

  const save = async () => {
    if (existing.some((r) => r.date === date && r.kind === kind)) {
      toast({ title: 'Marcação já existe', description: 'Já há um registro desse tipo neste dia. Use a Correção de Ponto.', variant: 'destructive' });
      return;
    }
    await base44.entities.TimeRecord.create({ employee_id: employeeId, date, kind, original_time: time });
    toast({ title: 'Marcação registrada' });
    setTime('');
    onSaved();
  };

  return (
    <div className="grid gap-3 border border-border bg-card p-4 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
      <Field label="Data"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      <Field label="Tipo">
        <Select value={kind} onValueChange={setKind}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{KINDS.map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
        </Select>
      </Field>
      <Field label="Horário"><Input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></Field>
      <Button variant="outline" disabled={!date || !time} onClick={save}>Simular leitura biométrica</Button>
    </div>
  );
}