import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

export class InfraStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const prefix = 'AlanLorenz';
    const billing = {
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      maxReadRequestUnits: 5,
      maxWriteRequestUnits: 5,
    };

    new dynamodb.Table(this, 'ProductsTable', {
      tableName: `${prefix}-Produtos`,
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      ...billing,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    new dynamodb.Table(this, 'UsersTable', {
      tableName: `${prefix}-Usuarios`,
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      ...billing,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    new dynamodb.Table(this, 'ConversationsTable', {
      tableName: `${prefix}-Conversas`,
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'messageKey', type: dynamodb.AttributeType.STRING },
      ...billing,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    new dynamodb.Table(this, 'IntentionsTable', {
      tableName: `${prefix}-Intencoes`,
      partitionKey: { name: 'intentionId', type: dynamodb.AttributeType.STRING },
      ...billing,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    new dynamodb.Table(this, 'TransactionsTable', {
      tableName: `${prefix}-Transacoes`,
      partitionKey: { name: 'intentionId', type: dynamodb.AttributeType.STRING },
      ...billing,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
  }
}