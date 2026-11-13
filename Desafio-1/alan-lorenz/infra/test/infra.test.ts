import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
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
});
