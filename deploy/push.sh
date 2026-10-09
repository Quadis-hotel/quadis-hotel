#!/usr/bin/env bash
#
# Ship the artifact to the box and run the installer.
#
#   ./deploy/build-artifact.sh && ./deploy/push.sh
#
# There is no scp here and there cannot be: the security group
# (sg-0b19531290e391e17) opens 80 and 443 only, no port 22. The artifact goes
# up to S3, and SSM tells the instance to pull and install it. The instance
# role quadis-app-ec2 can read that bucket; nothing on the internet can.
#
# This script does NOT touch DNS. quadishotels.com still resolves to the old
# host until someone changes the A record in the theserverindia panel — see
# AGENTS.md rule 2. Deploying here is safe and reversible for exactly that
# reason: nobody is looking at this box yet.

set -euo pipefail

cd "$(dirname "$0")/.."
PROFILE="${AWS_PROFILE_QUADIS:-quadis-client}"
REGION="ap-south-1"
INSTANCE="i-0d126c49ffdfe1668"
BUCKET="quadis-hotel-photos"

ART="$(ls -t dist-artifact/quadis-*.tar.gz 2>/dev/null | head -1)"
[ -n "$ART" ] || { echo "No artifact. Run ./deploy/build-artifact.sh first." >&2; exit 1; }
KEY="deploys/$(basename "$ART")"

echo "==> Uploading $(basename "$ART") ($(du -h "$ART" | cut -f1))"
# --no-progress as well as --only-show-errors: the latter does not suppress the
# per-chunk "Completed 29.2 MiB/61.7 MiB" lines in AWS CLI v2, which bury the
# rest of the deploy output in thousands of lines of transfer noise.
aws s3 cp "$ART" "s3://$BUCKET/$KEY" --profile "$PROFILE" --region "$REGION" \
  --only-show-errors --no-progress

echo "==> Instructing $INSTANCE to install"
CMD=$(aws ssm send-command \
  --profile "$PROFILE" --region "$REGION" \
  --instance-ids "$INSTANCE" \
  --document-name "AWS-RunShellScript" \
  --comment "quadis deploy $(basename "$ART")" \
  --parameters "commands=[
    'set -euo pipefail',
    'rm -rf /tmp/quadis-deploy && mkdir -p /tmp/quadis-deploy',
    'aws s3 cp s3://$BUCKET/$KEY /tmp/quadis-deploy/a.tar.gz --region $REGION --only-show-errors --no-progress',
    'tar -xzf /tmp/quadis-deploy/a.tar.gz -C /tmp/quadis-deploy',
    'chmod +x /tmp/quadis-deploy/install.sh',
    'bash /tmp/quadis-deploy/install.sh',
    'rm -rf /tmp/quadis-deploy'
  ]" \
  --query 'Command.CommandId' --output text)

echo "    command $CMD"
for i in $(seq 1 60); do
  ST=$(aws ssm get-command-invocation --profile "$PROFILE" --region "$REGION" \
        --command-id "$CMD" --instance-id "$INSTANCE" \
        --query 'Status' --output text 2>/dev/null || echo Pending)
  case "$ST" in
    Success) break ;;
    Failed|Cancelled|TimedOut) break ;;
  esac
  sleep 5
done

echo "==> $ST"
aws ssm get-command-invocation --profile "$PROFILE" --region "$REGION" \
  --command-id "$CMD" --instance-id "$INSTANCE" \
  --query 'StandardOutputContent' --output text 2>/dev/null || true

if [ "$ST" != "Success" ]; then
  echo "--- stderr ---" >&2
  aws ssm get-command-invocation --profile "$PROFILE" --region "$REGION" \
    --command-id "$CMD" --instance-id "$INSTANCE" \
    --query 'StandardErrorContent' --output text >&2 2>/dev/null || true
  exit 1
fi

echo
echo "==> Public check"
# Health check must follow the certbot restructure.
#
# certbot --redirect rewrites the port-80 server block to redirect only the two
# real hostnames and end with `return 404` for everything else — so once the
# certificate is installed, http://13.234.85.127/healthz returns 404, not 200.
# This check used `curl -fsS` on exactly that URL, so post-cutover every deploy
# would fail its own health check for a reason that has nothing to do with the
# deploy. Ask over HTTPS with the real hostname when the domain is live here,
# and fall back to the raw IP over HTTP before cutover.
if [ "$(dig @1.1.1.1 +short A quadishotels.com +time=5 2>/dev/null | tail -1)" = "13.234.85.127" ]; then
  curl -fsS -m 10 --resolve www.quadishotels.com:443:13.234.85.127 \
    "https://www.quadishotels.com/healthz" >/dev/null && echo "    healthz ok (https)"
else
  curl -fsS -m 8 "http://13.234.85.127/healthz" >/dev/null && echo "    healthz ok (http, pre-cutover)"
fi

# HTTPS check, once the domain is live on this box.
#
# This exists because "Deploy complete" used to print over a site that had just
# lost HTTPS: the deploy overwrites the nginx config certbot wrote its TLS into,
# and every check here only ever spoke HTTP, so nothing noticed. Checked against
# the real hostname with --resolve so a stale local DNS cache cannot mask it.
if [ "$(dig @1.1.1.1 +short A quadishotels.com +time=5 2>/dev/null | tail -1)" = "13.234.85.127" ]; then
  HTTPS_CODE="$(curl -s -o /dev/null -w '%{http_code}' -m 15 \
    --resolve www.quadishotels.com:443:13.234.85.127 \
    https://www.quadishotels.com/ 2>/dev/null || echo 000)"
  if [ "$HTTPS_CODE" = "200" ]; then
    echo "    https   ok (live site)"
  else
    echo >&2
    echo "FATAL: the domain points here but https://www.quadishotels.com returned $HTTPS_CODE." >&2
    echo "       The live site is DOWN over HTTPS. Most likely this deploy overwrote" >&2
    echo "       the TLS config; re-apply it with:" >&2
    echo "         certbot install --nginx --cert-name quadishotels.com --non-interactive --redirect" >&2
    exit 1
  fi
fi
echo "    site:      http://13.234.85.127/"
echo "    a redirect: curl -sI http://13.234.85.127/hotel-amar-inn/deluxe-room | head -2"
