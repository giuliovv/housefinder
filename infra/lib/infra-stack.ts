import * as cdk from 'aws-cdk-lib/core';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import { Construct } from 'constructs';
import * as path from 'path';

export class InfraStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const domainName = this.node.tryGetContext('domainName');
    const certificateArn = this.node.tryGetContext('certificateArn');
    const hostedZoneName = this.node.tryGetContext('hostedZoneName');
    const hostedZoneId = this.node.tryGetContext('hostedZoneId');
    if (domainName && !certificateArn) {
      throw new Error(
        'certificateArn is required when domainName is set. For CloudFront, use an ACM certificate in us-east-1.',
      );
    }
    if (hostedZoneName && !domainName) {
      throw new Error('domainName is required when hostedZoneName is set.');
    }
    if (hostedZoneName && !hostedZoneId) {
      throw new Error('hostedZoneId is required when hostedZoneName is set.');
    }
    const certificate = certificateArn
      ? acm.Certificate.fromCertificateArn(this, 'Certificate', certificateArn)
      : undefined;

    const bucket = new s3.Bucket(this, 'FrontendBucket', {
      bucketName: `housefinder-frontend-${this.account}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      comment: 'House Finder frontend',
      domainNames: domainName ? [domainName] : undefined,
      certificate,
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(bucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      },
      defaultRootObject: 'index.html',
      // No client-side routing yet (single page) — these just make it safe to
      // add later without another infra change.
      errorResponses: [
        { httpStatus: 403, responseHttpStatus: 200, responsePagePath: '/index.html' },
        { httpStatus: 404, responseHttpStatus: 200, responsePagePath: '/index.html' },
      ],
    });

    if (domainName && hostedZoneName) {
      const hostedZone = route53.HostedZone.fromHostedZoneAttributes(this, 'HostedZone', {
        hostedZoneId,
        zoneName: hostedZoneName,
      });
      const suffix = `.${hostedZoneName}`;
      const recordName =
        domainName === hostedZoneName
          ? undefined
          : domainName.endsWith(suffix)
            ? domainName.slice(0, -suffix.length)
            : domainName;
      new route53.ARecord(this, 'AliasRecord', {
        zone: hostedZone,
        recordName,
        target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(distribution)),
      });
    }

    new s3deploy.BucketDeployment(this, 'DeployFrontend', {
      sources: [s3deploy.Source.asset(path.join(__dirname, '../../frontend/dist'))],
      destinationBucket: bucket,
      distribution,
      distributionPaths: ['/*'],
    });

    new cdk.CfnOutput(this, 'CloudFrontDomain', { value: distribution.distributionDomainName });
    if (domainName) {
      new cdk.CfnOutput(this, 'CustomUrl', { value: `https://${domainName}` });
    }
    new cdk.CfnOutput(this, 'BucketName', { value: bucket.bucketName });
    new cdk.CfnOutput(this, 'DistributionId', { value: distribution.distributionId });
  }
}
