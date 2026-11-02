#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
PYTHONPATH=apps/api:packages/security python3 -m pytest apps/api/tests
python3 -m unittest discover -s tests -v
PYTHONPATH=packages/security python3 -m unittest discover -s packages/security/tests -v
(cd apps/web && npm test && npm run build)
(cd agent && go test -race ./... && go vet ./...)
