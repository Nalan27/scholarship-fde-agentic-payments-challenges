# Infraestrutura do desafio

Este pacote define a infraestrutura AWS com CDK em TypeScript para o backend
e a hospedagem do frontend estático em S3 + CloudFront. A stack está
configurada para `us-east-1`. O código e a síntese da stack não autorizam o
deploy: não publique recursos até receber autorização expressa.

## Arquitetura e estado

- Cinco tabelas DynamoDB para produtos, usuários, conversas, intenções e
  transações.
- User Pool do Cognito sem auto cadastro, com login por e-mail e recuperação
  por e-mail. A criação de usuários deve ser administrativa.
- App client público para o frontend, com autenticação SRP e sem OAuth nem
  segredo. O cadastro é administrativo; usuários são provisionados pela
  coordenação.
- REST API com authorizer Cognito e streaming de resposta habilitado na rota
  `POST /chat`. O CORS permite `http://localhost:3000` e o domínio CloudFront.
- Bucket S3 privado, acessível pelo CloudFront com Origin Access Control, e
  publicação do frontend estático com `config.json` gerado pela stack.
- A Lambda de chat obtém o `sub` exclusivamente do authorizer Cognito, invoca
  o AgentCore com um identificador de sessão derivado do usuário e da conversa
  e converte os eventos SSE do runtime em NDJSON para o cliente.
- O runtime é um CodeZip Python 3.13, gerenciado pelo CDK, com Strands e o
  modelo `us.anthropic.claude-haiku-4-5-20251001-v1:0`.
- O agente usa o prompt de negócio original, mantém o histórico enviado pelo
  cliente (inclusive resultados de tools) e expõe as mesmas três tools:
  `listar_catalogo`, `registrar_intencao` e `realizar_compra`.
- As tools são Lambdas TypeScript e recebem o `sub` do Cognito e o UUID da
  conversa em `authenticatedContext`, separado dos argumentos do modelo.
- A compra usa uma única transação DynamoDB condicional para marcar a intenção
  como paga, debitar o limite restante, atualizar o estoque e gravar a
  transação. A chave da transação é a intenção, impedindo pagamento duplicado.
- Cada Lambda tem grupo de logs com retenção de uma semana e papel separado,
  com permissões DynamoDB limitadas às tabelas e operações necessárias. O
  papel do runtime só invoca as três Lambdas e o perfil/modelo Bedrock
  configurados.
- As chamadas das ferramentas, inclusive recusas, são registradas na tabela
  de conversas, sem adicionar uma sexta tabela.

O prompt de negócio original está em
`C:\Users\aland\chatbot-pagamentos\chat-web\src\lib\chat\payload.ts`; sua
cópia server-side no runtime não confia em um prompt `system` fornecido pelo
cliente. Os invariantes de limite, validade, propriedade, saldo, estoque e
pagamento único continuam verificados pelas tools, não pelo modelo.

## Modelo de dados DynamoDB

| Tabela | Chave de partição | Chave de ordenação | Uso |
|---|---|---|---|
| `AlanLorenz-Produtos` | `id` | — | Catálogo, preço em centavos e estoque |
| `AlanLorenz-Usuarios` | `userId` | — | `sub` do Cognito e limite restante em centavos |
| `AlanLorenz-Conversas` | `userId` | `messageKey` | Auditoria das tools; `messageKey` usa `<conversaId>#tool#<data ISO>#<id>` |
| `AlanLorenz-Intencoes` | `intentionId` | — | Proprietário, conversa, total calculado, status e expiração |
| `AlanLorenz-Transacoes` | `intentionId` | — | Uma transação por intenção; `transactionId` fica como atributo do item |

As tabelas usam cobrança sob demanda com limite de throughput configurado para
5 unidades de leitura e escrita por segundo. Esse limite reduz picos de
throughput, mas **não é um teto de gasto mensal**. Não foram habilitados TTL
nem índices secundários: intenções expiradas precisam continuar disponíveis
para que a ferramenta possa responder `INTENCAO_EXPIRADA`, e os índices
adicionariam custo sem serem necessários para os acessos atuais.

O perfil de um usuário Cognito é criado na primeira intenção, com o limite
inicial legado de R$ 1.000,00 (`100000` centavos). O catálogo inicial é o mesmo
do chatbot da Fase 1; não são migrados usuários, conversas ou compras do SQLite.

## Contrato de `POST /chat`

A chamada usa o access/ID token Cognito como `Authorization: Bearer ...` e um
corpo no formato:

```json
{
  "conversaId": "c3ad9981-cd4c-4a01-9a7a-f7248173ad19",
  "messages": [
    { "role": "user", "content": "Quais produtos estão disponíveis?" }
  ]
}
```

O ID da conversa deve ser UUID v4. A Lambda não aceita identidade do cliente
no corpo: o usuário é sempre o `sub` extraído dos claims validados pelo Cognito.
O histórico completo, incluindo mensagens de tools, é transmitido ao Strands;
mensagens `system` vindas do cliente são ignoradas e substituídas pelo prompt
server-side. O runtime devolve eventos SSE, que a Lambda converte em linhas
NDJSON (`message`, `tool`, `error` e `done`).

O API Gateway REST foi escolhido para preservar a resposta incremental: o
streaming de resposta não é suportado por HTTP API. O endpoint permanece
protegido por Cognito. Não se usa o cabeçalho AgentCore `Runtime-User-Id`; o
identificador de sessão é calculado no backend a partir de `sub` e conversa.

## Validar localmente

Requisitos: Node.js/npm, Python 3.13 e `uv`. Gere primeiro o build estático do
chatbot existente:

```powershell
Set-Location ..\..\..\..\chatbot-pagamentos\chat-web
npm ci
npm run check
npm run build
```

O build gera `out/`, que a stack inclui no deploy. Volte para esta pasta e
valide a infraestrutura:

```powershell
Set-Location ..\..\desafio-1\Desafio-1\alan-lorenz\infra
npm ci
npm run build
npm test -- --runInBand
npm run test:agent
npm run synth
```

Se o build não estiver no caminho padrão do repositório irmão
`chatbot-pagamentos\chat-web\out`, defina `FRONTEND_BUILD_PATH` para o caminho
absoluto do diretório `out` antes de executar `npm run synth`. O `pretest`
empacota o agente com dependências Linux ARM64 para CodeZip; o `synth` também
executa esse empacotamento antes de sintetizar o CDK. A primeira execução pode
baixar dependências Python. Esses comandos não invocam o Claude, não acessam
dados AWS e não fazem deploy. Para validar as ferramentas TypeScript, execute
`npm run check` na pasta `../tools/`.

Depois de um deploy autorizado, o catálogo pode ser inserido sem sobrescrever
estoque existente. Na pasta `../tools/`, configure `PRODUCTS_TABLE` com o nome
`AlanLorenz-Produtos` e execute `npm run seed:catalog`. Esse comando grava no
DynamoDB; não o execute como parte dos testes locais.

Não execute `cdk deploy`, o seed de catálogo ou uma chamada ao Haiku sem
autorização expressa. A primeira chamada ao modelo pode registrar a inscrição
na conta, e o limite de crédito informado é US$ 20. O build e a síntese locais
não publicam os recursos nem o frontend.
