#!/usr/bin/env bash
# Build and test the AgentVault contracts, then export the WASM artifacts.
#
# Local path (Rust installed):
#   scripts/build-contract.sh
#
# Docker path (no Rust on the host):
#   scripts/build-contract.sh --docker
#
# Output: build/contracts/vault.wasm and build/contracts/mock_ft.wasm
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="${CONTRACT_OUT:-$ROOT/build/contracts}"
MODE="auto"

for arg in "$@"; do
  case "$arg" in
    --docker) MODE="docker" ;;
    --local) MODE="local" ;;
    -h|--help)
      sed -n '2,12p' "$0"
      exit 0
      ;;
    *)
      echo "unknown argument: $arg" >&2
      exit 1
      ;;
  esac
done

if [ "$MODE" = "auto" ]; then
  if command -v cargo >/dev/null 2>&1; then
    MODE="local"
  else
    MODE="docker"
  fi
fi

if [ "$MODE" = "local" ]; then
  command -v cargo >/dev/null 2>&1 || {
    echo "cargo is not installed; re-run with --docker" >&2
    exit 1
  }
  if command -v rustup >/dev/null 2>&1; then
    rustup target add wasm32-unknown-unknown >/dev/null
  fi

  echo "==> cargo test"
  cargo test --manifest-path "$ROOT/contracts/Cargo.toml"

  echo "==> cargo build (wasm32-unknown-unknown, release)"
  cargo build \
    --manifest-path "$ROOT/contracts/Cargo.toml" \
    --target wasm32-unknown-unknown \
    --release

  TARGET_DIR="$ROOT/contracts/target/wasm32-unknown-unknown/release"
  mkdir -p "$OUT"
  cp "$TARGET_DIR/agentvault_vault.wasm" "$OUT/vault.wasm"
  cp "$TARGET_DIR/agentvault_mock_ft.wasm" "$OUT/mock_ft.wasm"
else
  command -v docker >/dev/null 2>&1 || {
    echo "docker is not installed; install Rust or Docker" >&2
    exit 1
  }

  echo "==> docker build + cargo test + wasm export"
  mkdir -p "$OUT"
  docker build \
    -f "$ROOT/Dockerfile.contract" \
    --target export \
    --output "type=local,dest=$OUT" \
    "$ROOT"
fi

echo ""
echo "Artifacts written to $OUT"
ls -lh "$OUT"
