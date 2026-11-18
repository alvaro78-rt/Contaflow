import { useCallback, useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useSession } from '@/lib/SessionContext';
import { Button } from '@/components/ui/button';
import PageHeader from '@/components/PageHeader';

const LABELS = { entry: 'Entrada', break_start: 'Início do intervalo', break_end: 'Fim do intervalo', exit: 'Saída' };
const NEXT = { '': ['entry'], entry: ['break_start', 'exit'], break_start: ['break_end'], break_end: ['exit'], exit: [] };

export default function EmployeeTimeClock() {
  const { session } = useSession();
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const refresh = useCallback(async () => {
    try {
      const result = await base44.functions.invoke('employeePortal', { token: session?.token });
      if (!result.data?.ok) throw new Error('falha');
      setData(result.data);
    } catch {
      setError('Não foi possível consultar as marcações. Confira sua conexão.');
    }
  }, [session?.token]);

  useEffect(() => { refresh(); }, [refresh]);

  const records = (data?.time?.records || []).slice().sort((a, b) =>
    a.date.localeCompare(b.date) || a.original_time.localeCompare(b.original_time));
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Recife', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  // Compare by kind rather than trusting browser clock for the actual persisted timestamp.
  const todays = records.filter(r => r.date === today);
  const orderedKinds = ['entry', 'break_start', 'break_end', 'exit'];
  const last = todays.length ? orderedKinds[Math.max(...todays.map(r => orderedKinds.indexOf(r.kind)))] : '';
  const choices = NEXT[last] || [];

  async function mark(kind) {
    if (busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await base44.functions.invoke('employeePortal', { token: session?.token, action: 'clock', kind });
      if (!result.data?.ok) throw new Error('falha');
      setNotice(`${LABELS[kind]} registrada pelo servidor às ${result.data.record.original_time}.`);
      await refresh();
    } catch (err) {
      const code = err?.response?.data?.error ?? err?.data?.error;
      const errors = {
        marcacao_duplicada: 'Esta marcação já foi registrada hoje.',
        sequencia_invalida: 'A sequência de marcações não é válida. Atualize e confira seus registros.',
        ponto_requer_conferencia: 'Há marcações que precisam ser conferidas pelo RH.',
        sem_permissao: 'Seu perfil não pode registrar ponto nesta tela.',
      };
      setError(errors[code] || 'Não foi possível registrar o ponto. Confira a conexão e tente novamente.');
      await refresh();
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-6">
      <PageHeader code="RF07" title="Meu ponto" description="Registre entrada, intervalo e saída com o horário do servidor. O horário informado pelo dispositivo não altera a marcação." />
      <div className="space-y-3 border border-border bg-card p-5">
        <p className="text-xs text-muted-foreground">Fuso operacional: America/Recife. Horário oficial da marcação fornecido pelo servidor.</p>
        <div className="flex flex-wrap gap-2">
          {orderedKinds.map(kind => <Button key={kind} type="button" variant={choices.includes(kind) ? 'default' : 'outline'}
            disabled={busy || !data || !choices.includes(kind)} onClick={() => mark(kind)}>{LABELS[kind]}</Button>)}
        </div>
        {notice && <p role="status" className="text-sm text-emerald-700">{notice}</p>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <Button variant="outline" size="sm" onClick={refresh} disabled={busy}>Atualizar marcações</Button>
      </div>
      <section className="space-y-2">
        <h2 className="font-semibold">Minhas marcações deste mês</h2>
        {!data ? <p className="text-sm text-muted-foreground">Carregando registros…</p>
          : records.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma marcação registrada neste mês.</p>
          : <div className="divide-y divide-border border border-border bg-card">
            {records.map(r => <div key={r.id} className="flex flex-wrap justify-between gap-2 px-4 py-2 text-sm">
              <span>{r.date} · {LABELS[r.kind] || r.kind}</span><span className="font-mono">{r.corrected_time || r.original_time}</span>
            </div>)}
          </div>}
      </section>
    </div>
  );
}
