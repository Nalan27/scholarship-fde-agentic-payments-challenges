# Desafio 1 — Alan Lorenz

## Situação atual

O trabalho está limitado à infraestrutura do backend. Conforme a orientação
da coordenação, o frontend deve permanecer local; não implante S3, CloudFront
ou frontend até nova autorização. A região de destino configurada é
`us-east-1`.

A pasta [`infra/`](./infra/) contém a stack CDK com cinco tabelas DynamoDB,
Cognito, uma HTTP API protegida por JWT e três Lambdas que adaptam as
ferramentas de pagamento do chatbot anterior. A lógica de catálogo, intenção de
cinco minutos, limite, estoque, pagamento único e auditoria está sendo portada
para DynamoDB.

O endpoint `POST /chat` ainda é provisório: a Lambda responde
`501 AGENT_NOT_IMPLEMENTED`. Falta integrar o agente Strands no Bedrock
AgentCore com o modelo Claude Haiku 4.5 e ligar as ferramentas ao agente. O
frontend permanece local; ainda não houve deploy.

## Validar a infraestrutura

Abra o PowerShell nesta pasta e execute:

```powershell
Set-Location .\infra
npm ci
npm run build
npm test -- --runInBand
npx cdk synth
```

`cdk synth` apenas gera a representação local da stack; não cria recursos na
AWS. Não execute `cdk deploy` até a coordenação confirmar que o deploy do
backend está autorizado. O limite de crédito da conta também deve ser
considerado antes de criar recursos.

As ferramentas portadas podem ser validadas localmente, sem AWS:

```powershell
Set-Location ..\tools
npm ci
npm run check
```

Consulte [`infra/README.md`](./infra/README.md) para detalhes do modelo de
dados, autenticação, API, ferramentas e configurações de custo.
