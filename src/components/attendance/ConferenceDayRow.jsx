import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import EvidencePicker from '@/components/attendance/EvidencePicker';
import { fmtDate, WEEKDAYS } from '@/lib/format';
import { fmtMin } from '@/lib/payroll';
import { KIND_LABEL, KIND_STYLE, SITUATION_LABEL } from '@/lib/attendanceLabels';

export default function ConferenceDayRow({ day, situations, disabled, employeeId, onChange, onUpload }) {
  const detail = [
    day.marks ? `${day.marks} marcação(ões)` : 'sem marcação',
    day.worked > 0 ? `${fmtMin(day.worked)}h` : '',
    day.late > 0 ? `atraso ${fmtMin(day.late)}` : '',
    day.overtime > 0 ? `extra ${fmtMin(day.overtime)}` : '',
  ].filter(Boolean).join(' · ');
  const editable = day.editable && !disabled;
  const needsDetail = Boolean(day.situation) && day.situation !== 'falta_injustificada';
  return (
    <div className="grid gap-2 border-b border-border/60 px-4 py-3 md:grid-cols-[110px_170px_minmax(0,1fr)] md:items-start">
      <div>
        <p className="font-mono text-sm">
          {fmtDate(day.date)}{' '}
          <span className="text-muted-foreground">
            {WEEKDAYS[new Date(`${day.date}T12:00:00`).getDay()]}
          </span>
        </p>
        <p className="text-[11px] text-muted-foreground">{detail}</p>
      </div>
      <div className="space-y-1">
        <Badge variant="outline" className={KIND_STYLE[day.kind]}>{KIND_LABEL[day.kind]}</Badge>
        {day.kind === 'pendencia' && (
          <Link
            className="block text-[11px] text-emerald-700 underline"
            to={`/correcao-ponto?employee=${employeeId}&date=${day.date}`}
          >
            Corrigir marcações
          </Link>
        )}
      </div>
      {editable ? (
        <div className="space-y-1.5">
          <Select
            value={day.situation || undefined}
            onValueChange={(value) => onChange({ situation: value })}
            disabled={disabled}
          >
            <SelectTrigger><SelectValue placeholder="Selecionar resultado da conferência" /></SelectTrigger>
            <SelectContent>
              {situations.map((item) => (
                <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {needsDetail && (
            <>
              <Input
                value={day.justification || ''}
                onChange={(event) => onChange({ justification: event.target.value })}
                placeholder="Justificativa (obrigatória, mínimo 10 caracteres)"
                disabled={disabled}
              />
              <EvidencePicker
                uri={day.evidence_uri}
                name={day.evidence_name}
                disabled={disabled}
                onUpload={onUpload}
                onClear={() => onChange({ evidence_uri: '', evidence_name: '' })}
              />
            </>
          )}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          {day.situation
            ? SITUATION_LABEL[day.situation]
            : day.editable
              ? 'Aguardando conferência.'
              : 'Classificado automaticamente pela jornada e pelas marcações.'}
        </p>
      )}
    </div>
  );
}