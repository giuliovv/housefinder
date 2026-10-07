#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib/core';
import { InfraStack } from '../lib/infra-stack';
import { CiStack } from '../lib/ci-stack';

const app = new cdk.App();
const env = { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION ?? 'us-east-1' };
new InfraStack(app, 'HousefinderFrontend', { env });
new CiStack(app, 'HousefinderCi', { env });
