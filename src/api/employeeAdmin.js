
import { base44 } from '@/api/base44Client';

const MESSAGES = {

  acao_invalida:
    'A função publicada não reconheceu a operação de cadastro.',

  dados_invalidos:
    'Confira os dados informados e tente novamente.',

  campos_obrigatorios:
    'Ainda existem campos obrigatórios não preenchidos. Verifique as informações e tente novamente.',

  cpf_invalido:
    'CPF inválido. Confira os dígitos verificadores.',

  cpf_duplicado:
    'Já existe um cadastro com este CPF nesta empresa.',

  cpf_ja_tem_acesso:
    'Este CPF já tem acesso criado. Cada CPF é uma única conta.',

  cpf_exige_senha:
    'Defina uma nova senha para alterar o CPF desta conta.',

  senha_invalida:
    'A senha deve ter entre 6 e 128 caracteres.',

  nome_invalido:
    'Confira o nome informado.',

  usuario_duplicado:
    'Este nome de usuário já está em uso.',

  sem_permissao:
    'Seu perfil não pode fazer esta operação nesta empresa.',

  perfil_protegido:
    'Seu perfil não permite esta alteração de acesso.',

  empresa_alterada:
    'A empresa aberta mudou. Volte ao painel e selecione a empresa novamente.',

  sem_empresa:
    'Nenhuma empresa está aberta na sua sessão.',

  sessao_expirada:
    'Sessão expirada. Entre novamente.',

  sessao_invalida:
    'Sessão inválida. Entre novamente.',

  conta_desligada:
    'Esta conta está desligada.',

  funcionario_inexistente:
    'Funcionário não encontrado nesta empresa.',

  funcionario_desligado:
    'Este funcionário está desligado.',

  exclusao_bloqueada:
    'Este cadastro tem acesso protegido e não pode ser excluído por aqui.',

  funcionario_com_historico:
    'Já existem registros para este funcionário. Altere a situação para desligado para preservar o histórico.',

  contrato_incompleto:
    'Confira a admissão, o cargo, a jornada e o salário-base.',

  contrato_invalido:
    'Selecione um cargo e uma jornada desta empresa.',

  cargo_duplicado:
    'Já existe um cargo cadastrado com este código.',

  cargo_invalido:
    'Confira o código e o nome do cargo.',

  cargo_com_funcionarios:
    'Não é possível excluir este cargo porque existem funcionários vinculados. Altere o cargo desses funcionários antes de excluir.',

  registro_inexistente:
    'O registro solicitado não foi encontrado nesta empresa.',

  vinculo_nao_confirmado:
    'Não foi possível confirmar o vínculo do funcionário com o cargo.',

  jornada_invalida:
    'Confira a carga horária, os dias, os horários e o intervalo.',

  data_invalida:
    'Confira as datas informadas.',

  pis_invalido:
    'O PIS deve ter 11 dígitos.',

  funcao_indisponivel:
    'Esta função do servidor ainda não está disponível na versão publicada.',

  falha_servidor:
    'Não foi possível concluir a operação. Tente novamente.',

};

export const SESSION_ERRORS = [

  'sessao_invalida',
  'sessao_expirada',
  'conta_desligada',

];

export const employeeError = (
  error,
  fallback
) => MESSAGES[error?.code] || fallback;

async function invoke(name, token, params) {

  let data;

  try {

    const response =
      await base44.functions.invoke(name, {
        ...params,
        token,
      });

    data = response.data;

  } catch (error) {

    const status =
      error.response?.status ??
      error.status;

    data =
      error.response?.data ??
      error.data;

    const code =

      typeof data?.error === 'string' &&
      Object.prototype.hasOwnProperty.call(
        MESSAGES,
        data.error
      )

        ? data.error
        : undefined;

    throw Object.assign(

      new Error(
        'Falha no serviço do ContaFlow.'
      ),

      {
        code:
          code ??
          (
            status === 404
              ? 'funcao_indisponivel'
              : undefined
          ),
      }

    );
  }

  if (!data?.ok) {

    throw Object.assign(

      new Error(
        'Resposta inválida do serviço do ContaFlow.'
      ),

      {
        code: data?.error,
      }

    );
  }

  return data;
}

export const searchEmployees = (
  token,
  params = {}
) => invoke(
  'listEmployees',
  token,
  params
);

export const getEmployee = (
  token,
  id
) => invoke(
  'listEmployees',
  token,
  { id }
);

export const saveEmployee = (
  token,
  params
) => invoke(
  'createEmployeeAccess',
  token,
  params
);

export const employeeCatalog = (
  token,
  params = {}
) => invoke(
  'employeeCatalog',
  token,
  params
);
