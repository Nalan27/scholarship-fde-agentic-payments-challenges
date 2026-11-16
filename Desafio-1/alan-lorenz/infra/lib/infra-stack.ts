import * as cdk from 'aws-cdk-lib';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as authorizers from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import * as integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import { join } from 'node:path';

export class InfraStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const prefix = 'AlanLorenz';
    const billing = {
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      maxReadRequestUnits: 5,
      maxWriteRequestUnits: 5,
    };

    const productsTable = new dynamodb.Table(this, 'ProductsTable', {
      tableName: `${prefix}-Produtos`,
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      ...billing,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const usersTable = new dynamodb.Table(this, 'UsersTable', {
      tableName: `${prefix}-Usuarios`,
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      ...billing,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const conversationsTable = new dynamodb.Table(this, 'ConversationsTable', {
      tableName: `${prefix}-Conversas`,
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'messageKey', type: dynamodb.AttributeType.STRING },
      ...billing,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const intentionsTable = new dynamodb.Table(this, 'IntentionsTable', {
      tableName: `${prefix}-Intencoes`,
      partitionKey: { name: 'intentionId', type: dynamodb.AttributeType.STRING },
      ...billing,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const transactionsTable = new dynamodb.Table(this, 'TransactionsTable', {
      tableName: `${prefix}-Transacoes`,
      partitionKey: { name: 'intentionId', type: dynamodb.AttributeType.STRING },
      ...billing,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: `${prefix}-Usuarios`,
      selfSignUpEnabled: false,
      signInAliases: { email: true, username: false },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      userInvitation: {
        emailSubject: `Convite para ${prefix}`,
        emailBody: 'Você foi convidado. Usuário: {username}. Senha temporária: {####}.',
      },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const userPoolClient = userPool.addClient('WebClient', {
      userPoolClientName: `${prefix}-FrontendLocal`,
      generateSecret: false,
      authFlows: { userSrp: true },
      disableOAuth: true,
      preventUserExistenceErrors: true,
    });

    const authorizer = new authorizers.HttpUserPoolAuthorizer(
      'CognitoAuthorizer',
      userPool,
      { userPoolClients: [userPoolClient] },
    );

    const projectRoot = join(__dirname, '..');
    const chatLogGroup = new logs.LogGroup(this, 'ChatHandlerLogGroup', {
      logGroupName: `/aws/lambda/${prefix}-ChatHandler`,
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    const chatHandlerRole = new iam.Role(this, 'ChatHandlerRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
    });
    chatLogGroup.grantWrite(chatHandlerRole);

    const chatHandler = new nodejs.NodejsFunction(this, 'ChatHandler', {
      entry: join(projectRoot, 'lambda', 'chat.ts'),
      projectRoot,
      depsLockFilePath: join(projectRoot, 'package-lock.json'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      functionName: `${prefix}-ChatHandler`,
      memorySize: 256,
      timeout: cdk.Duration.seconds(30),
      logGroup: chatLogGroup,
      role: chatHandlerRole,
    });

    const toolsRoot = join(projectRoot, '..', 'tools');
    const toolEnvironment = {
      PRODUCTS_TABLE: productsTable.tableName,
      USERS_TABLE: usersTable.tableName,
      CONVERSATIONS_TABLE: conversationsTable.tableName,
      INTENTIONS_TABLE: intentionsTable.tableName,
      TRANSACTIONS_TABLE: transactionsTable.tableName,
    };

    const createToolLambda = (
      id: string,
      functionName: string,
      entry: string,
    ) => {
      const logGroup = new logs.LogGroup(this, `${id}LogGroup`, {
        logGroupName: `/aws/lambda/${functionName}`,
        retention: logs.RetentionDays.ONE_WEEK,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      });
      const role = new iam.Role(this, `${id}Role`, {
        assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      });
      logGroup.grantWrite(role);

      const fn = new nodejs.NodejsFunction(this, id, {
        entry: join(toolsRoot, 'src', 'handlers', entry),
        projectRoot: toolsRoot,
        depsLockFilePath: join(toolsRoot, 'package-lock.json'),
        handler: 'handler',
        runtime: lambda.Runtime.NODEJS_22_X,
        functionName,
        memorySize: 256,
        timeout: cdk.Duration.seconds(10),
        logGroup,
        role,
        environment: toolEnvironment,
      });
      return { fn, role };
    };

    const addTablePermissions = (
      role: iam.Role,
      table: dynamodb.Table,
      ...actions: string[]
    ) => {
      role.addToPolicy(
        new iam.PolicyStatement({
          actions,
          resources: [table.tableArn],
        }),
      );
    };

    const catalogTool = createToolLambda(
      'ListCatalogTool',
      `${prefix}-ListCatalog`,
      'listar-catalogo.ts',
    );
    addTablePermissions(catalogTool.role, productsTable, 'dynamodb:Scan');
    addTablePermissions(
      catalogTool.role,
      conversationsTable,
      'dynamodb:PutItem',
    );

    const intentionTool = createToolLambda(
      'RegisterIntentionTool',
      `${prefix}-RegisterIntention`,
      'registrar-intencao.ts',
    );
    addTablePermissions(intentionTool.role, productsTable, 'dynamodb:GetItem');
    addTablePermissions(
      intentionTool.role,
      usersTable,
      'dynamodb:GetItem',
      'dynamodb:PutItem',
    );
    addTablePermissions(intentionTool.role, intentionsTable, 'dynamodb:PutItem');
    addTablePermissions(
      intentionTool.role,
      conversationsTable,
      'dynamodb:PutItem',
    );

    const purchaseTool = createToolLambda(
      'RealizarCompraTool',
      `${prefix}-RealizarCompra`,
      'realizar-compra.ts',
    );
    addTablePermissions(
      purchaseTool.role,
      intentionsTable,
      'dynamodb:GetItem',
      'dynamodb:UpdateItem',
      'dynamodb:TransactWriteItems',
    );
    addTablePermissions(
      purchaseTool.role,
      usersTable,
      'dynamodb:GetItem',
      'dynamodb:TransactWriteItems',
    );
    addTablePermissions(
      purchaseTool.role,
      productsTable,
      'dynamodb:GetItem',
      'dynamodb:UpdateItem',
      'dynamodb:TransactWriteItems',
    );
    addTablePermissions(
      purchaseTool.role,
      transactionsTable,
      'dynamodb:TransactWriteItems',
    );
    addTablePermissions(
      purchaseTool.role,
      conversationsTable,
      'dynamodb:PutItem',
    );

    const api = new apigatewayv2.HttpApi(this, 'ChatApi', {
      apiName: `${prefix}-ChatApi`,
      defaultAuthorizer: authorizer,
      corsPreflight: {
        allowOrigins: ['http://localhost:3000'],
        allowMethods: [
          apigatewayv2.CorsHttpMethod.POST,
          apigatewayv2.CorsHttpMethod.OPTIONS,
        ],
        allowHeaders: ['authorization', 'content-type', 'x-conversa-id'],
      },
    });

    api.addRoutes({
      path: '/chat',
      methods: [apigatewayv2.HttpMethod.POST],
      integration: new integrations.HttpLambdaIntegration('ChatIntegration', chatHandler),
    });

    new cdk.CfnOutput(this, 'UserPoolId', {
      value: userPool.userPoolId,
    });
    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: userPoolClient.userPoolClientId,
    });
    new cdk.CfnOutput(this, 'ChatApiEndpoint', {
      value: api.apiEndpoint,
    });
  }
}