#!/bin/sh
# Secret-scan hook: block commits containing private keys / tokens.
# Gitleaks if available, otherwise a regex fallback.
if command -v gitleaks >/dev/null 2>&1; then
  gitleaks detect --no-git --verbose || exit 1
  exit 0
fi
PATTERNS='"private_key"\s*:\s*"ed25519:|(^|[^a-zA-Z_])PRIVATE_KEY\s*=\s*\S+|sk-[A-Za-z0-9\-_]{20,}|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]{10,}'
FOUND=$(git diff --cached --unified=0 --diff-filter=ACM 2>/dev/null | grep -E "^\+.*($PATTERNS)" || true)
if [ -n "$FOUND" ]; then
  echo "Secret scan FAILED: possible secret in staged changes. Remove it and retry."
  echo "$FOUND" | cut -c1-120
  exit 1
fi
echo "Secret scan passed."
