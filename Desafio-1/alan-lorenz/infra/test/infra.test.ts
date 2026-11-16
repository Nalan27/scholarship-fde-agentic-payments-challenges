import * as cdk from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { InfraStack } from '../lib/infra-stack';

describe('InfraStack DynamoDB tables', () => {
  const app = new cdk.App();
  const template = Template.fromStack(new InfraStack(app, 'TestInfraStack'));

  test('creates the five backend tables with on-demand billing caps', () => {
    template.resourceCountIs('AWS::DynamoDB::Table', 5);
    template.allResourcesProperties('AWS::DynamoDB::Table', {
      BillingMode: 'PAY_PER_REQUEST',
      OnDemandThroughput: {
        MaxReadRequestUnits: 5,
        MaxWriteRequestUnits: 5,
      },
    });
  });

  test('stores conversation messages under the authenticated user and conversation key', () => {
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      TableName: 'AlanLorenz-Conversas',
      KeySchema: [
        { AttributeName: 'userId', KeyType: 'HASH' },
        { AttributeName: 'messageKey', KeyType: 'RANGE' },
      ],
    });
  });

  test('uses the intention id as the transaction key to prevent duplicate payments', () => {
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      TableName: 'AlanLorenz-Transacoes',
      KeySchema: [{ AttributeName: 'intentionId', KeyType: 'HASH' }],
    });
  });

  test('allows user creation only by an administrator', () => {
    template.hasResourceProperties('AWS::Cognito::UserPool', {
      AdminCreateUserConfig: {
        AllowAdminCreateUserOnly: true,
      },
      AccountRecoverySetting: {
        RecoveryMechanisms: [{ Name: 'verified_email', Priority: 1 }],
      },
    });
  });

  test('creates a public SRP client without OAuth redirects or a client secret', () => {
    template.hasResourceProperties('AWS::Cognito::UserPoolClient', {
      GenerateSecret: false,
      ExplicitAuthFlows: ['ALLOW_USER_SRP_AUTH', 'ALLOW_REFRESH_TOKEN_AUTH'],
      AllowedOAuthFlows: Match.absent(),
      CallbackURLs: Match.absent(),
    });
  });

  test('protects the streaming chat route with Cognito and local-origin CORS', () => {
    template.resourceCountIs('AWS::ApiGateway::RestApi', 1);
    template.hasResourceProperties('AWS::ApiGateway::Method', {
      HttpMethod: 'POST',
      AuthorizationType: 'COGNITO_USER_POOLS',
      Integration: {
        Type: 'AWS_PROXY',
        IntegrationHttpMethod: 'POST',
        ResponseTransferMode: 'STREAM',
      },
    });
    template.hasResourceProperties('AWS::ApiGateway::GatewayResponse', {
      ResponseType: 'UNAUTHORIZED',
      ResponseParameters: {
        'gatewayresponse.header.Access-Control-Allow-Origin':
          "'http://localhost:3000'",
      },
    });
  });

  test('deploys the Python 3.13 AgentCore CodeZip with the existing Haiku model', () => {
    template.hasResourceProperties('AWS::BedrockAgentCore::Runtime', {
      AgentRuntimeName: 'AlanLorenzChatAgent',
      AgentRuntimeArtifact: {
        CodeConfiguration: {
          Code: {
            S3: {
              Bucket: Match.anyValue(),
              Prefix: Match.anyValue(),
            },
          },
          EntryPoint: ['main.py'],
          Runtime: 'PYTHON_3_13',
        },
      },
      EnvironmentVariables: {
        BEDROCK_MODEL_ID: 'us.anthropic.claude-haiku-4-5-20251001-v1:0',
        LIST_CATALOG_FUNCTION: Match.anyValue(),
        REGISTER_INTENTION_FUNCTION: Match.anyValue(),
        REALIZAR_COMPRA_FUNCTION: Match.anyValue(),
      },
    });
  });

  test('limits runtime model access and invokes only the three payment tools', () => {
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyName: Match.stringLikeRegexp('ChatAgentRuntimeExecutionRole'),
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: ['bedrock:InvokeModel', 'bedrock:InvokeModelWithResponseStream'],
            Resource: Match.anyValue(),
          }),
          Match.objectLike({
            Action: ['bedrock:InvokeModel', 'bedrock:InvokeModelWithResponseStream'],
            Condition: {
              StringLike: {
                'bedrock:InferenceProfileArn': Match.anyValue(),
              },
            },
            Resource: Match.anyValue(),
          }),
        ]),
      },
    });
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyName: Match.stringLikeRegexp('ChatAgentRuntimeExecutionRole'),
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: 'lambda:InvokeFunction',
            Resource: Match.anyValue(),
          }),
        ]),
      },
    });
    const synthesized = JSON.stringify(template.toJSON().Resources);
    expect(synthesized).toContain(
      'inference-profile/us.anthropic.claude-haiku-4-5-20251001-v1:0',
    );
    expect(synthesized).toContain(
      'foundation-model/anthropic.claude-haiku-4-5-20251001-v1:0',
    );
  });

  test('retains the chat logs for one week and scopes the role to that log group', () => {
    template.hasResourceProperties('AWS::Logs::LogGroup', {
      LogGroupName: '/aws/lambda/AlanLorenz-ChatHandler',
      RetentionInDays: 7,
    });

    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: ['logs:CreateLogStream', 'logs:PutLogEvents'],
          }),
        ]),
      },
    });
  });

  test('creates one Lambda for each existing payment tool with the table names configured', () => {
    template.resourceCountIs('AWS::Lambda::Function', 4);
    for (const functionName of [
      'AlanLorenz-ListCatalog',
      'AlanLorenz-RegisterIntention',
      'AlanLorenz-RealizarCompra',
    ]) {
      template.hasResourceProperties('AWS::Lambda::Function', {
        FunctionName: functionName,
        Runtime: 'nodejs22.x',
        Environment: {
          Variables: {
            PRODUCTS_TABLE: Match.anyValue(),
            USERS_TABLE: Match.anyValue(),
            CONVERSATIONS_TABLE: Match.anyValue(),
            INTENTIONS_TABLE: Match.anyValue(),
            TRANSACTIONS_TABLE: Match.anyValue(),
          },
        },
      });
    }
  });

  test('configures the chat Lambda to invoke AgentCore with scoped IAM permission', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      FunctionName: 'AlanLorenz-ChatHandler',
      Runtime: 'nodejs22.x',
      Environment: {
        Variables: {
          AGENT_RUNTIME_ARN: Match.anyValue(),
        },
      },
    });
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: 'bedrock-agentcore:InvokeAgentRuntime',
            Resource: Match.anyValue(),
          }),
        ]),
      },
    });
  });

  test('grants DynamoDB tool access through resource-scoped policies', () => {
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: 'dynamodb:TransactWriteItems',
            Resource: Match.anyValue(),
          }),
        ]),
      },
    });
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: 'dynamodb:Scan',
            Resource: Match.anyValue(),
          }),
        ]),
      },
    });
  });
});
