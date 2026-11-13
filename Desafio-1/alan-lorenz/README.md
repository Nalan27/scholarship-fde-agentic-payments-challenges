# Desafio 1 — Alan Lorenz

## Situação atual

O trabalho está limitado à infraestrutura do backend. Conforme a orientação
da coordenação, o frontend deve permanecer local; não implante S3, CloudFront
ou frontend até nova autorização. A região de destino configurada é
`us-east-1`.

A pasta [`infra/`](./infra/) contém a stack CDK com cinco tabelas DynamoDB,
Cognito e uma HTTP API protegida por JWT. O endpoint `POST /chat` está
protegido, mas sua Lambda ainda é provisória: após autenticar, responde
`501 AGENT_NOT_IMPLEMENTED`. O agente, as ferramentas de pagamento e a
integração completa entre frontend e backend ainda precisam ser concluídos.

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

Consulte [`infra/README.md`](./infra/README.md) para detalhes do modelo de
dados, autenticação, API e configurações de custo.
