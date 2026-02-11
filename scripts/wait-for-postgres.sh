#!/bin/bash
# Wait for PostgreSQL to be ready
# Usage: ./scripts/wait-for-postgres.sh [host] [port] [user] [database]

HOST=${1:-localhost}
PORT=${2:-5444}
USER=${3:-test-user}
DATABASE=${4:-test-db}

echo "Waiting for PostgreSQL to be ready at $HOST:$PORT..."

until PGPASSWORD=test-password psql -h "$HOST" -p "$PORT" -U "$USER" -d "$DATABASE" -c '\q' 2>/dev/null; do
  echo "PostgreSQL is unavailable - sleeping"
  sleep 1
done

echo "PostgreSQL is ready!"
