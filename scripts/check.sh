#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
python3 -m ruff check apps/api
python3 -m ruff format --check apps/api
PYTHONPATH=apps/api:packages/security python3 -m pytest apps/api/tests
python3 -m unittest discover -s tests -v
PYTHONPATH=packages/security python3 -m unittest discover -s packages/security/tests -v
(cd apps/web && npm run format:check && npm test && npm run build)
node --test extensions/http-metadata/metadata.test.cjs
(cd agent && go test -race ./... && go vet ./...)
