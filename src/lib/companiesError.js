// Mostra apenas códigos de erro conhecidos, nunca URLs internas, corpo bruto,
// dados pessoais ou tokens que possam acompanhar erros da API.
const CODES = new Set([
  'sessao_invalida', 'sessao_expirada', 'conta_desligada', 'somente_mestre',
  'sem_permissao', 'falha_servidor', 'funcao_inexistente',
]);

export function describeCompaniesError(err) {
  const code = err?.response?.data?.error ?? err?.data?.error;
  const safeCode = typeof code === 'string' && CODES.has(code) ? code : '';
  const status = err?.response?.status ?? err?.status;
  const safeStatus = Number.isInteger(status) && status >= 400 && status <= 599 ? status : null;
  const details = safeCode ? `Código: ${safeCode}` : safeStatus ? `HTTP ${safeStatus}` : 'Sem código do servidor';
  if (safeCode === 'somente_mestre') return {
    message: 'O servidor não reconheceu esta sessão como conta mestre. Saia e entre novamente com a conta mestre.',
    details,
  };
  if (safeStatus === 403 || safeCode === 'sem_permissao') return {
    message: 'O servidor negou o acesso à lista de empresas. Faça um novo login com a conta mestre para renovar a sessão.',
    details,
  };
  if (safeStatus === 404 || safeCode === 'funcao_inexistente') return {
    message: 'A função listCompanies pode não estar publicada na versão ativa do Base44.',
    details,
  };
  if (safeStatus === 500 || safeStatus === 503 || safeCode === 'falha_servidor') return {
    message: 'A função listCompanies falhou no servidor. Confira a versão publicada e os logs do Base44.',
    details,
  };
  return {
    message: 'Não foi possível carregar a lista de empresas. Confira a conexão e tente novamente.',
    details,
  };
}
