import * as cdk from 'aws-cdk-lib/core';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

const GITHUB_REPO = 'giuliovv/housefinder';
const DEV_HOST_ROLE_NAME = 'ClaudeServer-Role1ABCC5F0-qSggUp4PUW45';

/**
 * Separate from InfraStack and the ClaudeServer stack on purpose: nothing
 * here touches the frontend or the dev EC2 instance, so deploying or
 * destroying it can't force a redeploy of either.
 */
export class CiStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Lets GitHub Actions authenticate with short-lived tokens instead of
    // stored AWS access keys. AWS allows only one provider per URL per
    // account and this one already existed, so it's referenced, not created.
    const providerArn = `arn:aws:iam::${this.account}:oidc-provider/token.actions.githubusercontent.com`;

    const deployRole = new iam.Role(this, 'GithubDeployRole', {
      roleName: 'housefinder-github-deploy',
      maxSessionDuration: cdk.Duration.hours(2),
      assumedBy: new iam.FederatedPrincipal(
        providerArn,
        {
          StringEquals: { 'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com' },
          // main branch of this repo only — PRs/forks/other branches can't assume it.
          StringLike: { 'token.actions.githubusercontent.com:sub': `repo:${GITHUB_REPO}:ref:refs/heads/main` },
        },
        'sts:AssumeRoleWithWebIdentity',
      ),
    });

    // `cdk deploy` works by assuming the bootstrap roles, so this is all the
    // role needs for deploys; it has no direct broad permissions.
    deployRole.addToPolicy(new iam.PolicyStatement({
      actions: ['sts:AssumeRole'],
      resources: [`arn:aws:iam::${this.account}:role/cdk-*-${this.account}-${this.region}`],
    }));
    // Read/write the data files the scrape job pulls and refreshes.
    deployRole.addToPolicy(new iam.PolicyStatement({
      actions: ['s3:GetObject', 's3:PutObject', 's3:ListBucket'],
      resources: [
        `arn:aws:s3:::housefinder-frontend-${this.account}`,
        `arn:aws:s3:::housefinder-frontend-${this.account}/*`,
      ],
    }));

    // Read-only billing visibility for the dev host, so cost questions can
    // be answered without console access. Attached to the existing role
    // without modifying the ClaudeServer stack.
    const devHostRole = iam.Role.fromRoleName(this, 'DevHostRole', DEV_HOST_ROLE_NAME);
    new iam.ManagedPolicy(this, 'DevHostCostRead', {
      roles: [devHostRole],
      statements: [new iam.PolicyStatement({
        actions: ['ce:GetCostAndUsage', 'ce:GetCostForecast', 'ce:GetDimensionValues'],
        resources: ['*'],
      })],
    });

    new cdk.CfnOutput(this, 'DeployRoleArn', { value: deployRole.roleArn });
  }
}
