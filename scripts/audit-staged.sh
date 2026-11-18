#!/usr/bin/env bash
set -euo pipefail

# Resolve these before leaving the hook's working directory, including any
# temporary GIT_INDEX_FILE supplied by git commit.
index=$(git rev-parse --path-format=absolute --git-path index)
objects=$(git rev-parse --path-format=absolute --git-path objects)
git_dir=$(git rev-parse --absolute-git-dir)
git_env=$(git rev-parse --local-env-vars)
format=$(git rev-parse --show-object-format)
scratch=$(mktemp -d "${TMPDIR:-/tmp}/frontx-audit-staged.XXXXXXXX")
trap 'rm -rf -- "$scratch"' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

(
  while IFS= read -r variable; do unset "$variable"; done <<< "$git_env"
  export GIT_CONFIG_NOSYSTEM=1 GIT_CONFIG_GLOBAL=/dev/null
  git init -q --template= --object-format="$format" "$scratch/repo"
  cd "$scratch/repo"

  printf '%s\n' "$objects" > .git/objects/info/alternates
  cp -- "$index" .git/index
  # Git can refresh split-index timestamps while reading them.
  for shared_index in "$git_dir"/sharedindex.*; do
    if [[ -f "$shared_index" ]]; then cp -- "$shared_index" .git/; fi
  done
  tree=$(git write-tree)

  git ls-tree -r "$tree" > "$scratch/tree"
  if grep -q '^160000 ' "$scratch/tree"; then
    echo "Cannot audit a staged snapshot containing gitlinks" >&2
    exit 1
  fi
  git read-tree "$tree"
  git checkout-index --all
  npm ci
  npm run build:packages
  npm run audit:production -- --output-dir "$scratch/audit"
)
