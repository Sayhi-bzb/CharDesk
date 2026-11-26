#!/bin/sh
set -eu
cd "$(dirname "$0")"

bun source/bundle.ts
bun build/record.js
node source/sound.mjs

mkdir -p build/module-cache
swiftc -parse-as-library -module-cache-path build/module-cache "$PWD/source/Film.swift" -o build/film
swiftc -parse-as-library -module-cache-path build/module-cache "$PWD/source/Mux.swift" -o build/mux
build/film
build/mux
