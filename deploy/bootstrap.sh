#!/bin/bash
# Quadis app server bootstrap — Amazon Linux 2023, ap-south-1.
#
# Runs once as EC2 user-data on first boot. Everything here is idempotent
# enough to re-run by hand if it fails halfway; output lands in
# /var/log/cloud-init-output.log.
#
# Shape: ONE box. nginx in front, Node app behind it, Postgres on the same
# instance. No RDS, no load balancer, no CloudFront — see AGENTS.md for why
# (short version: CloudFront has no static IP, which is what forced the
# nameserver move that put her email at risk).
#
# Shell access is via SSM Session Manager, so port 22 is never opened and
# there is no key to lose:  aws ssm start-session --target <instance-id>

set -euxo pipefail

# ---------------------------------------------------------------------------
# Swap. AGENTS.md incident 6: the previous box wedged under memory pressure
# and took the API down for 30 minutes while every health check stayed green.
# 4 GiB of RAM makes that much less likely; swap means a spike degrades into
# slowness rather than an OOM kill. Costs nothing but disk.
# ---------------------------------------------------------------------------
if [ ! -f /swapfile ]; then
  dd if=/dev/zero of=/swapfile bs=1M count=2048
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

dnf update -y
dnf install -y nginx nodejs20 npm postgresql16 postgresql16-server \
               certbot python3-certbot-nginx awscli-2 cronie git

systemctl enable --now crond

# ---------------------------------------------------------------------------
# Postgres
# ---------------------------------------------------------------------------
if [ ! -d /var/lib/pgsql/data/base ]; then
  postgresql-setup --initdb
fi
systemctl enable --now postgresql

# Pinned, not read from instance metadata. The metadata route needs an IMDSv2
# token because the instance is launched with HttpTokens=required, and a plain
# IMDSv1 curl returns an EMPTY string rather than failing — which produced
# `--region ""`, an "Invalid endpoint: https://ssm..amazonaws.com", and under
# `set -e` killed the whole bootstrap before nginx was ever installed. The
# deployment is region-pinned everywhere else anyway.
REGION=ap-south-1

# `set +x` around the password: with tracing on, the generated secret is
# echoed verbatim into /var/log/cloud-init-output.log, which is world-readable
# on the box and survives reboots. It goes to SSM Parameter Store as a
# SecureString and nowhere else — AGENTS.md records that the last set of
# secrets lived only inside a Beanstalk config and would have died with it.
set +x
DB_PASS="$(openssl rand -base64 24 | tr -d '/+=' | head -c 32)"
if sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='quadis'" | grep -q 1; then
  sudo -u postgres psql -qc "ALTER ROLE quadis PASSWORD '${DB_PASS}'"
else
  sudo -u postgres psql -qc "CREATE ROLE quadis LOGIN PASSWORD '${DB_PASS}'"
fi
aws ssm put-parameter --region "$REGION" --name /quadis/db-password \
  --value "$DB_PASS" --type SecureString --overwrite > /dev/null
unset DB_PASS
set -x

sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='quadis'" \
  | grep -q 1 || sudo -u postgres createdb -O quadis quadis

# Local-only. Postgres listens on loopback and nothing else, so there is no
# database port exposed to the network at all — the thing that needed a
# security group and a TLS CA bundle on the old setup is now a non-problem.
#
# INSERTED ABOVE the stock rules, not appended. pg_hba.conf is first-match-wins
# and Amazon Linux ships `host all all 127.0.0.1/32 ident` at line 115. An
# appended scram-sha-256 rule sits below that and is never evaluated, so the
# app authenticates as ident, fails with 'Ident authentication failed for user
# "quadis"', and — because migrate.ts refuses to boot on a failed migration —
# the API dies on start while nginx keeps serving the frontend perfectly.
# Cost one deploy on 31 Jul to find. Idempotent: the grep -v drops any previous
# copy before reinserting.
HBA=/var/lib/pgsql/data/pg_hba.conf
grep -v '^host quadis quadis 127\.0\.0\.1/32 scram-sha-256$' "$HBA" > /tmp/hba.new
awk '!done && /^host[[:space:]]+all[[:space:]]+all[[:space:]]+127\.0\.0\.1\/32/ {
       print "host    quadis          quadis          127.0.0.1/32            scram-sha-256";
       done=1
     } { print }' /tmp/hba.new > "$HBA"
chown postgres:postgres "$HBA"; chmod 600 "$HBA"
rm -f /tmp/hba.new
systemctl restart postgresql

# ---------------------------------------------------------------------------
# Nightly backup. The cost message promises "roz ka backup" and Hostinger's
# weekly-only tier is what made that a promise we had to build. pg_dump to S3
# costs effectively nothing.
# ---------------------------------------------------------------------------
cat > /usr/local/bin/quadis-backup.sh <<'BACKUP'
#!/bin/bash
set -euo pipefail
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FILE="/tmp/quadis-${STAMP}.sql.gz"
sudo -u postgres pg_dump quadis | gzip > "$FILE"
aws s3 cp "$FILE" "s3://quadis-hotel-photos/backups/quadis-${STAMP}.sql.gz" \
  --region ap-south-1
rm -f "$FILE"
# Keep 30 days. Without this the bucket grows forever and the backup quietly
# becomes the largest line on the bill.
CUTOFF="$(date -u -d '30 days ago' +%Y%m%d)"
aws s3 ls s3://quadis-hotel-photos/backups/ --region ap-south-1 \
  | awk '{print $4}' | while read -r f; do
      d="$(echo "$f" | sed -n 's/quadis-\([0-9]\{8\}\)T.*/\1/p')"
      [ -n "$d" ] && [ "$d" -lt "$CUTOFF" ] && \
        aws s3 rm "s3://quadis-hotel-photos/backups/$f" --region ap-south-1
    done
BACKUP
chmod +x /usr/local/bin/quadis-backup.sh
echo "15 2 * * * root /usr/local/bin/quadis-backup.sh >> /var/log/quadis-backup.log 2>&1" \
  > /etc/cron.d/quadis-backup

# ---------------------------------------------------------------------------
# nginx. The real config and the legacy 301s are deployed with the app; this
# is only enough to answer health checks and let certbot complete.
# ---------------------------------------------------------------------------
mkdir -p /var/www/quadis /etc/nginx/snippets
cat > /etc/nginx/conf.d/quadis.conf <<'NGINX'
server {
    listen 80 default_server;
    server_name _;
    root /var/www/quadis;
    index index.html;

    location /healthz { return 200 "ok\n"; add_header Content-Type text/plain; }

    location /api/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Legacy URLs from the client's existing site. MUST be included before the
    # SPA fallback below, or index.html answers first and no redirect fires.
    include /etc/nginx/snippets/legacy-redirects.conf;

    location / { try_files $uri /index.html; }
}
NGINX
touch /etc/nginx/snippets/legacy-redirects.conf
nginx -t
systemctl enable --now nginx

echo "BOOTSTRAP COMPLETE $(date -u)" > /var/log/quadis-bootstrap-done
