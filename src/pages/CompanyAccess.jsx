import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import PageHeader from '@/components/PageHeader';
import CompanyAccessCard from '@/components/access/CompanyAccessCard';
import { useSession } from '@/lib/SessionContext';
import { formatCpf } from '@/lib/format';

const EXPIRED = ['sessao_invalida', 'sessao_expirada', 'conta_desligada'];
const MESSAGES = {
  sem_permissao: 'Somente o titular registrado ou um administrador desta empresa pode autorizar.',
  gestor_invalido: 'O CPF informado não pertence a uma conta mestre ativa.',
  autoconcessao: 'Informe o CPF de outra conta: você não pode conceder a si mesmo.',
  cpf_invalido: 'Informe um CPF com 11 dígitos.',
  empresa_inexistente: 'Empresa não encontrada.',
};

export default function CompanyAccess() {
  const { session, logout } = useSession();
  const navigate = useNavigate();
  const [companies, setCompanies] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');
  const request = useRef(0);

  const load = async () => {
    const current = ++request.current;
    try {
      const res = await base44.functions.invoke('companyAccess', { action: 'list', token: session?.token });
      if (current !== request.current) return;
      if (!res.data?.ok) throw new Error(res.data?.error || 'falha');
      setCompanies(res.data.companies || []);
    } catch (err) {
      if (current !== request.current) return;
      const code = err?.data?.error ?? err?.response?.data?.error;
      if (EXPIRED.includes(code) || !session?.token) {
        logout('expired');
        navigate('/login?expired=1', { replace: true });
        return;
      }
      setCompanies([]);
      setError('Não foi possível carregar as empresas sob sua responsabilidade.');
    }
  };

  useEffect(() => { load(); }, [session?.token]);

  const act = async (company, action, cpf) => {
    if (busy) return;
    const verb = action === 'grant' ? 'Autorizar' : 'Revogar';
    if (!window.confirm(`${verb} a gestão de “${company.name}” para ${formatCpf(cpf)}? A operação fica registrada com o seu CPF e a data.`)) return;
    setBusy(company.id);
    setNotice('');
    setError('');
    try {
      const res = await base44.functions.invoke('companyAccess', {
        action, token: session.token, company_id: company.id, manager_cpf: cpf,
      });
      if (!res.data?.ok) throw new Error('falha');
      setNotice(action === 'grant' ? 'Autorização registrada.' : 'Autorização revogada.');
      await load();
    } catch (err) {
      const code = err?.data?.error ?? err?.response?.data?.error;
      if (EXPIRED.includes(code)) {
        logout('expired');
        navigate('/login?expired=1', { replace: true });
        return;
      }
      setError(MESSAGES[code] || 'Não foi possível concluir a operação.');
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        code="ACESSO"
        title="Autorizar gestão"
        description="Autorize outra conta a administrar uma empresa em que você é o titular registrado ou administrador. Cada concessão fica registrada com o CPF de quem autorizou, para quem e quando."
      />
      {notice && <p role="status" className="text-sm text-emerald-700">{notice}</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {companies === null && <p className="text-sm text-muted-foreground">Carregando…</p>}
      {companies?.length === 0 && !error && (
        <p className="border border-border bg-card px-4 py-6 text-sm text-muted-foreground">
          Nenhuma empresa sob sua responsabilidade. Só o titular registrado ou um administrador da empresa pode autorizar.
        </p>
      )}
      {companies?.map((company) => (
        <CompanyAccessCard key={company.id} company={company} busy={busy === company.id} onAct={act} />
      ))}
    </div>
  );
}
