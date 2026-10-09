#!/usr/bin/env bash
# ==============================================================================
# RETIRED 31 Jul 2026 — DO NOT RUN. Kept as the record of the S3/CloudFront era.
# ==============================================================================
#
# Three things in here are now wrong:
#
#   1. It targets `quadis-hotels-frontend-1784969986`, a bucket that was
#      deliberately DELETED as stale around 27 Jul. Line 41 is `s3 mb ... || true`,
#      so running this RECREATES the dead bucket and silently syncs the build
#      into it — a deploy that reports success and changes nothing anyone sees.
#   2. It is `us-east-1`. Production is `ap-south-1` on the client's own account.
#   3. It never invalidates CloudFront, so even against a live bucket the old
#      bundle keeps being served.
#
# Production deploy today is one EC2 box, and the artifact is assembled rather
# than synced:
#
#     ./deploy/build-artifact.sh     # only www/ api/ nginx/ systemd/
#     ./deploy/push.sh               # S3 + SSM; the box has no port 22
#     ./deploy/cutover.sh            # on the day DNS moves
#
# See AGENTS.md §3b. This file is referenced from docs/DEPLOYMENT.md, which now
# points at the above instead.
set -e

cat >&2 <<'RETIRED'
REFUSING TO RUN — scripts/aws-deploy.sh is retired.

It deploys to an S3 bucket that no longer exists, in the wrong region, for an
architecture that was replaced. Use:

    ./deploy/build-artifact.sh && ./deploy/push.sh

Read the header of this file, or AGENTS.md 3b, for the full reason.
RETIRED
exit 1

echo "=== Quadis AWS Deployment verification ==="
echo "Checking AWS IAM identity and permissions..."

IDENTITY=$(aws sts get-caller-identity --output json 2>/dev/null || echo "ERROR")
if [ "$IDENTITY" = "ERROR" ]; then
  echo "❌ Error: AWS CLI is not authenticated or unable to reach AWS STS."
  echo "Run: aws configure"
  exit 1
fi

USER_ARN=$(echo "$IDENTITY" | grep -o '"Arn": "[^"]*' | cut -d'"' -f4)
echo "✅ Authenticated as: $USER_ARN"

# Test EC2 / VPC read permission
echo "Testing VPC & Security Group access..."
if ! aws ec2 describe-vpcs --max-items 1 >/dev/null 2>&1; then
  echo "❌ AccessDenied: Your IAM user ($USER_ARN) does not have permission for EC2/VPC operations (ec2:DescribeVpcs)."
  echo "To automate deployment via CLI, please attach the 'AdministratorAccess' or 'PowerUserAccess' managed policy to your IAM user in the AWS Console."
  exit 1
fi

# Test S3 read permission
echo "Testing S3 access..."
if ! aws s3 ls >/dev/null 2>&1; then
  echo "❌ AccessDenied: Your IAM user does not have permission for S3 operations (s3:ListAllMyBuckets)."
  echo "Please attach S3 permissions or AdministratorAccess."
  exit 1
fi

echo "✅ All IAM permissions verified! Proceeding with infrastructure creation..."

# 1. Create S3 Bucket for Frontend
BUCKET_NAME="quadis-hotels-frontend-1784969986"
echo "Creating/Using S3 Bucket: $BUCKET_NAME in us-east-1..."
aws s3 mb "s3://$BUCKET_NAME" --region us-east-1 || true

# 2. Build and sync Frontend
echo "Building Frontend bundle..."
npm run build
aws s3 sync dist/ "s3://$BUCKET_NAME" --delete

# index.html must never be cached. Vite fingerprints every asset, so the bundles
# are safe to cache forever — but if the browser holds a stale index.html it
# keeps requesting the OLD bundle names and the deploy looks like it did nothing.
aws s3 cp dist/index.html "s3://$BUCKET_NAME/index.html" \
  --cache-control "no-cache, no-store, must-revalidate" \
  --content-type "text/html"

echo "✅ Frontend deployed to S3 ($BUCKET_NAME). Configure CloudFront or Static Website Hosting next."
