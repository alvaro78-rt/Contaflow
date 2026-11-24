const MESSAGES = {
  competencia_aberta: 'A competência ainda não terminou. Selecione um mês encerrado.',
  competencia_invalida: 'Selecione uma competência válida.',
  conferencia_autorizada: 'A conferência já está autorizada. Revogue a autorização antes de alterar.',
  conferencia_duplicada: 'Existem conferências duplicadas para esta competência. Solicite revisão antes de continuar.',
  folha_existente: 'Já existe folha nesta competência. A conferência não pode ser alterada.',
  funcionario_inexistente: 'O funcionário não pertence à empresa em uso.',
  registro_alterado: 'Outro usuário alterou esta conferência. Atualize a consulta.',
  empresa_alterada: 'A empresa da sessão mudou. Abra novamente a empresa.',
  sessao_expirada: 'Sua sessão expirou. Saia e entre novamente com CPF e senha.',
  sem_permissao: 'Seu perfil não pode autorizar a conferência de frequência.',
  operacao_em_andamento: 'Outra operação deste funcionário está em andamento. Aguarde alguns minutos e tente novamente.',
  cadastro_incompleto: 'Confira os dados do funcionário antes de conferir a frequência.',
};

export function describeConferenceError(error) {
  const data = error?.response?.data ?? error?.data;
  const problems = data?.problems;
  if (Array.isArray(problems) && problems.length) return problems.join(' ');
  return MESSAGES[data?.error] ||
    'Não foi possível concluir a operação. Confira sua sessão e tente novamente.';
}
