#!/bin/sh
# Optional local database for development; use DATABASE_URL for an external server.
set -eu
cd "$(dirname "$0")/.."

for executable in initdb pg_ctl pg_isready psql createdb; do
  if ! command -v "$executable" >/dev/null 2>&1; then
    echo "Missing $executable. Install PostgreSQL, or use an existing DATABASE_URL." >&2
    exit 1
  fi
done

mkdir -p .runtime
if [ ! -f .runtime/postgres/PG_VERSION ]; then
  initdb -D .runtime/postgres -U praktikum --auth-local=trust --auth-host=trust --encoding=UTF8 --no-locale
fi

if ! pg_ctl -D .runtime/postgres status >/dev/null 2>&1; then
  if pg_isready -h 127.0.0.1 -p 55432 >/dev/null 2>&1; then
    echo "Port 55432 already has a PostgreSQL server. Set DATABASE_URL for it, or free this port." >&2
    exit 1
  fi
  pg_ctl -D .runtime/postgres -l .runtime/postgres.log -o '-h 127.0.0.1 -p 55432' start
fi

if [ "$(psql -h 127.0.0.1 -p 55432 -U praktikum -d postgres -Atqc "SELECT 1 FROM pg_database WHERE datname = 'praktikum'")" != 1 ]; then
  createdb -h 127.0.0.1 -p 55432 -U praktikum praktikum
fi

echo 'Local database ready: postgresql://praktikum@127.0.0.1:55432/praktikum?schema=public'
echo 'Development only: local trust authentication; listens on 127.0.0.1.'
