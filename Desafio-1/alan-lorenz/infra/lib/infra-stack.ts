import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

export class InfraStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const prefix = 'AlanLorenz';

    // 1. Catálogo de Produtos
    const productsTable = new dynamodb.Table(this, 'ProductsTable', {
      tableName: `${prefix}-Produtos`,
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // 2. Usuários e Limites
    const usersTable = new dynamodb.Table(this, 'UsersTable', {
      tableName: `${prefix}-Usuarios`,
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // 3. Intenções de Compra
    const intentionsTable = new dynamodb.Table(this, 'IntentionsTable', {
      tableName: `${prefix}-Intencoes`,
      partitionKey: { name: 'intentionId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // 4. Transações
    const transactionsTable = new dynamodb.Table(this, 'TransactionsTable', {
      tableName: `${prefix}-Transacoes`,
      partitionKey: { name: 'transactionId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
  }
}