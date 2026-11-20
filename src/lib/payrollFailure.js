// O backend informa etapas predefinidas. Nunca exibir texto arbitrário ou
// informações financeiras no diagnóstico de erro de execução.
const MESSAGES = {
  requisicao: 'A solicitação não pôde ser interpretada pelo servidor.',
  autorizacao: 'Não foi possível confirmar a autorização e a sessão no servidor.',
  funcionario: 'Não foi possível consultar o cadastro do funcionário selecionado.',
  bloqueio_funcionario: 'O servidor não conseguiu garantir a exclusividade do processamento. Não repita para evitar duplicidade.',
  historico_folha: 'Não foi possível conferir se já existe uma folha desta competência. Consulte as folhas anteriores antes de qualquer nova tentativa.',
  consulta_folha: 'Não foi possível consultar as folhas já registradas. Confira o histórico antes de processar novamente.',
  historico_legado: 'Não foi possível conferir registros antigos sem empresa. O cálculo foi bloqueado.',
  consultas_competencia: 'Falha ao consultar ponto, rubricas, férias, rescisão ou parâmetros legais.',
  previa_calculo: 'Falha ao gerar a prévia de folha. Nenhuma prévia foi confirmada.',
  conferencia_ponto: 'Falha na conferência das marcações do período.',
  motor_calculo: 'Falha no motor de cálculo. Nenhuma folha nova foi confirmada.',
  gravacao_folha: 'O servidor não confirmou se a folha foi salva. Consulte as folhas anteriores antes de tentar novamente.',
  transicao_status: 'O servidor não confirmou a mudança de status. Verifique o histórico antes de repetir.',
};

export function describePayrollServerFailure(data, status) {
  if (data?.error !== 'falha_servidor' || status !== 500) return null;
  const stage = Object.hasOwn(MESSAGES, data.stage) ? data.stage : '';
  return {
    message: stage ? MESSAGES[stage] :
      'O backend retornou erro interno sem informar a etapa. É necessário conferir a versão publicada e os logs da função payrollService.',
    stage: stage || 'versao_sem_diagnostico',
    // Somente nomes de etapas conhecidos. Não repassar strings arbitrárias.
  };
}
