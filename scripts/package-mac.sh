#!/usr/bin/env sh
set -eu

cd "$(dirname "$0")/.."

repo_root="$(pwd -P)"
package_proxy="${PACKAGE_PROXY:-}"
electron_mirror="${ELECTRON_MIRROR:-https://npmmirror.com/mirrors/electron/}"
electron_builder_binaries_mirror="${ELECTRON_BUILDER_BINARIES_MIRROR:-https://npmmirror.com/mirrors/electron-builder-binaries/}"

clean_dir() {
  target="$repo_root/$1"

  case "$target" in
    "$repo_root"/*) rm -rf "$target" ;;
    *) printf 'Refusing to remove path outside repo: %s\n' "$target" >&2; exit 1 ;;
  esac
}

run_step() {
  printf '\n==> %s\n' "$1"
  shift
  "$@"
}

printf '==> Electron mirror: %s\n' "$electron_mirror"
printf '==> electron-builder binaries mirror: %s\n' "$electron_builder_binaries_mirror"
export ELECTRON_MIRROR="$electron_mirror"
export ELECTRON_BUILDER_BINARIES_MIRROR="$electron_builder_binaries_mirror"

if [ -n "$package_proxy" ]; then
  printf '==> Packaging proxy: %s\n' "$package_proxy"
  export HTTP_PROXY="$package_proxy"
  export HTTPS_PROXY="$package_proxy"
  export http_proxy="$package_proxy"
  export https_proxy="$package_proxy"
  export npm_config_proxy="$package_proxy"
  export npm_config_https_proxy="$package_proxy"
  export ELECTRON_GET_USE_PROXY=1
else
  printf '==> Packaging proxy: not set\n'
  unset HTTP_PROXY HTTPS_PROXY http_proxy https_proxy npm_config_proxy npm_config_https_proxy ELECTRON_GET_USE_PROXY
fi

export CSC_IDENTITY_AUTO_DISCOVERY=false
printf '==> Code signing auto discovery: disabled\n'

printf '==> Cleaning previous build artifacts\n'
clean_dir out
clean_dir dist

run_step "Type checking" npm run typecheck
run_step "Linting" npm run lint
run_step "Running tests" npm test
run_step "Building Electron app" npm run build
run_step "Packaging macOS x64 and arm64 DMG" node ./node_modules/electron-builder/cli.js --mac --x64 --arm64 --publish never

printf '\nmacOS package complete. Artifacts are in dist/.\n'
