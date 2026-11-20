# ContaFlow — diagnóstico do erro `ponto_nao_conferido` (20/11/2026)

## Sintoma reproduzido pelo usuário
Na tela de folha de pagamento, para a competência outubro/2026, a chamada de rede faz `POST` para `https://contabilidade-1.base44.app/api/apps/6ae7c2d5ff47db9e2bde7c3e/functions/payrollService` e recebe **HTTP 422** com corpo:

```json
{"error":"ponto_nao_conferido"}
```

O usuário informou que já fez múltiplos `functions deploy payrollService` (CLI 0.3.3) com resposta `deployed`. O comando `functions pull payrollService` confirmou que o arquivo remoto **contém** `marks.items.length === 0` e **não contém** o identificador `ponto_nao_conferido`. As consultas a `logs` retornaram `No logs found matching the filters`, que não é prova de sucesso nem de falha da execução.

## Proveniência exata do identificador
- Git commit **`6ce760658066`** (18/11/2026): `base44/functions/payrollService/entry.ts` continha `if (!records.items.length) return fail(422, 'ponto_nao_conferido');`.
- Commit posterior **`8df3edf4d56b`** já não continha o código `ponto_nao_conferido`.
- Commit **`6993a5bd9a48`** adicionou a resposta `preview_only` quando `inputs.provisional && marks.items.length === 0`. Na branch atual, a mesma lógica permanece.
- A tela `src/pages/PayrollGenerate.jsx` apenas **traduz** o identificador recebido em uma mensagem em português; **não gera** esse erro localmente.

## Exclusões verificadas
- A URL corresponde ao **app Base44 correto** `6ae7c2d5ff47db9e2bde7c3e` (observada no DevTools).
- A Vercel tem `VITE_BASE44_APP_ID` e `VITE_BASE44_APP_BASE_URL` configurados. Não foi encontrada variável `VITE_BASE44_FUNCTIONS_VERSION` configurada no projeto Vercel.
- A versão atual do código consultada no GitHub não emite `ponto_nao_conferido`.
- O comando `functions pull` confirma a versão *armazenada*, não que a versão servida pelo runtime publicado é idêntica.
- A indexação de logs da CLI pode ter atraso e variar por ambiente; ausência de logs não serve como prova.

## Conclusão
**Divergência de versão entre fonte remota armazenada e execução no endpoint publicado do Base44**. O mecanismo específico (publicação pendente, versão antiga fixada no roteamento, cache, deployment antigo) ainda não foi verificado. Repetir `functions deploy` ou editar registros de ponto não prova correção desse problema.

## Próximo passo recomendado
1. Antes de publicar o app inteiro no Base44, revisar mudanças pendentes e os avisos de segurança da plataforma, especialmente duas funções apontadas como executáveis publicamente.
2. Solicitar ao suporte Base44 que verifique **qual versão/bundle** está associado à rota de produção `/api/apps/6ae7c2d5ff47db9e2bde7c3e/functions/payrollService` e faça a correção de ativação/roteamento caso o bundle antigo esteja ativo. Referir os commits acima.
3. Se comprovado que há apenas uma publicação pendente e ela for segura, publicar pelo editor Base44, lembrando que a ação publica todas as alterações pendentes da branch principal, não só a função.
4. Após confirmar a versão executada, testar o cálculo **apenas em ambiente isolado com funcionário fictício**; o modo `preview_only` não grava ou aprova folha.
5. Nunca executar `base44 deploy`, `entities push` ou `--force` apenas para resolver esse erro: esses comandos podem modificar schemas ou recursos não relacionados.

**Não foram alterados funcionários, pontos, folhas ou dados da Facet Soluções nesta investigação.**
