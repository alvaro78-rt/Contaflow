import { base44 } from '@/api/base44Client';

const messages = {
  tabela_invalida: 'Confira vigência, faixas oficiais, deduções e parâmetros da tabela de 2026.',
  historico_sem_empresa: 'O RH precisa conciliar um registro antigo sem vínculo de empresa.',
  beneficio_existente: 'Já existe registro para esta referência.',
  pagamento_invalido: 'Confira o status, os valores do recibo e a data efetiva do pagamento.',
  folha_existente: 'Já existe folha nesta competência. As marcações que lhe deram origem estão protegidas.',
  sequencia_invalida: 'Confira a ordem dos horários do dia.',
  marcacao_duplicada: 'Esta marcação já existe.',
  registro_alterado: 'Outro usuário alterou o registro. Atualize a consulta.',
  empresa_alterada: 'A empresa da sessão mudou. Abra novamente a empresa.',
  operacao_em_andamento: 'Há uma operação em andamento para este funcionário. Atualize a consulta.',
  rubrica_invalida:
    'Confira a categoria, o nome e o valor da rubrica. Rubricas redutoras exigem apuração individual.',
  sem_permissao: 'Seu perfil não tem acesso a esta operação.',
};

export async function rh(session, action, params = {}) {
  try {
    const { data } = await base44.functions.invoke('rhService', {
      ...params,
      action,
      token: session.token,
      expected_company_id: session.company_id,
    });
    if (!data?.ok) throw new Error('Resposta inválida do servidor.');
    return data;
  } catch (error) {
    const code = error?.data?.error || error?.response?.data?.error;
    throw new Error(
      (error?.data || error?.response?.data)?.problems?.join(' ') || messages[code] ||
        'Não foi possível concluir a operação. Atualize a consulta e confira sua sessão.',
    );
  }
}
