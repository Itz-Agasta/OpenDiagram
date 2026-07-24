# Cleanup all build artifacts and node_modules across the monorepo

# Default: show available recipes
default:
    @just --list

# Full clean: node_modules, .turbo, .next, lockfiles everywhere
clean:
    #!/usr/bin/env bash
    set -euo pipefail
    ROOT="{{ source_file() }}"
    ROOT="$(dirname "$ROOT")"
    echo "Cleaning $ROOT ..."
    find "$ROOT" -name "node_modules" -type d -exec rm -rf {} + 2>/dev/null || true
    find "$ROOT" -name ".turbo" -type d -exec rm -rf {} + 2>/dev/null || true
    find "$ROOT" -name ".next" -type d -exec rm -rf {} + 2>/dev/null || true
    find "$ROOT" -name "dist" -type d -not -path "*/.git/*" -exec rm -rf {} + 2>/dev/null || true
    rm -f "$ROOT/bun.lock" "$ROOT/bun.lockb"
    echo "Done. All artifacts removed."

# Just node_modules
clean-modules:
    #!/usr/bin/env bash
    ROOT="{{ source_file() }}"
    ROOT="$(dirname "$ROOT")"
    find "$ROOT" -name "node_modules" -type d -exec rm -rf {} + 2>/dev/null || true
    echo "node_modules removed."

# Just build caches (.turbo, .next, dist)
clean-cache:
    #!/usr/bin/env bash
    ROOT="{{ source_file() }}"
    ROOT="$(dirname "$ROOT")"
    find "$ROOT" -name ".turbo" -type d -exec rm -rf {} + 2>/dev/null || true
    find "$ROOT" -name ".next" -type d -exec rm -rf {} + 2>/dev/null || true
    find "$ROOT" -name "dist" -type d -not -path "*/.git/*" -exec rm -rf {} + 2>/dev/null || true
    echo "Build caches removed."

# Clean and reinstall
reinstall: clean
    bun install

# Install and build everything
setup: reinstall
    bun run build

# Lint and format (oxlint + oxfmt)
check:
    bun run check

# Lint and format check without writing (CI)
check-ci:
    bunx oxlint --deny-warnings --format github
    bunx oxfmt --check

# Typecheck all packages with tsgo
types:
    bun run check-types

# Harness geometry tests
test:
    cd packages/harness && bun test

# Start web dev server
web:
    bun run dev:web

# Start API server
server:
    bun run dev:server
