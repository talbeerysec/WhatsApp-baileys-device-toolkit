/**
 * compare-wire-vs-decode.mjs
 *
 * Compare raw wire-level protobuf bytes with proto.HistorySync.decode() output.
 * Goal: confirm whether viewOnce media credentials are absent at wire level (server strips)
 * or lost during protobuf decode / post-processing.
 *
 * Usage: node scripts/compare-wire-vs-decode.mjs
 */

import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

// Import proto from built WAProto
const { proto } = await import('/Users/talbeery/Documents/GitHub/WhatsApp-baileys-device-toolkit/WAProto/index.js');

// Check both possible locations for .bin files
const DIRS = [
  '/tmp/history-sync-raw/history-sync-raw/',
  '/tmp/history-sync-raw/'
];

let binDir = null;
let binFiles = [];

for (const dir of DIRS) {
  try {
    const files = readdirSync(dir).filter(f => f.endsWith('.bin'));
    if (files.length > 0) {
      binDir = dir;
      binFiles = files;
      break;
    }
  } catch (e) { /* skip */ }
}

if (!binDir || binFiles.length === 0) {
  console.error('No .bin files found in /tmp/history-sync-raw/');
  process.exit(1);
}

console.log(`Found ${binFiles.length} .bin files in ${binDir}\n`);

// ── Helpers ──────────────────────────────────────────────────────────────

/** Scan raw binary for mmg.whatsapp.net URL patterns */
function scanRawForMediaUrls(buffer) {
  const str = buffer.toString('latin1');
  const mmgCount = (str.match(/mmg\.whatsapp\.net/g) || []).length;
  const directPathCount = (str.match(/\/o1\/v\//g) || []).length +
                          (str.match(/\/v\/t62/g) || []).length;
  return { mmgCount, directPathCount };
}

/** Check if a raw buffer contains the viewOnce field markers */
function scanRawForViewOncePatterns(buffer) {
  const str = buffer.toString('latin1');
  // viewOnce string patterns
  const viewOnceStrCount = (str.match(/viewOnce/gi) || []).length;
  return { viewOnceStrCount };
}

/** Recursively find viewOnce messages in decoded history sync */
function findViewOnceInDecoded(syncData) {
  const results = [];
  if (!syncData.conversations) return results;

  for (const conv of syncData.conversations) {
    for (const histMsg of (conv.messages || [])) {
      const webMsg = histMsg.message;
      if (!webMsg?.message) continue;

      const m = webMsg.message;
      const msgId = webMsg.key?.id || 'unknown';
      const jid = webMsg.key?.remoteJid || 'unknown';

      // Check wrapper types
      for (const wrapperKey of ['viewOnceMessage', 'viewOnceMessageV2', 'viewOnceMessageV2Extension']) {
        const wrapper = m[wrapperKey];
        if (wrapper?.message) {
          const inner = wrapper.message;
          const media = inner.imageMessage || inner.videoMessage;
          if (media) {
            results.push({
              msgId,
              jid,
              wrapperType: wrapperKey,
              mediaType: inner.imageMessage ? 'image' : 'video',
              hasUrl: !!media.url,
              hasMediaKey: !!media.mediaKey,
              hasDirectPath: !!media.directPath,
              hasFileEncSha256: !!media.fileEncSha256,
              hasFileSha256: !!media.fileSha256,
              mediaKeyLen: media.mediaKey?.length || 0,
              url: media.url || null,
              directPath: media.directPath || null,
              // Dump ALL fields to see what IS present
              allFields: Object.keys(media).filter(k => media[k] != null && media[k] !== undefined),
            });
          }
        }
      }

      // Check inline viewOnce flag
      for (const mediaKey of ['imageMessage', 'videoMessage']) {
        const media = m[mediaKey];
        if (media && media.viewOnce === true) {
          results.push({
            msgId,
            jid,
            wrapperType: `${mediaKey}.viewOnce=true`,
            mediaType: mediaKey === 'imageMessage' ? 'image' : 'video',
            hasUrl: !!media.url,
            hasMediaKey: !!media.mediaKey,
            hasDirectPath: !!media.directPath,
            hasFileEncSha256: !!media.fileEncSha256,
            hasFileSha256: !!media.fileSha256,
            mediaKeyLen: media.mediaKey?.length || 0,
            url: media.url || null,
            directPath: media.directPath || null,
            allFields: Object.keys(media).filter(k => media[k] != null && media[k] !== undefined),
          });
        }
      }
    }
  }

  return results;
}

/** Find normal (non-viewOnce) media messages for comparison */
function findNormalMediaInDecoded(syncData) {
  const results = [];
  if (!syncData.conversations) return results;

  for (const conv of syncData.conversations) {
    for (const histMsg of (conv.messages || [])) {
      const webMsg = histMsg.message;
      if (!webMsg?.message) continue;

      const m = webMsg.message;
      const msgId = webMsg.key?.id || 'unknown';

      // Skip if it has viewOnce wrappers
      if (m.viewOnceMessage || m.viewOnceMessageV2 || m.viewOnceMessageV2Extension) continue;

      for (const mediaKey of ['imageMessage', 'videoMessage']) {
        const media = m[mediaKey];
        if (media && !media.viewOnce) {
          results.push({
            msgId,
            mediaType: mediaKey === 'imageMessage' ? 'image' : 'video',
            hasUrl: !!media.url,
            hasMediaKey: !!media.mediaKey,
            hasDirectPath: !!media.directPath,
            mediaKeyLen: media.mediaKey?.length || 0,
          });
          if (results.length >= 10) break; // Sample only
        }
      }
      if (results.length >= 10) break;
    }
    if (results.length >= 10) break;
  }

  return results;
}

// ── Main analysis ─────────────────────────────────────────────────────

const totalStats = {
  viewOnceTotal: 0,
  viewOnceWithUrl: 0,
  viewOnceWithMediaKey: 0,
  viewOnceWithDirectPath: 0,
  normalMediaTotal: 0,
  normalMediaWithUrl: 0,
  normalMediaWithMediaKey: 0,
  normalMediaWithDirectPath: 0,
};

const allViewOnce = [];
const sampleNormalMedia = [];

for (const file of binFiles) {
  const filePath = join(binDir, file);
  const rawBuffer = readFileSync(filePath);

  // Skip tiny files
  if (rawBuffer.length < 10) {
    console.log(`Skipping ${file} (${rawBuffer.length} bytes - too small)`);
    continue;
  }

  console.log(`\n${'='.repeat(70)}`);
  console.log(`File: ${file} (${rawBuffer.length} bytes)`);
  console.log(`${'='.repeat(70)}`);

  // 1. Raw binary scan
  const rawScan = scanRawForMediaUrls(rawBuffer);
  const rawViewOnce = scanRawForViewOncePatterns(rawBuffer);
  console.log(`  [RAW] mmg URLs: ${rawScan.mmgCount}, directPaths: ${rawScan.directPathCount}, viewOnce strings: ${rawViewOnce.viewOnceStrCount}`);

  // 2. Protobuf decode
  let syncData;
  try {
    syncData = proto.HistorySync.decode(rawBuffer);
  } catch (err) {
    console.log(`  [DECODE] FAILED: ${err.message}`);
    continue;
  }

  console.log(`  [DECODE] syncType=${syncData.syncType}, conversations=${syncData.conversations?.length || 0}`);

  // 3. Find viewOnce messages in decoded output
  const viewOnceMessages = findViewOnceInDecoded(syncData);
  console.log(`  [DECODED:viewOnce] Found ${viewOnceMessages.length} viewOnce messages`);

  for (const vo of viewOnceMessages) {
    console.log(`    - ${vo.msgId}: ${vo.wrapperType} | url=${vo.hasUrl} mediaKey=${vo.hasMediaKey}(${vo.mediaKeyLen}B) directPath=${vo.hasDirectPath}`);
    console.log(`      Fields present: ${vo.allFields.join(', ')}`);
    allViewOnce.push(vo);

    totalStats.viewOnceTotal++;
    if (vo.hasUrl) totalStats.viewOnceWithUrl++;
    if (vo.hasMediaKey) totalStats.viewOnceWithMediaKey++;
    if (vo.hasDirectPath) totalStats.viewOnceWithDirectPath++;
  }

  // 4. Sample normal media for comparison
  const normalMedia = findNormalMediaInDecoded(syncData);
  if (normalMedia.length > 0) {
    console.log(`  [DECODED:normalMedia] Sample of ${normalMedia.length}:`);
    for (const nm of normalMedia) {
      console.log(`    - ${nm.msgId}: ${nm.mediaType} | url=${nm.hasUrl} mediaKey=${nm.hasMediaKey}(${nm.mediaKeyLen}B) directPath=${nm.hasDirectPath}`);
      sampleNormalMedia.push(nm);

      totalStats.normalMediaTotal++;
      if (nm.hasUrl) totalStats.normalMediaWithUrl++;
      if (nm.hasMediaKey) totalStats.normalMediaWithMediaKey++;
      if (nm.hasDirectPath) totalStats.normalMediaWithDirectPath++;
    }
  }

  // 5. CRITICAL TEST: Re-encode decoded data and compare field counts
  // This tells us if encode(decode(wire)) loses fields
  try {
    const reEncoded = proto.HistorySync.encode(syncData).finish();
    const reDecodedScan = scanRawForMediaUrls(Buffer.from(reEncoded));
    console.log(`  [RE-ENCODE] original mmg URLs: ${rawScan.mmgCount}, re-encoded mmg URLs: ${reDecodedScan.mmgCount}`);
    if (rawScan.mmgCount !== reDecodedScan.mmgCount) {
      console.log(`  [RE-ENCODE] *** MISMATCH! Fields lost in decode->encode round-trip ***`);
    }
  } catch (err) {
    console.log(`  [RE-ENCODE] Failed: ${err.message}`);
  }
}

// ── Summary ─────────────────────────────────────────────────────────

console.log('\n' + '='.repeat(70));
console.log('SUMMARY');
console.log('='.repeat(70));
console.log(`\nViewOnce messages (across all chunks):`);
console.log(`  Total: ${totalStats.viewOnceTotal}`);
console.log(`  With url: ${totalStats.viewOnceWithUrl}`);
console.log(`  With mediaKey: ${totalStats.viewOnceWithMediaKey}`);
console.log(`  With directPath: ${totalStats.viewOnceWithDirectPath}`);
console.log(`\nNormal media messages (sampled):`);
console.log(`  Total: ${totalStats.normalMediaTotal}`);
console.log(`  With url: ${totalStats.normalMediaWithUrl}`);
console.log(`  With mediaKey: ${totalStats.normalMediaWithMediaKey}`);
console.log(`  With directPath: ${totalStats.normalMediaWithDirectPath}`);

const viewOnceCredsInWire = totalStats.viewOnceWithMediaKey > 0;
console.log(`\n--- VERDICT ---`);
console.log(`viewOnce credentials present after decode: ${viewOnceCredsInWire}`);
if (!viewOnceCredsInWire && totalStats.viewOnceTotal > 0) {
  console.log(`CONFIRMED: 0/${totalStats.viewOnceTotal} viewOnce messages have mediaKey/directPath/url in decoded output.`);
  console.log(`This matches the wire-level finding: the SERVER strips these fields before sending to this client type.`);
}

// Show what fields ARE present on viewOnce messages
if (allViewOnce.length > 0) {
  console.log(`\n--- Fields PRESENT on viewOnce messages (first 5) ---`);
  for (const vo of allViewOnce.slice(0, 5)) {
    console.log(`  ${vo.msgId} (${vo.wrapperType}): [${vo.allFields.join(', ')}]`);
  }
}

console.log('\nDone.');
