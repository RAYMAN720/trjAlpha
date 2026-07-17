#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
docker build --pull -t tradepilot-lean-engine:latest ./lean-engine
docker image inspect tradepilot-lean-engine:latest >/dev/null
echo "Built tradepilot-lean-engine:latest"
