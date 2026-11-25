import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import Field from '@/components/Field';
import ConferenceDayRow from '@/components/attendance/ConferenceDayRow';
import EvidencePicker from '@/components/attendance/EvidencePicker';

export default function ConferenceForm({
  data, days, basis, onBasis, evidence, onEvidence, disabled, busy, canAuthorize,
  confirmed, onConfirmed, onChangeDay, onUploadDay, onUploadGeneral, onSave, onAuthorize,
}) {
  const presumed = days.filter((day) => day.editable).length;
  return (
    <div className="space-y-4">
      <div className="border border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Apuração automática · {data.competence}
          </p>
          <p className="text-xs text-muted-foreground">
            {days.length} dia(s) · {presumed} dia(s) sem marcação para conferir
          </p>
        </div>
        {days.length === 0 && (
          <p className="px-4 py-3 text-sm text-muted-foreground">Nenhum dia de jornada nesta competência.</p>
        )}
        {days.map((day) => (
          <ConferenceDayRow
            key={day.date}
            day={day}
            situations={data.situations}
            disabled={disabled}
            employeeId={data.employee.id}
            onChange={(patch) => onChangeDay(day.date, patch)}
            onUpload={(file) => onUploadDay(day.date, file)}
          />
        ))}
      </div>
      <Field label="Fundamentação da apuração (obrigatória para autorizar)">
        <Textarea
          value={basis}
          onChange={(event) => onBasis(event.target.value)}
          rows={3}
          disabled={disabled}
          placeholder="Ex.: frequência apurada pelas marcações do ponto; ausências sem justificativa confirmadas pelo RH."
        />
      </Field>
      <div className="space-y-1.5">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Documento geral da conferência (opcional)
        </p>
        <EvidencePicker
          uri={evidence.uri}
          name={evidence.name}
          disabled={disabled}
          onUpload={onUploadGeneral}
          onClear={() => onEvidence({ uri: '', name: '' })}
        />
      </div>
      {!disabled && (
        <label className="flex items-start gap-2 text-sm">
          <Checkbox checked={confirmed} onCheckedChange={(value) => onConfirmed(value === true)} />
          <span>
            Confirmo a apuração automática do período e que as justificativas e evidências anexadas
            comprovam as ausências abonadas.
          </span>
        </label>
      )}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={disabled || busy} onClick={onSave}>
          {busy ? 'Salvando…' : 'Salvar rascunho'}
        </Button>
        {canAuthorize && (
          <Button disabled={disabled || busy || !confirmed} onClick={onAuthorize}>
            {busy ? 'Autorizando…' : 'Autorizar conferência'}
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Dias sem marcação precisam de conferência individual. O desconto só entra na folha oficial após
        a confirmação da falta injustificada e a autorização da competência. Corrija as marcações
        incompletas antes de autorizar.
      </p>
    </div>
  );
}