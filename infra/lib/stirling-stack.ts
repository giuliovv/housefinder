import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

export class StirlingStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    const bucket = 'housefinder-frontend-854656252703';
    const logs = new cdk.aws_logs.LogGroup(this, 'Logs', {
      logGroupName: '/aws/lambda/houseswipe-stirling-worker',
      retention: cdk.aws_logs.RetentionDays.TWO_WEEKS,
    });
    const role = new cdk.aws_iam.Role(this, 'Role', {
      roleName: 'houseswipe-stirling-worker',
      assumedBy: new cdk.aws_iam.ServicePrincipal('lambda.amazonaws.com'),
    });
    logs.grantWrite(role);
    role.addToPolicy(new cdk.aws_iam.PolicyStatement({
      actions: ['s3:GetObject'], resources: [
        'analytics/history.json', 'killswitch.json', 'data/listings.json', 'workers/stirling/state.json',
      ].map(key => `arn:aws:s3:::${bucket}/${key}`),
    }));
    role.addToPolicy(new cdk.aws_iam.PolicyStatement({
      actions: ['s3:PutObject'], resources: ['workers/stirling/state.json', 'inbox/stirling.json']
        .map(key => `arn:aws:s3:::${bucket}/${key}`),
    }));
    const repository = cdk.aws_ecr.Repository.fromRepositoryName(this, 'ImageRepo', 'houseswipe-stirling-worker');
    const worker = new cdk.aws_lambda.DockerImageFunction(this, 'Worker', {
      functionName: 'houseswipe-stirling-worker',
      code: cdk.aws_lambda.DockerImageCode.fromEcr(repository, {
        tagOrDigest: this.node.tryGetContext('stirlingImageDigest') ?? 'sha256:699c90bfce0e27e8a378dab4f215e770efc0ebaa12d22503e669ed104e604e06',
      }),
      architecture: cdk.aws_lambda.Architecture.ARM_64,
      role, memorySize: 512, timeout: cdk.Duration.minutes(15),
      reservedConcurrentExecutions: 1, environment: { BUCKET: bucket },
      logGroup: logs,
    });
    new cdk.CfnOutput(this, 'FunctionName', { value: worker.functionName });
  }
}
