# ContaFlow · Revisão de backend de 18 de novembro de 2026

A revisão partiu da `main` em `ed4435c70f93276cebf6fd92d809920cf70fa846`. Os testes usaram duas empresas fictícias em memória. Nenhuma chamada de leitura, gravação ou publicação foi enviada ao aplicativo da Facet Soluções. A quantidade de funcionários e os saldos existentes em produção permanecem sem verificação independente.

## Problemas encontrados e correções

| Área | Situação encontrada no repositório | Correção e alcance |
|---|---|---|
| Ponto do funcionário | A tela só habilitava a marcação depois de carregar também dados de folha. As consultas mensais usavam dia 31 em todos os meses. Duas requisições podiam passar juntas pela checagem de duplicidade. | A tela consulta o ponto separadamente, usa a data do servidor em Recife e o último dia real do mês. O servidor valida sessão, vínculo, situação, sequência, duplicidade e competência. As gravações de ponto e folha do mesmo funcionário usam exclusão mútua no banco. |
| Conferência de ponto | A tela do RH lia e escrevia entidades diretamente. O bloqueio por folha finalizada e o histórico de correções eram montados no navegador. | Consulta por empresa e funcionário, inclusão manual identificada, motivo obrigatório e histórico com autor, hora anterior e horário do servidor. Edição desatualizada é recusada. A marcação original fica preservada. Qualquer folha já registrada protege os pontos utilizados naquela competência. |
| Folha mensal | A função aceitava um mês com apenas uma marcação, assumia faltas, escolhia a primeira tabela vigente e sobrescrevia rascunhos. A aprovação aceitava o nome digitado pelo cliente. | A competência deve estar encerrada. O RH informa dias abonados, faltas, dependentes fiscais, data de pagamento e reflexos de DSR. O servidor confere contrato, jornada, sequência diária, rubricas, eventos e tabela. Uma folha existente é recuperada com os valores gravados. Aprovação e finalização verificam situação, identidade do responsável, somas das verbas e líquido em centavos. |
| Tributos | Faltavam a redução do IRRF de 2026 e o truncamento por faixa do INSS. As bases ignoravam os descontos de faltas e atrasos. | A função compara os parâmetros com os valores oficiais de 2026, aplica o desconto de IRRF conforme o rendimento tributável e considera o pagamento. O INSS trunca cada faixa. Faltas, atrasos e perda de DSR reduzem a base remuneratória. As horas além do limite diário não são descartadas da apuração mensal. |
| Contracheques e histórico | Folhas anteriores dependiam de acesso direto a uma entidade bloqueada. Um recibo sem listas de verbas podia derrubar a tela. | O funcionário consulta apenas a própria folha finalizada. O RH pesquisa o histórico da empresa por nome, CPF e competência, com paginação e sem recalcular. Ausência de detalhamento gera aviso. Registros ambíguos ou antigos sem empresa recebem tratamento de conciliação nos fluxos individuais. |
| Rubricas e relatórios | Rubricas, relatórios e parâmetros eram lidos ou escritos diretamente pelo navegador. Uma rubrica redutora automática podia ficar sem efeito no cálculo. | O servidor valida categoria, valor, perfil e empresa. Para aplicação automática, o RH confirma provento com incidência integral ou desconto aplicado ao líquido. Redutoras sem regra de incidência ficam fora da aplicação automática. Relatórios de pagamento usam histórico paginado e recusam totalização incompleta. Tabelas legais globais só podem ser administradas pelo mestre. |
| Férias, 13º e rescisão | Os três módulos montavam valores no navegador e ofereciam exclusão do histórico. O 13º estimava metade como primeira parcela. A rescisão sugeria saldo de FGTS somando informações de folhas, com opção de desligar o cadastro em outra gravação. | O 13º anual usa remuneração com médias, avos conferidos, dependentes fiscais e adiantamento efetivamente pago. Férias e rescisão registram as verbas e totais de um recibo ou TRCT já conferido. O backend reconcilia os centavos, limita sobreposição de férias e recusa duplicação. O registro de rescisão preserva a situação cadastral. O pagamento de férias e 13º registra data e autor. |
| Senhas, perfis e isolamento | A troca de senha e a recuperação por CPF e nascimento tentavam ler dados pessoais e gravar hashes no cliente. As rotas administrativas incluíam funcionário. O painel possuía validação própria de sessão. | A troca exige senha atual no servidor, aceita hashes antigos e grava PBKDF2. A versão da credencial invalida sessões anteriores. A recuperação de senha de conta existente passa pelo RH. O primeiro acesso ao cadastro pré-existente continua em fluxo próprio. Funcionário usa ponto, contracheque e conta. Gerente mantém cadastro, consulta de ponto e cálculo. Aprovação e finalização exigem administrador ou mestre na empresa. |
| Proteção dos dados | As regras de criação e edição nas entidades de negócio dependiam de um endereço de e-mail reservado. | A definição do repositório exige simultaneamente dois perfis Base44 mutuamente exclusivos nas gravações diretas. As leituras e exclusões diretas continuam bloqueadas. As funções usam o vínculo da sessão CPF. Ainda é necessário validar a aplicação dessas regras pelo serviço hospedado. |

## Testes e verificações

| Verificação | Resultado |
|---|---|
| Instalação com o arquivo de dependências do repositório | `npm ci` concluiu. |
| Regressão nos handlers e no motor em Deno | 14 testes passaram. Casos incluem duplo clique, sequência impossível, correção concorrente, sessão expirada, empregado desligado, empresa inativa, isolamento, tabela divergente, competência incompleta, ausência classificada, horas extras, recibos, histórico legado, pagamento e troca de senha. Tentativas recusadas foram conferidas também quanto ao estado dos dados. |
| Valores de referência de 2026 | O teste verifica contribuição de R$ 988,07 sobre o teto de R$ 8.475,55 e cenários de IRRF de R$ 0,00, R$ 382,88 e R$ 1.016,27. Cada comparação usa os insumos do próprio cenário. |
| Interface React com DOM simulado | Nove verificações passaram ligando as telas aos handlers reais e o SDK a entidades em memória. Cobriram ponto, correção, cálculo com aprovação e finalização, consulta do recibo, histórico e abertura dos quatro módulos de rubricas e benefícios. O teste conferiu a exibição da ação de baixar PDF. A impressão e o download em navegador real continuam sem teste. |
| Estrutura Base44 | As 14 definições de entidade e as 14 definições de função foram validadas quanto a JSON, nomes e entrypoints. As regras de acesso foram verificadas estaticamente. |
| Qualidade e build | `npm run lint` e `npm run build` passaram. O build isolado usou identificação fictícia e endereço local. O Vite alertou para um pacote JavaScript acima de 500 kB. |
| Tipagem do projeto | `npm run typecheck` ainda falha. Havia 599 diagnósticos na base inicial. Restaram 189, incluindo componentes Radix, telas de cadastro, MFA e a tipagem do cliente Base44. |
| Diferenças Git | Verificação de espaços passou, respeitando o formato CRLF do script Windows. |

Para repetir os testes de backend com Deno e acesso ao registro de pacotes:

```sh
deno test --no-config --no-check --no-lock --node-modules-dir=none --import-map=tests/import-map.json tests/backend_test.js
```

O adaptador em `tests/memory-sdk.js` substitui apenas a camada de entidades. Nesta execução, as dependências criptográficas de produção foram carregadas localmente do pacote npm fixado pelo projeto. A opção `--no-check` executa os testes de comportamento. A tipagem do frontend foi medida separadamente.

## Publicação e preservação da Facet Soluções

A integração Vercel tinha registrado sucesso no commit inicial. O arquivo `vercel.json` desativa deploys Git automáticos da `main` até a homologação do backend. Essa configuração também se aplica aos próximos pushes enquanto permanecer na branch. O script Windows passou a incluir `payrollService` e `rhService`. Sua execução continua publicando o site e não faz parte dos testes.

1. Em ambiente de homologação, comparar as definições remotas com as locais. Os novos campos de sessão, trava de processamento, autoria e conferência são opcionais para os registros antigos. Aplicar as regras e campos revisados de maneira aditiva. O comando de sincronização integral de entidades pode remover definições remotas ausentes no checkout. Antes de qualquer sincronização integral é necessário reconciliar o inventário real.
2. Publicar as funções diretamente modificadas e recompilar as que embutem a guarda compartilhada de sessão. Usar a seguinte lista em homologação, depois de conferir o app de destino.

```sh
npx base44 functions deploy authCpf companyDashboard createEmployeeAccess employeeCatalog listEmployees employeePortal payrollService rhService createCompany enterCompany listCompanies manageCompany
```

3. Testar pela URL de homologação com dois vínculos fictícios em empresas distintas. Verificar regras de leitura e escrita direta no serviço hospedado, retorno de `updateMany`, troca de empresa do mestre, registros mais antigos, acesso do funcionário, consulta de competências finalizadas e o PDF no navegador. Conferir também a negativa de acesso cruzado.
4. Antes da publicação em produção, comparar a empresa Facet Soluções, os identificadores de vínculo, as contagens e os totais financeiros com um extrato ou cópia de segurança autorizada. Depois da homologação do backend, promover o frontend e decidir quando reativar o deploy automático da Vercel.

## Limitações com efeito operacional

- A folha automática cobre o cenário implementado de empregado CLT mensalista durante a competência integral, jornada diurna, vínculo único, tabela e pagamento validados para 2026. Exige classificação explícita de todos os dias de jornada. Trabalho em feriados, intervalo divergente, banco de horas, pensão, múltiplos vínculos, admissão parcial, férias e desligamento no mês exigem apuração específica. A convenção coletiva e os reflexos de DSR usados por cada empresa precisam ser conferidos pelo RH.
- Férias e rescisão aceitam a transcrição de documento contábil conferido. A conciliação aritmética e o vínculo ficam validados no servidor. O sistema não determina automaticamente todos os direitos, incidências, multas, projeções do aviso ou o valor oficial dos depósitos de FGTS. O valor líquido do 13º é anual. A informação de segunda parcela mostra o saldo após o adiantamento.
- Rascunhos e folhas aprovadas antigos sem a conferência de insumos são preservados e precisam de conciliação para avançar. Uma folha já gravada bloqueia alterações de ponto naquela competência. Retificação por lançamento compensatório e revisão contábil de históricos órfãos permanecem pendentes. O trabalho não atribuiu uma empresa a registros antigos por inferência.
- A trava por funcionário privilegia a integridade se o processo hospedado for interrompido. Uma interrupção entre adquirir e liberar `Employee.processing_lock` pode exigir que o suporte confirme o fim da operação e reconcilie ponto e folha antes de liberar a trava específica.
- As verificações locais não certificam o comportamento da base hospedada, a correção das declarações do RH nem conformidade de um registrador eletrônico de ponto. O teste de navegador Chromium no ambiente de execução foi impedido pela restrição de sockets. A alternativa executada foi a interface React em DOM simulado.
- Cópias de segurança, contagens da Facet Soluções, comparação pós-publicação e validação de tabelas em produção dependem de acesso ao ambiente correspondente. Nenhuma senha ou permissão de conta real foi alterada nesta revisão.

## Referências consultadas

- [INSS · Tabela de contribuição mensal de 2026](https://www.gov.br/inss/pt-br/direitos-e-deveres/inscricao-e-contribuicao/tabela-de-contribuicao-mensal)
- [Receita Federal · Tributação de 2026](https://www.gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda/tabelas/2026)
- [Receita Federal · Exemplos da redução de IRRF](https://www.gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda/tabelas/exemplos-de-aplicacao-da-lei-15-270-2025)
- [eSocial · Manual de Orientação, cálculo da contribuição por faixa](https://www.gov.br/esocial/pt-br/documentacao-tecnica/manuais/mos-s-1-3-consolidada-ate-a-no-s-1-3-07-2026.pdf)
- [CLT · Art. 58 e dispositivos sobre férias e rescisão](https://www.planalto.gov.br/ccivil_03/decreto-lei/del5452compilado.htm)
- [Ministério do Trabalho e Emprego · Direitos em modalidades de rescisão](https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/acoes-e-programas/programas-projetos-acoes-obras-e-atividades/proteja/duvidas-frequentes/perguntas-frequentes)
- [Base44 · Segurança das entidades](https://docs.base44.com/developers/backend/resources/entities/security)
- [Vercel · Configuração do deploy por branch](https://vercel.com/docs/project-configuration/git-configuration)

## Commits de implementação

- [8df3edf · Valida ponto, folha, benefícios e credenciais no servidor por empresa](https://github.com/alvaro78-rt/Contaflow/commit/8df3edf4d56b34791136f74dc5e106feeb793773)
- [2ee0177 · Conecta telas do funcionário e do RH aos serviços autenticados](https://github.com/alvaro78-rt/Contaflow/commit/2ee017768bb90a1658992e956406492a2caca1ae)

## Arquivos alterados

As duas implementações abrangem 69 arquivos. Este relatório é o arquivo adicional da entrega.

| Alteração | Caminho |
|---|---|
| Modificado | `Publicar-ContaFlow.cmd` |
| Modificado | `base44/entities/AuthSession.jsonc` |
| Modificado | `base44/entities/Company.jsonc` |
| Modificado | `base44/entities/Employee.jsonc` |
| Modificado | `base44/entities/LegalTable.jsonc` |
| Modificado | `base44/entities/MasterRecovery.jsonc` |
| Modificado | `base44/entities/Payroll.jsonc` |
| Modificado | `base44/entities/Position.jsonc` |
| Modificado | `base44/entities/Rubric.jsonc` |
| Modificado | `base44/entities/Termination.jsonc` |
| Modificado | `base44/entities/ThirteenthSalary.jsonc` |
| Modificado | `base44/entities/TimeRecord.jsonc` |
| Modificado | `base44/entities/Vacation.jsonc` |
| Modificado | `base44/entities/WorkSchedule.jsonc` |
| Modificado | `base44/functions/authCpf/entry.ts` |
| Modificado | `base44/functions/companyDashboard/entry.ts` |
| Modificado | `base44/functions/createEmployeeAccess/entry.ts` |
| Modificado | `base44/functions/employeeCatalog/entry.ts` |
| Modificado | `base44/functions/employeePortal/entry.ts` |
| Modificado | `base44/functions/listEmployees/entry.ts` |
| Modificado | `base44/functions/payrollService/entry.ts` |
| Criado | `base44/functions/rhService/entry.ts` |
| Criado | `base44/functions/rhService/function.jsonc` |
| Criado | `base44/shared/attendance.js` |
| Criado | `base44/shared/benefitRecords.js` |
| Modificado | `base44/shared/payrollCalculation.js` |
| Criado | `base44/shared/payrollReview.js` |
| Modificado | `base44/shared/sessionGuard.ts` |
| Modificado | `src/App.jsx` |
| Criado | `src/api/rh.js` |
| Modificado | `src/components/AdminOnly.jsx` |
| Modificado | `src/components/Layout.jsx` |
| Removido | `src/components/account/TransferOwnerCard.jsx` |
| Modificado | `src/components/benefits/BenefitHistory.jsx` |
| Criado | `src/components/benefits/BenefitRegister.jsx` |
| Modificado | `src/components/dashboard/CompanyPanel.jsx` |
| Modificado | `src/components/params/LegalTableForm.jsx` |
| Modificado | `src/components/payroll/PayrollActions.jsx` |
| Modificado | `src/components/payroll/Payslip.jsx` |
| Modificado | `src/components/payroll/PayslipLookup.jsx` |
| Modificado | `src/components/reports/ReportPayments.jsx` |
| Modificado | `src/components/reports/ReportTime.jsx` |
| Modificado | `src/components/time/TimeMarkForm.jsx` |
| Modificado | `src/components/time/TimeTable.jsx` |
| Modificado | `src/components/ui/button.jsx` |
| Modificado | `src/components/ui/checkbox.jsx` |
| Modificado | `src/components/ui/input.jsx` |
| Modificado | `src/components/ui/textarea.jsx` |
| Modificado | `src/lib/auth.js` |
| Removido | `src/lib/benefits.js` |
| Modificado | `src/lib/legalTable.js` |
| Modificado | `src/lib/payroll.js` |
| Modificado | `src/pages/EmployeeTimeClock.jsx` |
| Modificado | `src/pages/LegalParams.jsx` |
| Modificado | `src/pages/MyAccount.jsx` |
| Modificado | `src/pages/PastPayrolls.jsx` |
| Modificado | `src/pages/PayrollGenerate.jsx` |
| Modificado | `src/pages/PortalForgot.jsx` |
| Modificado | `src/pages/Rubrics.jsx` |
| Modificado | `src/pages/Termination.jsx` |
| Modificado | `src/pages/Thirteenth.jsx` |
| Modificado | `src/pages/TimeControl.jsx` |
| Modificado | `src/pages/TimeCorrection.jsx` |
| Modificado | `src/pages/Vacations.jsx` |
| Criado | `tests/backend_test.js` |
| Criado | `tests/fixture.js` |
| Criado | `tests/import-map.json` |
| Criado | `tests/memory-sdk.js` |
| Modificado | `vercel.json` |
