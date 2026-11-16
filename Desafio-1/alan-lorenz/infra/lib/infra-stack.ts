import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as bedrockagentcore from 'aws-cdk-lib/aws-bedrockagentcore';
import * as cdk from 'aws-cdk-lib';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import { Construct } from 'constructs';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const MODEL_ID = 'us.anthropic.claude-haiku-4-5-20251001-v1:0';
const FOUNDATION_MODEL_ID = MODEL_ID.replace(/^us\./, '');
const LOCAL_FRONTEND_ORIGIN = 'http://localhost:3000';

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

    const authorizer = new apigateway.CognitoUserPoolsAuthorizer(
      this,
      'CognitoAuthorizer',
      { cognitoUserPools: [userPool] },
    );

    const projectRoot = join(__dirname, '..');
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

    const agentRuntime = new bedrockagentcore.Runtime(this, 'ChatAgentRuntime', {
      runtimeName: `${prefix}ChatAgent`,
      agentRuntimeArtifact: bedrockagentcore.AgentRuntimeArtifact.fromCodeAsset({
        path: join(projectRoot, 'agent', 'dist'),
        runtime: bedrockagentcore.AgentCoreRuntime.PYTHON_3_13,
        entrypoint: ['main.py'],
      }),
      environmentVariables: {
        BEDROCK_MODEL_ID: MODEL_ID,
        LIST_CATALOG_FUNCTION: catalogTool.fn.functionName,
        REGISTER_INTENTION_FUNCTION: intentionTool.fn.functionName,
        REALIZAR_COMPRA_FUNCTION: purchaseTool.fn.functionName,
      },
      lifecycleConfiguration: {
        idleRuntimeSessionTimeout: cdk.Duration.seconds(300),
        maxLifetime: cdk.Duration.minutes(30),
      },
    });

    agentRuntime.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['lambda:InvokeFunction'],
        resources: [
          catalogTool.fn.functionArn,
          intentionTool.fn.functionArn,
          purchaseTool.fn.functionArn,
        ],
      }),
    );

    const modelProfileArn = this.formatArn({
      service: 'bedrock',
      resource: 'inference-profile',
      resourceName: MODEL_ID,
    });
    agentRuntime.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['bedrock:InvokeModel', 'bedrock:InvokeModelWithResponseStream'],
        resources: [modelProfileArn],
      }),
    );
    agentRuntime.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['bedrock:InvokeModel', 'bedrock:InvokeModelWithResponseStream'],
        resources: [
          `arn:${this.partition}:bedrock:us-*::foundation-model/${FOUNDATION_MODEL_ID}`,
        ],
        conditions: {
          StringLike: { 'bedrock:InferenceProfileArn': modelProfileArn },
        },
      }),
    );

    const chatLogGroup = new logs.LogGroup(this, 'ChatHandlerLogGroup', {
      logGroupName: `/aws/lambda/${prefix}-ChatHandler`,
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    const chatHandlerRole = new iam.Role(this, 'ChatHandlerRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
    });
    chatLogGroup.grantWrite(chatHandlerRole);
    agentRuntime.grantInvokeRuntime(chatHandlerRole);

    const chatHandler = new nodejs.NodejsFunction(this, 'ChatHandler', {
      entry: join(projectRoot, 'lambda', 'chat.ts'),
      projectRoot,
      depsLockFilePath: join(projectRoot, 'package-lock.json'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      functionName: `${prefix}-ChatHandler`,
      memorySize: 256,
      timeout: cdk.Duration.minutes(5),
      logGroup: chatLogGroup,
      role: chatHandlerRole,
      environment: {
        AGENT_RUNTIME_ARN: agentRuntime.agentRuntimeArn,
      },
    });

    const frontendBuildPath =
      this.node.tryGetContext('frontendBuildPath') ??
      process.env.FRONTEND_BUILD_PATH ??
      join(projectRoot, '..', 'frontend', 'out');
    if (!existsSync(frontendBuildPath)) {
      throw new Error(
        `Static frontend build not found at "${frontendBuildPath}". Run "npm run build:frontend" from the infra directory or set FRONTEND_BUILD_PATH.`,
      );
    }

    const frontendBucket = new s3.Bucket(this, 'FrontendBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      autoDeleteObjects: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const frontendRoutes = new cloudfront.Function(this, 'FrontendRoutes', {
      code: cloudfront.FunctionCode.fromInline(`
function handler(event) {
  var request = event.request;
  var uri = request.uri;
  var lastSegment = uri.substring(uri.lastIndexOf('/') + 1);
  if (!lastSegment || lastSegment.indexOf('.') === -1) {
    request.uri = uri.endsWith('/') ? uri + 'index.html' : uri + '.html';
  }
  return request;
}`),
      runtime: cloudfront.FunctionRuntime.JS_2_0,
    });

    const frontendDistribution = new cloudfront.Distribution(
      this,
      'FrontendDistribution',
      {
        defaultRootObject: 'index.html',
        defaultBehavior: {
          origin: origins.S3BucketOrigin.withOriginAccessControl(frontendBucket),
          viewerProtocolPolicy:
            cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          functionAssociations: [
            {
              function: frontendRoutes,
              eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
            },
          ],
        },
        priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      },
    );
    chatHandler.addEnvironment(
      'FRONTEND_ORIGIN',
      `https://${frontendDistribution.distributionDomainName}`,
    );

    const api = new apigateway.RestApi(this, 'ChatApi', {
      restApiName: `${prefix}-ChatApi`,
      endpointConfiguration: {
        types: [apigateway.EndpointType.REGIONAL],
      },
      defaultCorsPreflightOptions: {
        allowOrigins: [
          LOCAL_FRONTEND_ORIGIN,
          `https://${frontendDistribution.distributionDomainName}`,
        ],
        allowMethods: ['POST', 'OPTIONS'],
        allowHeaders: ['Authorization', 'Content-Type', 'X-Conversa-Id'],
      },
    });

    api.addGatewayResponse('UnauthorizedCors', {
      type: apigateway.ResponseType.UNAUTHORIZED,
      responseHeaders: {
        'Access-Control-Allow-Origin': "'*'",
        'Access-Control-Allow-Headers': "'Authorization,Content-Type,X-Conversa-Id'",
        'Access-Control-Allow-Methods': "'POST,OPTIONS'",
      },
    });
    api.addGatewayResponse('AccessDeniedCors', {
      type: apigateway.ResponseType.ACCESS_DENIED,
      responseHeaders: {
        'Access-Control-Allow-Origin': "'*'",
        'Access-Control-Allow-Headers': "'Authorization,Content-Type,X-Conversa-Id'",
        'Access-Control-Allow-Methods': "'POST,OPTIONS'",
      },
    });

    api.root.addResource('chat').addMethod(
      'POST',
      new apigateway.LambdaIntegration(chatHandler, {
        proxy: true,
        responseTransferMode: apigateway.ResponseTransferMode.STREAM,
      }),
      {
        authorizationType: apigateway.AuthorizationType.COGNITO,
        authorizer,
      },
    );

    new s3deploy.BucketDeployment(this, 'DeployFrontend', {
      sources: [
        s3deploy.Source.asset(frontendBuildPath),
        s3deploy.Source.jsonData('config.json', {
          userPoolId: userPool.userPoolId,
          userPoolClientId: userPoolClient.userPoolClientId,
          chatApiUrl: api.urlForPath('/chat'),
        }),
      ],
      destinationBucket: frontendBucket,
      distribution: frontendDistribution,
      distributionPaths: ['/*'],
      prune: true,
    });

    new cdk.CfnOutput(this, 'UserPoolId', {
      value: userPool.userPoolId,
    });
    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: userPoolClient.userPoolClientId,
    });
    new cdk.CfnOutput(this, 'ChatApiEndpoint', {
      value: api.urlForPath('/chat'),
    });
    new cdk.CfnOutput(this, 'AgentRuntimeArn', {
      value: agentRuntime.agentRuntimeArn,
    });
    new cdk.CfnOutput(this, 'FrontendUrl', {
      value: `https://${frontendDistribution.distributionDomainName}`,
    });
    new cdk.CfnOutput(this, 'FrontendBucketName', {
      value: frontendBucket.bucketName,
    });
  }
}
