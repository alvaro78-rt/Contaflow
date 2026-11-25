import { useCallback, useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useSession } from '@/lib/SessionContext';
import { describeConferenceError } from '@/lib/conferenceError';

const FEEDBACK = {
  save: 'Rascunho salvo. A folha continua bloqueada até a autorização.',
  authorize: 'Conferência autorizada. A folha real desta competência já pode ser processada.',
  revoke: 'Autorização revogada. A conferência voltou para rascunho.',
};

export default function useConference(emp, comp) {
  const { session } = useSession();
  const [data, setData] = useState(null);
  const [days, setDays] = useState([]);
  const [basis, setBasis] = useState('');
  const [evidence, setEvidence] = useState({ uri: '', name: '' });
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const token = session?.token;
  const companyId = session?.company_id;
  const employeeId = emp?.id;

  const invoke = useCallback(async (action, extra = {}) => {
    const { data: response } = await base44.functions.invoke('attendanceConference', {
      action,
      token,
      expected_company_id: companyId,
      employee_id: employeeId,
      competence: comp,
      ...extra,
    });
    if (!response?.ok) throw new Error('resposta_invalida');
    return response;
  }, [token, companyId, employeeId, comp]);

  const apply = useCallback((response) => {
    setData(response);
    setDays(response.days || []);
    setBasis(response.conference?.basis || '');
    setEvidence({
      uri: response.conference?.evidence_uri || '',
      name: response.conference?.evidence_name || '',
    });
  }, []);

  const load = useCallback(async () => {
    if (!employeeId || !comp || !token) return;
    setLoading(true);
    setError('');
    try {
      apply(await invoke('view'));
    } catch (failure) {
      setData(null);
      setError(describeConferenceError(failure));
    } finally {
      setLoading(false);
    }
  }, [employeeId, comp, token, invoke, apply]);

  useEffect(() => { load(); }, [load]);

  const run = async (action) => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      // Apenas as decisões do RH são gravadas: a apuração do mês é automática.
      const decisions = days
        .filter((day) => day.situation)
        .map((day) => ({
          date: day.date,
          situation: day.situation,
          justification: day.justification || '',
          evidence_uri: day.evidence_uri || '',
          evidence_name: day.evidence_name || '',
        }));
      await invoke(action, {
        days: decisions,
        basis,
        evidence_uri: evidence.uri,
        evidence_name: evidence.name,
      });
      apply(await invoke('view'));
      setMessage(FEEDBACK[action] || '');
    } catch (failure) {
      setError(describeConferenceError(failure));
    } finally {
      setBusy(false);
    }
  };

  const setDay = (date, patch) =>
    setDays((current) => current.map((day) => (day.date === date ? { ...day, ...patch } : day)));

  return {
    data,
    days,
    basis,
    setBasis,
    evidence,
    setEvidence,
    loading,
    busy,
    error,
    message,
    setDay,
    save: () => run('save'),
    authorize: () => run('authorize'),
    revoke: () => run('revoke'),
  };
}
