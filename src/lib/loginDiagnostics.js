// Erros mostrados no login nunca devem conter CPF, senha, token ou respostas brutas.
const KNOWN = new Set([
  'falha_servidor', 'auth_required', 'unauthorized', 'forbidden',
  'muitas_tentativas', 'credenciais', 'sem_acesso', 'cpf_duplicado',
  'conta_desligada', 'empresa_inativa', 'cpf_invalido',
  'credenciais_incompletas',
]);

export function describeLoginFailure(error) {
  const raw = error?.response?.data?.error ?? error?.data?.error;
  const code = typeof raw === 'string' && KNOWN.has(raw) ? raw : '';
  const rawStatus = error?.response?.status ?? error?.status;
  const status = Number.isInteger(rawStatus) && rawStatus >= 400 && rawStatus <= 599 ? rawStatus : null;
  const diagnostic = code ? `authCpf · Código: ${code}` : status ? `authCpf · HTTP ${status}` : 'authCpf · Sem código HTTP';

  if (code === 'falha_servidor' || status === 500 || status === 503) {
    return { message: 'O servidor de autenticação apresentou uma falha interna. Os dados de acesso não foram alterados.', diagnostic };
  }
  if (status === 403 || code === 'auth_required' || code === 'forbidden') {
    return { message: 'O Base44 negou a execução do login. É necessário conferir as permissões da função authCpf no backend.', diagnostic };
  }
  if (status === 404) {
    return { message: 'A função authCpf não foi encontrada na versão publicada do Base44.', diagnostic };
  }
  if (status === 429 || code === 'muitas_tentativas') {
    return { message: 'Muitas tentativas de acesso. Não repita o login até terminar o bloqueio temporário.', diagnostic };
  }
  return {
    message: 'Não foi possível verificar o acesso no servidor. Confira o código técnico abaixo antes de tentar novamente.',
    diagnostic,
  };
}
