#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
PYTHONPATH=apps/api python3 -m pytest apps/api/tests
python3 -m unittest discover -s tests -v
(cd apps/web && npm test && npm run build)
(cd agent && go test -race ./... && go vet ./...)
