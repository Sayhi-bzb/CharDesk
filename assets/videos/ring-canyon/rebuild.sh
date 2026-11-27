#!/bin/sh
set -eu

asset=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
repo=$(CDPATH= cd -- "$asset/../../.." && pwd)
out=${1:-$asset}
mkdir -p "$out" "$repo/.tmp"
out=$(CDPATH= cd -- "$out" && pwd)
work=$(mktemp -d "$repo/.tmp/ring-canyon-rebuild.XXXXXX")
trap 'rm -rf -- "$work"' EXIT

mkdir -p "$work/source" "$work/png" "$work/build/module-cache"
cp "$asset"/source/* "$work/source/"
cd "$work"

node source/art.mjs
chardesk render ring-canyon.ansi -o ring-canyon.chardesk --strict --json
node source/diffuse.mjs
node source/render.mjs
node source/sound.mjs

swiftc -parse-as-library -O -module-cache-path build/module-cache "$PWD/source/Film.swift" -o build/film
swiftc -parse-as-library -O -module-cache-path build/module-cache "$PWD/source/Mux.swift" -o build/mux
build/film
build/mux --decode

cp ring-canyon-smooth.mov ring-canyon.chardesk verification.json "$out/"
