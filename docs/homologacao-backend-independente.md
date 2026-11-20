# Homologação do ContaFlow com SQLite

O primeiro teste de integração independente executa os handlers de folha e contracheque do PR #8 por HTTP local e grava exclusivamente fixtures em um banco SQLite temporário. O arquivo fica em um diretório novo e o servidor escuta apenas em `127.0.0.1`.

Execute com Node.js 24:

```sh
node --test tests/homologacao/folha.js
```

O teste cobre recusa ao funcionário que tenta calcular, isolamento entre duas empresas, cálculo automático, exigência de confirmação da data de pagamento, aprovação, finalização e visibilidade do contracheque. Uma segunda conexão SQLite confirma que foi gravada uma única folha finalizada. O teste usa sessões fictícias pré-carregadas.

O adaptador é de teste e cobre as operações necessárias a esse cenário. Para uma aplicação hospedada, faltam um banco persistente apropriado ao ambiente, a integração da interface, autenticação e sessões em execução, as operações dos demais módulos e a homologação completa. A transição da Facet exige autorização e conferência própria da origem e do destino dos dados, dos vínculos e dos históricos.
