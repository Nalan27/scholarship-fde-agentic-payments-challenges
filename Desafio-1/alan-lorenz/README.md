# Desafio 1 — Alan Lorenz

## Situação atual

O escopo atual integra o chatbot existente com Cognito e a API AWS, incluindo
a hospedagem do frontend estático em S3 + CloudFront na região `us-east-1`.
O usuário ainda precisa autorizar qualquer deploy.

A pasta [`infra/`](./infra/) contém a stack CDK com cinco tabelas DynamoDB,
Cognito, uma REST API protegida por Cognito com resposta em streaming, uma
Lambda de chat implementada em [`api/`](./api/), um runtime Strands no Bedrock
AgentCore implementado em [`agent/`](./agent/) usando o Claude Haiku 4.5, três
Lambdas TypeScript para as ferramentas em [`tools/`](./tools/) e hospedagem
estática privada via S3 + CloudFront. O frontend mantém a interface e o histórico do chatbot,
autentica com Cognito e envia o ID token à API. O agente reutiliza o prompt de
negócio original, mantém o histórico e envia o `sub` autenticado às tools fora
dos argumentos visíveis ao modelo.

A Lambda do chat persiste cada nova mensagem do usuário, a resposta do agente
e as chamadas concluídas das ferramentas em `AlanLorenz-Conversas`. Somente a
role dessa Lambda pode gravar nessa tabela; o acesso usa o `sub` do Cognito
como chave de partição e a API não aceita identidade enviada no corpo.

A validação local do frontend (26 testes e build estático), dos testes CDK
(19 testes) e da síntese da stack passou. Não houve deploy, seed do catálogo
nem chamada ao modelo; a primeira chamada ao Haiku pode registrar a inscrição
na conta.

## Validar e publicar

Requisitos: Node.js/npm, Python 3.13 e `uv`. O frontend incluído em
[`frontend/`](./frontend/) é a cópia do `chat-web` adaptada ao Cognito e à API
`POST /chat`. Para validar tudo sem publicar recursos, execute na pasta
`infra/`:

```powershell
npm ci
npm run test -- --runInBand
npm run test:agent
npm run synth
```

`npm run synth` instala as dependências do frontend, executa seus checks e
build estático, empacota o agente para CodeZip (Linux ARM64) e sintetiza a
stack. Isso não cria recursos AWS nem invoca o Claude. O build é gerado em
`frontend/out/`; para usar outro diretório, defina `FRONTEND_BUILD_PATH`.

Após revisar a síntese e obter autorização expressa para publicar, o deploy
integral pode ser iniciado da pasta `infra/`, após configurar credenciais AWS
com permissão para criar os recursos da stack, com:

```powershell
npm run deploy
```

Esse comando constrói o frontend, empacota o agente e executa `cdk deploy`,
além de preparar o ambiente de bootstrap do CDK em `us-east-1` se necessário.
O deploy cria a infraestrutura e publica os arquivos no S3/CloudFront.
Bootstrap e deploy alteram a conta AWS: não os execute sem autorização; não
execute também o seed do catálogo nem uma chamada ao Haiku sem autorização.

As ferramentas portadas podem ser validadas localmente, sem AWS:

```powershell
Set-Location ..\tools
npm ci
npm run check
```

Consulte [`infra/README.md`](./infra/README.md) para detalhes do modelo de
dados, autenticação, streaming, ferramentas, publicação estática,
empacotamento e configurações de custo. Não execute `cdk deploy`,
`npm run seed:catalog` nem a chamada ao Haiku sem autorização expressa da
coordenação e revisão do custo estimado.
