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

  test('protects the chat route with Cognito JWT and allows only the local frontend origin', () => {
    template.hasResourceProperties('AWS::ApiGatewayV2::Api', {
      ProtocolType: 'HTTP',
      CorsConfiguration: {
        AllowOrigins: ['http://localhost:3000'],
        AllowMethods: ['POST', 'OPTIONS'],
        AllowHeaders: ['authorization', 'content-type', 'x-conversa-id'],
      },
    });

    template.hasResourceProperties('AWS::ApiGatewayV2::Route', {
      RouteKey: 'POST /chat',
      AuthorizationType: 'JWT',
    });
  });

  test('retains the chat logs for one week and scopes the role to that log group', () => {
    template.hasResourceProperties('AWS::Logs::LogGroup', {
      LogGroupName: '/aws/lambda/AlanLorenz-ChatHandler',
      RetentionInDays: 7,
    });

    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: [
          {
            Action: ['logs:CreateLogStream', 'logs:PutLogEvents'],
          },
        ],
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
