// Nao expoe tokens nem respostas brutas do servidor no painel.
const KNOWN_ERRORS = new Set([
  'sem_empresa', 'somente_mestre', 'sem_permissao', 'empresa_nao_encontrada',
  'empresa_inativa', 'acesso_encerrado', 'funcao_inexistente', 'falha_servidor',
  'sessao_invalida', 'sessao_expirada', 'conta_desligada',
]);

export function describeDashboardError(error, response) {
  const rawCode = response?.data?.error ?? error?.response?.data?.error ?? error?.data?.error ?? error?.code;
  const code = typeof rawCode === 'string' && KNOWN_ERRORS.has(rawCode) ? rawCode : '';
  const rawStatus = error?.response?.status ?? response?.status ?? error?.status;
  const status = Number.isInteger(rawStatus) && rawStatus >= 400 && rawStatus <= 599 ? rawStatus : null;
  const details = code ? `Código: ${code}` : status ? `HTTP ${status}` : 'Sem código do servidor';

  if (code === 'sem_empresa' || code === 'empresa_nao_encontrada' || code === 'empresa_inativa') {
    return { message: 'A empresa não está selecionada ou não está disponível nesta sessão. Confira a lista de empresas antes de tentar novamente.', details, chooseCompany: true };
  }
  if (code === 'sem_permissao' || code === 'somente_mestre') {
    return { message: 'Esta conta não tem permissão para ler o painel administrativo. Confira o perfil de acesso.', details, chooseCompany: false };
  }
  if (code === 'falha_servidor' || status === 500 || status === 503) {
    return { message: 'O backend do ContaFlow falhou ao consultar a empresa. Tente novamente e consulte os logs da função companyDashboard no Base44.', details, chooseCompany: false };
  }
  if (status === 404 || code === 'funcao_inexistente') {
    return { message: 'A função companyDashboard não foi encontrada na versão publicada do Base44.', details, chooseCompany: false };
  }
  if (status === 403) {
    return { message: 'O servidor negou o acesso ao painel. Confira a empresa selecionada e as permissões.', details, chooseCompany: true };
  }
  return {
    message: 'Não foi possível consultar o servidor do ContaFlow. Verifique a conexão e tente novamente; não serão mostrados valores inventados.',
    details,
    chooseCompany: false,
  };
}
