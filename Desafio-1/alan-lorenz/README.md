# Desafio 1 — Alan Lorenz

## Situação atual

O trabalho está limitado à infraestrutura do backend. Conforme a orientação
da coordenação, o frontend deve permanecer local; não implante S3, CloudFront
ou frontend até nova autorização. A região de destino configurada é
`us-east-1`.

A pasta [`infra/`](./infra/) contém a stack CDK com cinco tabelas DynamoDB,
Cognito, uma REST API protegida por Cognito com resposta em streaming, uma
Lambda de chat, um runtime Strands no Bedrock AgentCore usando o Claude Haiku
4.5 e as três Lambdas TypeScript das ferramentas portadas do chatbot anterior.
O agente reutiliza o prompt de negócio original, mantém o histórico e envia o
`sub` autenticado às tools fora dos argumentos visíveis ao modelo.

O backend foi validado localmente com testes e síntese do CDK. Ainda falta
integrar o login Cognito no frontend local, que continua usando o JWT local
anterior. Não houve deploy, seed do catálogo nem chamada ao modelo; a primeira
chamada ao Haiku pode registrar a inscrição na conta.

## Validar localmente

Abra o PowerShell nesta pasta e execute:

```powershell
Set-Location .\infra
npm ci
npm run build
npm test -- --runInBand
npm run test:agent
npm run synth
```

O primeiro empacotamento do agente usa Python 3.13, `uv` e dependências Linux
ARM64 para CodeZip; pode baixar pacotes. A síntese só gera a representação
local da stack. Esses comandos não invocam o Claude e não criam recursos na
AWS.

As ferramentas portadas podem ser validadas localmente, sem AWS:

```powershell
Set-Location ..\tools
npm ci
npm run check
```

Consulte [`infra/README.md`](./infra/README.md) para detalhes do modelo de
dados, autenticação, streaming, ferramentas, empacotamento e configurações de
custo. Não execute `cdk deploy`, `npm run seed:catalog` nem a chamada ao Haiku
sem autorização expressa da coordenação e revisão do custo estimado.
