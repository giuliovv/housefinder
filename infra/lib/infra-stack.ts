import * as cdk from 'aws-cdk-lib/core';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as apigw from 'aws-cdk-lib/aws-apigatewayv2';
import * as integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { Construct } from 'constructs';
import * as path from 'path';

export class InfraStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const domainName = this.node.tryGetContext('domainName');
    // Several names can point at the site (cdk.json): the first one is canonical, the others 301 to it
    // (see the redirect function below). One certificate must cover every name.
    const domainNames: string[] = this.node.tryGetContext('domainNames') ?? (domainName ? [domainName] : []);
    const canonicalDomain: string | undefined = domainNames[0];
    // Route 53 zone for the canonical name, when its DNS lives in AWS (houseswipe.uk): CDK adds the alias records.
    const canonicalZoneId: string | undefined = this.node.tryGetContext('canonicalZoneId');
    const certificateArn = this.node.tryGetContext('certificateArn');
    const hostedZoneName = this.node.tryGetContext('hostedZoneName');
    const hostedZoneId = this.node.tryGetContext('hostedZoneId');
    if (domainNames.length > 0 && !certificateArn) {
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
      // Versioning: an overwritten or pruned object is recoverable instead of gone
      // (a deploy from stale local data once overwrote a finished refresh). Old
      // versions are kept 14 days, which bounds the cost — the ~150MB working
      // embeddings are rewritten daily.
      versioned: true,
      lifecycleRules: [
        {
          noncurrentVersionExpiration: cdk.Duration.days(14),
          abortIncompleteMultipartUploadAfter: cdk.Duration.days(2),
          expiredObjectDeleteMarker: true,
        },
      ],
    });

    // Any host other than the canonical one gets a permanent redirect to the same path and query on the canonical host (www.), or
    // serves the app so it can hand the visitor's data over first (the old address; see below), so old links, shared-list links
    // (?board=...) and bookmarks keep working.
    // Names that must serve the app instead of redirecting: the old address, whose copy of the app carries the visitor's saved
    // data (localStorage is per address) over to the canonical address before leaving (frontend/src/lib/handoff.ts).
    const handoffHosts = domainNames.filter((d) => d !== canonicalDomain && !d.startsWith('www.'));
    const redirectFunction = canonicalDomain
      ? new cloudfront.Function(this, 'RedirectToCanonicalHost', {
          comment: 'Redirect every other host name to the canonical one',
          code: cloudfront.FunctionCode.fromInline(`
function handler(event) {
  var request = event.request;
  var host = request.headers.host ? request.headers.host.value : '';
  if (host === '${canonicalDomain}' || ${JSON.stringify(handoffHosts)}.indexOf(host) >= 0) {
    // the app's own pages are one HTML file; anything else that isn't a real file falls through to a real 404 (see errorResponses)
    var uri = request.uri;
    if (/^\\/(privacy|demo)\\/?$/.test(uri) || /^\\/ui(\\d*|\\/codex(\\/[a-z0-9-]+)?)\\/?$/.test(uri)) request.uri = '/index.html';
    else if (/^\\/ui\\/original\\/?$/.test(uri)) request.uri = '/ui/original/index.html';
    return request;
  }
  var parts = [];
  var q = request.querystring || {};
  for (var key in q) {
    var entry = q[key];
    var values = entry.multiValue ? entry.multiValue.map(function (m) { return m.value; }) : [entry.value];
    for (var i = 0; i < values.length; i++) parts.push(values[i] === '' ? key : key + '=' + values[i]);
  }
  var target = 'https://${canonicalDomain}' + request.uri + (parts.length ? '?' + parts.join('&') : '');
  return { statusCode: 301, statusDescription: 'Moved Permanently', headers: { location: { value: target } } };
}`),
          runtime: cloudfront.FunctionRuntime.JS_2_0,
        })
      : undefined;

    const boardApi = new lambda.Function(this, 'BoardApi', {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../board-api')),
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      environment: { FIREBASE_ADMIN_PARAMETER: '/housefinder/firebase-admin' },
    });
    boardApi.addToRolePolicy(new iam.PolicyStatement({
      actions: ['ssm:GetParameter'],
      resources: [`arn:aws:ssm:${this.region}:${this.account}:parameter/housefinder/firebase-admin`],
    }));
    const boardHttpApi = new apigw.HttpApi(this, 'BoardHttpApi', { createDefaultStage: true });
    const boardIntegration = new integrations.HttpLambdaIntegration('BoardIntegration', boardApi);
    boardHttpApi.addRoutes({ path: '/api/boards', methods: [apigw.HttpMethod.POST], integration: boardIntegration });
    boardHttpApi.addRoutes({ path: '/api/boards/{id}', methods: [apigw.HttpMethod.GET, apigw.HttpMethod.DELETE], integration: boardIntegration });
    // The public create route is intentionally small, but still throttle it to limit abuse.
    const stage = boardHttpApi.defaultStage?.node.defaultChild as apigw.CfnStage;
    stage.defaultRouteSettings = { throttlingBurstLimit: 20, throttlingRateLimit: 5 };
    const apiHost = cdk.Fn.select(2, cdk.Fn.split('/', boardHttpApi.apiEndpoint));

    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      comment: 'House Swipe frontend',
      domainNames: domainNames.length > 0 ? domainNames : undefined,
      certificate,
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(bucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        functionAssociations: redirectFunction
          ? [{ function: redirectFunction, eventType: cloudfront.FunctionEventType.VIEWER_REQUEST }]
          : undefined,
      },
      defaultRootObject: 'index.html',
      additionalBehaviors: {
        'api/*': {
          origin: new origins.HttpOrigin(apiHost),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        },
      },
      // A path that is neither a file nor one of the app's pages (the function above rewrites those) is a real 404, so search engines
      // don't index made-up addresses. The body is still the app, which shows its own "page not found" screen.
      errorResponses: [
        { httpStatus: 403, responseHttpStatus: 404, responsePagePath: '/index.html' },
        { httpStatus: 404, responseHttpStatus: 404, responsePagePath: '/index.html' },
      ],
    });

    if (canonicalDomain && canonicalZoneId) {
      // houseswipe.uk and www.houseswipe.uk both point at CloudFront (IPv4 and IPv6); www then redirects to the apex.
      const zone = route53.HostedZone.fromHostedZoneAttributes(this, 'CanonicalZone', { hostedZoneId: canonicalZoneId, zoneName: canonicalDomain });
      const target = route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(distribution));
      new route53.ARecord(this, 'CanonicalA', { zone, target });
      new route53.AaaaRecord(this, 'CanonicalAaaa', { zone, target });
      new route53.ARecord(this, 'WwwA', { zone, recordName: 'www', target });
      new route53.AaaaRecord(this, 'WwwAaaa', { zone, recordName: 'www', target });
    }

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
      // The default 128MB / 512MB-disk copier function can't unzip the embeddings
      // file once it grows past a few tens of MB: it dies without answering
      // CloudFormation, which then waits an hour before failing the deploy.
      memoryLimit: 1024,
      ephemeralStorageSize: cdk.Size.gibibytes(2),
      // inbox/ holds pre-scraped results uploaded by the dev host's cron
      // (see scraper/refresh.py --dump); cache/ holds a CI run's checkpoint
      // analytics/ the permanent listing history and work/ the full embeddings working store, alerts/ the pending/handled health alerts (see the workflow), killswitch.json the agency kill switch (scraper/killswitch.py). Without this, prune would delete them on deploy.
      exclude: ['inbox/*', 'cache/*', 'analytics/*', 'work/*', 'alerts/*', 'killswitch.json'],
    });

    new cdk.CfnOutput(this, 'CloudFrontDomain', { value: distribution.distributionDomainName });
    if (canonicalDomain) {
      new cdk.CfnOutput(this, 'CustomUrl', { value: `https://${canonicalDomain}` });
    }
    new cdk.CfnOutput(this, 'BucketName', { value: bucket.bucketName });
    new cdk.CfnOutput(this, 'DistributionId', { value: distribution.distributionId });
  }
}
