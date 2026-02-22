/**
 * fix-imports.js — Patch pbjs-generated index.js for ESM compatibility
 *
 * pbjs generates code that isn't fully ESM-compatible out of the box.
 * This script fixes two issues:
 *
 *   1. "import * as $protobuf from ..." → "import $protobuf from ..."
 *      The namespace import breaks when protobufjs uses a default export.
 *
 *   2. "protobufjs/minimal" → "protobufjs/minimal.js"
 *      Node ESM resolution requires explicit file extensions.
 *
 * Run automatically by GenerateStatics.sh after pbjs/pbts.
 */

import { readFileSync, writeFileSync } from 'fs';
import { exit } from 'process';

const filePath = './index.js';

try {
  let content = readFileSync(filePath, 'utf8');

  // Fix namespace import to default import
  content = content.replace(
    /import \* as (\$protobuf) from/g,
    'import $1 from'
  );

  // Add .js extension for ESM resolution
  content = content.replace(
    /(['"])protobufjs\/minimal(['"])/g,
    '$1protobufjs/minimal.js$2'
  );

  writeFileSync(filePath, content, 'utf8');

  console.log(`✅ Fixed imports in ${filePath}`);
} catch (error) {
  console.error(`❌ Error fixing imports: ${error.message}`);
  exit(1);
}
