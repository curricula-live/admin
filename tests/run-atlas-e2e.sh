#!/bin/bash
# Disposable local staging rehearsal. Never accepts an external DATABASE_URL.
set -euo pipefail
admin_root="$(cd "$(dirname "$0")/.." && pwd)"
workspace_root="$(dirname "$admin_root")"
api_root="$workspace_root/api"
data_root="$workspace_root/data"
work_dir="$(mktemp -d /tmp/curricula-atlas-e2e.XXXXXX)"
container_name="curricula-atlas-e2e-$$"
cleanup() { docker rm -f "$container_name" >/dev/null 2>&1 || true; rm -rf "$work_dir"; }
trap cleanup EXIT
export UV_CACHE_DIR=/workspace/.cache/uv
export npm_config_cache=/workspace/.cache/npm
cd "$api_root"
uv sync --frozen --dev
cd "$data_root"
[ -x .venv/bin/python ] || uv venv .venv
uv pip install --python .venv/bin/python -r requirements.txt
cd "$admin_root"
npm ci --no-audit --no-fund
docker run --rm -d --name "$container_name" -e POSTGRES_USER=curricula -e POSTGRES_DB=atlas_e2e -e POSTGRES_HOST_AUTH_METHOD=trust -p 127.0.0.1:54339:5432 postgres:17 >/dev/null
ready=false
for attempt in {1..60}; do
  if docker exec "$container_name" pg_isready -U curricula -d atlas_e2e >/dev/null 2>&1; then ready=true; break; fi
  sleep 1
done
[ "$ready" = true ] || { echo 'Local PostgreSQL was not ready' >&2; exit 1; }
for migration in 0001_knowledge_core.sql 0002_admin_owner.sql 0003_owner_mail_outbox.sql 0004_knowledge_release.sql; do
  docker exec -i "$container_name" psql -U curricula -d atlas_e2e -v ON_ERROR_STOP=1 < "$data_root/database/migrations/$migration" >/dev/null
done
docker exec "$container_name" psql -U curricula -d atlas_e2e -v ON_ERROR_STOP=1 -c "insert into admin.owner_principal(id,email,role,active) values ('c74fe051-ac5e-521b-8770-3180fb0decb6','owner-e2e@example.invalid','owner',true)" >/dev/null
local_dsn=postgresql://curricula@127.0.0.1:54339/atlas_e2e
cd "$data_root"
.venv/bin/python scripts/publish.py --database-url "$local_dsn" apply --confirm-publish PUBLISH > "$work_dir/publish.log"
.venv/bin/python -m scripts.stamp_publication --database-url "$local_dsn" --confirm STAMP-VERIFIED-PUBLICATION > "$work_dir/stamp.log"
release_commit="$(git rev-parse HEAD)"
cat > "$work_dir/psql" <<'WRAPPER'
#!/bin/bash
set -euo pipefail
[ "${1:-}" = 'postgresql://curricula@127.0.0.1:54339/atlas_e2e' ] || exit 2
shift
exec docker exec "$ATLAS_E2E_CONTAINER" psql -U curricula -d atlas_e2e "$@"
WRAPPER
chmod +x "$work_dir/psql"
openssl req -x509 -newkey rsa:2048 -nodes -sha256 -days 1 \
  -keyout "$work_dir/key.pem" -out "$work_dir/cert.pem" -subj '/CN=localhost' \
  -addext 'subjectAltName=DNS:localhost,IP:127.0.0.1' >/dev/null 2>&1
chmod 600 "$work_dir/key.pem"
export PATH="$work_dir:$PATH"
export ATLAS_E2E_CONTAINER="$container_name"
export DATABASE_URL="$local_dsn"
export DJANGO_SECRET_KEY="$(openssl rand -hex 48)"
export API_REPO_DIR="$api_root"
export DATA_REPO_DIR="$data_root"
export ATLAS_PUBLIC_API_ORIGIN=http://127.0.0.1:8000
export ATLAS_PUBLIC_RELEASE_COMMIT="$release_commit"
export PUBLIC_V2_ENABLED=true
export PUBLIC_V2_RELEASE_COMMIT="$release_commit"
export OWNER_E2E_ATLAS_RELEASE=true
export OWNER_E2E_TRANSPORT=https
export OWNER_E2E_MAIL_TRANSPORT=smtp
export OWNER_E2E_TLS_CERT="$work_dir/cert.pem"
export OWNER_E2E_TLS_KEY="$work_dir/key.pem"
export NODE_EXTRA_CA_CERTS="$work_dir/cert.pem"
if command -v chromium >/dev/null 2>&1; then export OWNER_E2E_CHROMIUM="$(command -v chromium)"; fi
cd "$admin_root"
node tests/owner-auth-real-stack.e2e.mjs
