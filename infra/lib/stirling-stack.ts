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
        'analytics/history.json', 'killswitch.json', 'data/listings.json', 'inbox/stirling-state.json',
      ].map(key => `arn:aws:s3:::${bucket}/${key}`),
    }));
    role.addToPolicy(new cdk.aws_iam.PolicyStatement({
      actions: ['s3:PutObject'], resources: ['inbox/stirling-state.json', 'inbox/stirling.json', 'alerts/pending/*']
        .map(key => `arn:aws:s3:::${bucket}/${key}`),
    }));
    role.addToPolicy(new cdk.aws_iam.PolicyStatement({
      actions: ['s3:ListBucket'], resources: [`arn:aws:s3:::${bucket}`],
      conditions: { StringEquals: { 's3:prefix': ['inbox/stirling-state.json', 'killswitch.json'] } },
    }));
    const repository = cdk.aws_ecr.Repository.fromRepositoryName(this, 'ImageRepo', 'houseswipe-stirling-worker');
    const worker = new cdk.aws_lambda.DockerImageFunction(this, 'Worker', {
      functionName: 'houseswipe-stirling-worker',
      code: cdk.aws_lambda.DockerImageCode.fromEcr(repository, {
        tagOrDigest: this.node.tryGetContext('stirlingImageDigest') ?? 'sha256:acdb3624f88282403ae0f29304f8678e462278f1f358f4ce290abb882a71611e',
      }),
      architecture: cdk.aws_lambda.Architecture.ARM_64,
      role, memorySize: 512, timeout: cdk.Duration.minutes(15),
      environment: { BUCKET: bucket },
      logGroup: logs,
    });
    new cdk.CfnOutput(this, 'FunctionName', { value: worker.functionName });
  }
}
