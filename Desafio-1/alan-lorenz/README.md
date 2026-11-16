# Desafio 1 — Alan Lorenz

## Situação atual

O escopo atual integra o chatbot existente com Cognito e a API AWS, incluindo
a hospedagem do frontend estático em S3 + CloudFront na região `us-east-1`.
O usuário ainda precisa autorizar qualquer deploy.

A pasta [`infra/`](./infra/) contém a stack CDK com cinco tabelas DynamoDB,
Cognito, uma REST API protegida por Cognito com resposta em streaming, uma
Lambda de chat, um runtime Strands no Bedrock AgentCore usando o Claude Haiku
4.5, três Lambdas TypeScript para as ferramentas e hospedagem estática privada
via S3 + CloudFront. O frontend mantém a interface e o histórico do chatbot,
autentica com Cognito e envia o ID token à API. O agente reutiliza o prompt de
negócio original, mantém o histórico e envia o `sub` autenticado às tools fora
dos argumentos visíveis ao modelo.

A validação local do frontend (26 testes e build estático), dos testes CDK
(19 testes) e da síntese da stack passou. Não houve deploy, seed do catálogo
nem chamada ao modelo; a primeira chamada ao Haiku pode registrar a inscrição
na conta.

## Validar localmente

Gere primeiro o site estático; depois valide a stack:

```powershell
Set-Location ..\..\..\..\chatbot-pagamentos\chat-web
npm ci
npm run check
npm run build

Set-Location ..\..\desafio-1\Desafio-1\alan-lorenz\infra
npm ci
npm run build
npm test -- --runInBand
npm run test:agent
npm run synth
```

O primeiro empacotamento do agente usa Python 3.13, `uv` e dependências Linux
ARM64 para CodeZip; pode baixar pacotes. O build do frontend gera `out/`, que
a síntese da stack precisa encontrar. Se estiver em outro local, defina
`FRONTEND_BUILD_PATH` com seu caminho absoluto. A síntese só gera a
representação local da stack. Esses comandos não invocam o Claude e não criam
recursos na AWS.

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
