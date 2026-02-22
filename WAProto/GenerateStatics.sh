#!/usr/bin/env bash
# GenerateStatics.sh — Compile WAProto.proto into JS/TS static modules
#
# Called via: yarn gen:protobuf (which runs "sh WAProto/GenerateStatics.sh")
#
# Steps:
#   1. pbjs  — Compile WAProto.proto into an ES6 static-module JS file (index.js)
#   2. pbts  — Generate TypeScript declarations from the JS file (index.d.ts)
#   3. fix-imports.js — Patch the generated code for ESM compatibility:
#        - Change "import * as $protobuf from" → "import $protobuf from"
#        - Add .js extension to "protobufjs/minimal" import

# Ensure we run from the WAProto/ directory since all paths are relative
cd "$(dirname "$0")"

yarn pbjs -t static-module -w es6 --no-bundle -o ./index.js ./WAProto.proto;
yarn pbts -o ./index.d.ts ./index.js;
node ./fix-imports.js
