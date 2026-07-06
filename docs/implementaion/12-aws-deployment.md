# 12 — AWS Deployment & Operations Plan

**Module:** AWS Deployment & Operations
**Status:** Ready for Implementation
**Dependencies:** RFC-11 Research Workbench

---

## 1. Purpose

RFC-12 defines how the AI Code Review Experiment Platform is deployed and operated on AWS.

The goal is not to build a large production system. The goal is to make the research platform accessible, reproducible, and able to use Amazon Bedrock safely.

---

## 2. Deployment Strategy

Use a staged AWS deployment.

```text
Phase 1 — Local execution + Bedrock
Phase 2 — Hosted Workbench
Phase 3 — Persistent AWS storage
Phase 4 — Optional async workers
```

Implement only the smallest deployment needed for research.

---

## 3. Recommended Phase 1

Keep experiment execution local.

Use:

* local Node.js execution
* local/in-memory repositories
* Amazon Bedrock via AWS SDK
* CSV/JSON export from RFC-10

This is already enough to run experiments for the paper.

---

## 4. Recommended Phase 2

Deploy the simple Research Workbench UI.

Recommended service:

* AWS Amplify Hosting

Amplify supports deploying Next.js applications, including SSR apps, from a connected Git repository.

The hosted UI should remain presentation-only.

---

## 5. Bedrock Access

The platform should access Bedrock through:

```text
AWS SDK v3
Bedrock Runtime Client
Converse API
```

The Converse API provides a consistent message interface for supported Bedrock models.

No AWS credentials should be stored in source code.

---

## 6. Credential Strategy

Local development should use the AWS SDK default credential provider chain.

Preferred local setup:

```bash
aws configure sso
```

or:

```bash
aws configure
```

For deployed workloads, use IAM roles.

Do not provide AWS keys to AI agents.

Do not commit `.env` files containing credentials.

---

## 7. Minimum AWS Resources

Phase 2 minimum:

```text
Amplify Hosting
Bedrock model access
IAM permissions for Bedrock invoke
```

Optional later:

```text
S3
DynamoDB
Lambda
Step Functions
CloudWatch
```

---

## 8. IAM Policy Scope

Use least privilege.

For local smoke tests and deployed backend calls, allow only Bedrock model invocation.

Example policy shape:

```json
{
  "Effect": "Allow",
  "Action": [
    "bedrock:InvokeModel",
    "bedrock:InvokeModelWithResponseStream"
  ],
  "Resource": "*"
}
```

If using Converse API and the SDK requires additional action names for the selected model/provider, verify against current AWS documentation before implementation.

---

## 9. Lambda Consideration

AWS Lambda has a maximum function timeout of 900 seconds, or 15 minutes.

This is enough for small experiments, but long batch runs may exceed it.

Therefore:

* do not run large experiment batches inside a synchronous web request
* keep local batch execution for now
* use async workers only if needed

---

## 10. Optional Async Execution

If experiments become too slow for local/manual execution, add:

```text
API request
  ↓
Queue / Step Functions
  ↓
Worker
  ↓
Storage
  ↓
Workbench
```

This is optional.

Do not implement it unless experiment runs become unreliable.

---

## 11. Optional Persistent Storage

If the team needs persistence beyond local memory, add:

```text
DynamoDB — experiment metadata/results
S3 — raw diffs, raw LLM outputs, exports
```

This should be a separate implementation task.

Do not mix deployment with storage migration unless required.

---

## 12. Cost Controls

Required:

* set AWS budget alert
* track Bedrock usage
* keep smoke tests tiny
* prefer mock provider in unit tests
* never run Bedrock in `npm test`

AWS promotional credits may offset eligible AWS service charges, depending on credit terms.

---

## 13. Environment Variables

Recommended:

```text
AWS_REGION
BEDROCK_MODEL_ID
LLM_PROVIDER
```

Do not store secrets in committed files.

---

## 14. Deployment Modes

### Local Research Mode

Used for actual experimentation.

```text
node scripts/demo-*.ts
npm run demo:agentless
npm run demo:hierarchical
npm run demo:consensus
```

### Hosted Workbench Mode

Used for demo and visualization.

```text
Amplify-hosted frontend
  ↓
Workbench API / sample data
```

### Future Cloud Execution Mode

Used only if needed.

```text
Amplify UI
  ↓
API Gateway / Lambda
  ↓
Worker
  ↓
Bedrock
  ↓
DynamoDB/S3
```

---

## 15. Acceptance Criteria

* [ ] AWS region configured
* [ ] Bedrock model access enabled
* [ ] Bedrock smoke test passes
* [ ] Workbench UI can be hosted or prepared for hosting
* [ ] No credentials committed
* [ ] Unit tests still use mocks
* [ ] `npm run check` passes
* [ ] README documents local AWS setup

---

## 16. Out of Scope

Do not implement unless explicitly needed:

* Step Functions
* DynamoDB migration
* S3 artifact storage
* authentication
* multi-user access
* production hardening

---

## 17. Recommended Implementation Order

```text
1. Confirm Bedrock model access
2. Add AWS setup docs
3. Add deployment README
4. Add simple hosted Workbench build
5. Add Amplify Hosting
6. Add persistence/async execution only if needed
```

---

## Summary

RFC-12 deploys the research platform pragmatically.

The recommended path is local experiment execution with Bedrock, plus a simple hosted Research Workbench for demo purposes. More complex AWS services such as DynamoDB, S3, Lambda workers, and Step Functions should be added only when the research workflow requires them.
