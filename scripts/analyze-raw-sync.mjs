#!/usr/bin/env node

/**
 * analyze-raw-sync.mjs
 *
 * Wire-level protobuf analysis of raw WhatsApp history sync binary blobs.
 * No protobuf library used -- pure manual binary parsing of the wire format.
 *
 * Usage:
 *   node scripts/analyze-raw-sync.mjs <directory-with-bin-files>
 *
 * Reads every .bin file in the given directory, walks the protobuf wire format,
 * locates media messages (normal and viewOnce), and reports which download
 * credential fields are present in the raw binary.
 */

import { readFileSync, readdirSync, statSync } from 'fs'
import { join, resolve } from 'path'

// ---------------------------------------------------------------------------
// Protobuf wire-format helpers (no library)
// ---------------------------------------------------------------------------

/**
 * Decode a base-128 varint starting at `offset` in `buf`.
 * Returns { value: BigInt, bytesRead: number }.
 * We use BigInt because some WhatsApp varints exceed 2^53.
 */
function readVarint(buf, offset) {
  let value = 0n
  let shift = 0n
  let bytesRead = 0
  while (offset < buf.length) {
    const b = buf[offset]
    offset++
    bytesRead++
    value |= BigInt(b & 0x7f) << shift
    if ((b & 0x80) === 0) {
      return { value, bytesRead }
    }
    shift += 7n
    if (shift > 63n) {
      throw new Error(`Varint too long at offset ${offset - bytesRead}`)
    }
  }
  throw new Error(`Truncated varint at offset ${offset - bytesRead}`)
}

/**
 * Decode a tag (field_number + wire_type) starting at `offset`.
 */
function readTag(buf, offset) {
  const { value, bytesRead } = readVarint(buf, offset)
  const wireType = Number(value & 0x7n)
  const fieldNumber = Number(value >> 3n)
  return { fieldNumber, wireType, bytesRead }
}

/**
 * Parse all top-level protobuf fields in buf[start..end).
 * Returns an array of { fieldNumber, wireType, dataStart, dataEnd, rawBytes? }.
 *
 * For wire type 0 (varint): rawBytes is undefined; use dataStart/dataEnd to re-read.
 * For wire type 2 (length-delimited): dataStart..dataEnd spans the payload bytes.
 * Wire types 1 (64-bit) and 5 (32-bit) are handled for completeness.
 */
function parseFields(buf, start, end) {
  const fields = []
  let pos = start
  while (pos < end) {
    const tag = readTag(buf, pos)
    pos += tag.bytesRead

    if (tag.wireType === 0) {
      // Varint
      const vi = readVarint(buf, pos)
      fields.push({
        fieldNumber: tag.fieldNumber,
        wireType: 0,
        dataStart: pos,
        dataEnd: pos + vi.bytesRead,
        varintValue: vi.value,
      })
      pos += vi.bytesRead
    } else if (tag.wireType === 2) {
      // Length-delimited
      const len = readVarint(buf, pos)
      pos += len.bytesRead
      const payloadLen = Number(len.value)
      fields.push({
        fieldNumber: tag.fieldNumber,
        wireType: 2,
        dataStart: pos,
        dataEnd: pos + payloadLen,
      })
      pos += payloadLen
    } else if (tag.wireType === 1) {
      // 64-bit fixed
      fields.push({
        fieldNumber: tag.fieldNumber,
        wireType: 1,
        dataStart: pos,
        dataEnd: pos + 8,
      })
      pos += 8
    } else if (tag.wireType === 5) {
      // 32-bit fixed
      fields.push({
        fieldNumber: tag.fieldNumber,
        wireType: 5,
        dataStart: pos,
        dataEnd: pos + 4,
      })
      pos += 4
    } else {
      // Unknown wire type -- bail on this message
      break
    }

    if (pos > end) {
      // Overrun -- corrupted or incorrect bounds
      break
    }
  }
  return fields
}

/**
 * Parse fields into a Map<fieldNumber, Array<field>> to handle repeated fields.
 */
function parseMessage(buf, start, end) {
  const fields = parseFields(buf, start, end)
  const map = new Map()
  for (const f of fields) {
    if (!map.has(f.fieldNumber)) {
      map.set(f.fieldNumber, [])
    }
    map.get(f.fieldNumber).push(f)
  }
  return map
}

/**
 * Read a UTF-8 string from a length-delimited field.
 */
function readString(buf, field) {
  return buf.subarray(field.dataStart, field.dataEnd).toString('utf8')
}

/**
 * Read raw bytes from a length-delimited field.
 */
function readBytes(buf, field) {
  return buf.subarray(field.dataStart, field.dataEnd)
}

/**
 * Get the first field occurrence or null.
 */
function first(map, fieldNumber) {
  const arr = map.get(fieldNumber)
  return arr && arr.length > 0 ? arr[0] : null
}

// ---------------------------------------------------------------------------
// Media credential extraction
// ---------------------------------------------------------------------------

/**
 * Given an ImageMessage's field map, extract credential info.
 */
function extractImageCredentials(buf, fieldMap) {
  const urlField = first(fieldMap, 1)
  const mimeField = first(fieldMap, 2)
  const captionField = first(fieldMap, 3)
  const sha256Field = first(fieldMap, 4)
  const fileLenField = first(fieldMap, 5)
  const mediaKeyField = first(fieldMap, 8)
  const encSha256Field = first(fieldMap, 9)
  const directPathField = first(fieldMap, 11)
  const mediaKeyTsField = first(fieldMap, 12)
  const thumbnailField = first(fieldMap, 16)
  const viewOnceField = first(fieldMap, 25)

  return {
    type: 'imageMessage',
    url: urlField ? readString(buf, urlField) : null,
    mimetype: mimeField ? readString(buf, mimeField) : null,
    caption: captionField ? readString(buf, captionField) : null,
    fileSha256: sha256Field ? readBytes(buf, sha256Field) : null,
    fileLength: fileLenField ? Number(fileLenField.varintValue) : null,
    mediaKey: mediaKeyField ? readBytes(buf, mediaKeyField) : null,
    fileEncSha256: encSha256Field ? readBytes(buf, encSha256Field) : null,
    directPath: directPathField ? readString(buf, directPathField) : null,
    mediaKeyTimestamp: mediaKeyTsField ? Number(mediaKeyTsField.varintValue) : null,
    hasThumbnail: !!thumbnailField,
    thumbnailSize: thumbnailField ? (thumbnailField.dataEnd - thumbnailField.dataStart) : 0,
    viewOnceFlag: viewOnceField ? Number(viewOnceField.varintValue) !== 0 : false,
  }
}

/**
 * Given a VideoMessage's field map, extract credential info.
 */
function extractVideoCredentials(buf, fieldMap) {
  const urlField = first(fieldMap, 1)
  const mimeField = first(fieldMap, 2)
  const sha256Field = first(fieldMap, 3)
  const fileLenField = first(fieldMap, 4)
  const mediaKeyField = first(fieldMap, 6)
  const encSha256Field = first(fieldMap, 11)
  const directPathField = first(fieldMap, 13)
  const viewOnceField = first(fieldMap, 20)

  return {
    type: 'videoMessage',
    url: urlField ? readString(buf, urlField) : null,
    mimetype: mimeField ? readString(buf, mimeField) : null,
    fileSha256: sha256Field ? readBytes(buf, sha256Field) : null,
    fileLength: fileLenField ? Number(fileLenField.varintValue) : null,
    mediaKey: mediaKeyField ? readBytes(buf, mediaKeyField) : null,
    fileEncSha256: encSha256Field ? readBytes(buf, encSha256Field) : null,
    directPath: directPathField ? readString(buf, directPathField) : null,
    mediaKeyTimestamp: null,
    hasThumbnail: false,
    thumbnailSize: 0,
    viewOnceFlag: viewOnceField ? Number(viewOnceField.varintValue) !== 0 : false,
  }
}

/**
 * Try to extract media credentials from a Message field map.
 * Returns an array of { wrapperPath, credentials } objects.
 */
function extractMediaFromMessage(buf, msgFieldMap, wrapperPath) {
  const results = []

  // Direct imageMessage (field 3 in Message proto)
  const imgFields = msgFieldMap.get(3) || []
  for (const imgField of imgFields) {
    if (imgField.wireType === 2) {
      try {
        const imgMap = parseMessage(buf, imgField.dataStart, imgField.dataEnd)
        const creds = extractImageCredentials(buf, imgMap)
        results.push({ wrapperPath: wrapperPath ? `${wrapperPath} > imageMessage` : 'imageMessage', credentials: creds })
      } catch (_) { /* skip malformed */ }
    }
  }

  // Direct videoMessage (field 9 in Message proto)
  const vidFields = msgFieldMap.get(9) || []
  for (const vidField of vidFields) {
    if (vidField.wireType === 2) {
      try {
        const vidMap = parseMessage(buf, vidField.dataStart, vidField.dataEnd)
        const creds = extractVideoCredentials(buf, vidMap)
        results.push({ wrapperPath: wrapperPath ? `${wrapperPath} > videoMessage` : 'videoMessage', credentials: creds })
      } catch (_) { /* skip malformed */ }
    }
  }

  // viewOnceMessage (field 37) -> FutureProofMessage -> message (field 1) -> Message
  const vo1Fields = msgFieldMap.get(37) || []
  for (const vo1 of vo1Fields) {
    if (vo1.wireType === 2) {
      try {
        const futureMap = parseMessage(buf, vo1.dataStart, vo1.dataEnd)
        const innerMsg = first(futureMap, 1)
        if (innerMsg && innerMsg.wireType === 2) {
          const innerMsgMap = parseMessage(buf, innerMsg.dataStart, innerMsg.dataEnd)
          const nested = extractMediaFromMessage(buf, innerMsgMap, wrapperPath ? `${wrapperPath} > viewOnceMessage` : 'viewOnceMessage')
          results.push(...nested)
        }
      } catch (_) { /* skip */ }
    }
  }

  // viewOnceMessageV2 (field 55)
  const vo2Fields = msgFieldMap.get(55) || []
  for (const vo2 of vo2Fields) {
    if (vo2.wireType === 2) {
      try {
        const futureMap = parseMessage(buf, vo2.dataStart, vo2.dataEnd)
        const innerMsg = first(futureMap, 1)
        if (innerMsg && innerMsg.wireType === 2) {
          const innerMsgMap = parseMessage(buf, innerMsg.dataStart, innerMsg.dataEnd)
          const nested = extractMediaFromMessage(buf, innerMsgMap, wrapperPath ? `${wrapperPath} > viewOnceMessageV2` : 'viewOnceMessageV2')
          results.push(...nested)
        }
      } catch (_) { /* skip */ }
    }
  }

  // viewOnceMessageV2Extension (field 59)
  const vo3Fields = msgFieldMap.get(59) || []
  for (const vo3 of vo3Fields) {
    if (vo3.wireType === 2) {
      try {
        const futureMap = parseMessage(buf, vo3.dataStart, vo3.dataEnd)
        const innerMsg = first(futureMap, 1)
        if (innerMsg && innerMsg.wireType === 2) {
          const innerMsgMap = parseMessage(buf, innerMsg.dataStart, innerMsg.dataEnd)
          const nested = extractMediaFromMessage(buf, innerMsgMap, wrapperPath ? `${wrapperPath} > viewOnceMessageV2Extension` : 'viewOnceMessageV2Extension')
          results.push(...nested)
        }
      } catch (_) { /* skip */ }
    }
  }

  return results
}

// ---------------------------------------------------------------------------
// Message key extraction
// ---------------------------------------------------------------------------

function extractMessageKey(buf, keyField) {
  if (!keyField || keyField.wireType !== 2) return { remoteJid: '?', fromMe: false, id: '?' }
  try {
    const keyMap = parseMessage(buf, keyField.dataStart, keyField.dataEnd)
    const jidField = first(keyMap, 1)
    const fromMeField = first(keyMap, 2)
    const idField = first(keyMap, 3)
    return {
      remoteJid: jidField ? readString(buf, jidField) : '?',
      fromMe: fromMeField ? Number(fromMeField.varintValue) !== 0 : false,
      id: idField ? readString(buf, idField) : '?',
    }
  } catch (_) {
    return { remoteJid: '?', fromMe: false, id: '?' }
  }
}

// ---------------------------------------------------------------------------
// Determine if a media result came through a viewOnce wrapper
// ---------------------------------------------------------------------------

function isViewOncePath(wrapperPath) {
  return /viewOnce/i.test(wrapperPath)
}

// ---------------------------------------------------------------------------
// Format helpers
// ---------------------------------------------------------------------------

function yn(val) {
  if (val === null || val === undefined) return 'NO'
  if (Buffer.isBuffer(val) || val instanceof Uint8Array) {
    return val.length > 0 ? `YES (${val.length}B)` : 'NO (0B)'
  }
  if (typeof val === 'string') {
    return val.length > 0 ? `YES (${val.length} chars)` : 'NO (empty)'
  }
  return 'YES'
}

function hexSnippet(buf, field, maxBytes) {
  if (!field) return '(not present)'
  const slice = buf.subarray(field.dataStart, Math.min(field.dataEnd, field.dataStart + maxBytes))
  return Buffer.from(slice).toString('hex').replace(/(.{2})/g, '$1 ').trim()
}

function hasCredentials(creds) {
  return !!(creds.mediaKey && creds.mediaKey.length > 0 && creds.directPath && creds.directPath.length > 0)
}

// ---------------------------------------------------------------------------
// Main analysis
// ---------------------------------------------------------------------------

function analyzeFile(filePath) {
  const buf = readFileSync(filePath)
  const fileName = filePath.split('/').pop()

  const output = []
  output.push('')
  output.push(`=== RAW SYNC ANALYSIS ===`)
  output.push(`File: ${fileName} (${buf.length} bytes)`)
  output.push('')

  let historySyncMap
  try {
    historySyncMap = parseMessage(buf, 0, buf.length)
  } catch (e) {
    output.push(`ERROR: Failed to parse top-level HistorySync: ${e.message}`)
    return { output, normalMedia: [], viewOnceMedia: [] }
  }

  const conversations = historySyncMap.get(2) || []
  output.push(`Conversations found: ${conversations.length}`)

  const normalMedia = []
  const viewOnceMedia = []
  let totalMessages = 0

  for (const convField of conversations) {
    if (convField.wireType !== 2) continue
    let convMap
    try {
      convMap = parseMessage(buf, convField.dataStart, convField.dataEnd)
    } catch (_) { continue }

    const convIdField = first(convMap, 1)
    const convId = convIdField ? readString(buf, convIdField) : '(unknown)'

    const histSyncMsgs = convMap.get(2) || []
    for (const hsmField of histSyncMsgs) {
      if (hsmField.wireType !== 2) continue
      totalMessages++

      let hsmMap
      try {
        hsmMap = parseMessage(buf, hsmField.dataStart, hsmField.dataEnd)
      } catch (_) { continue }

      // HistorySyncMsg.message = field 1 -> WebMessageInfo
      const wmiField = first(hsmMap, 1)
      if (!wmiField || wmiField.wireType !== 2) continue

      let wmiMap
      try {
        wmiMap = parseMessage(buf, wmiField.dataStart, wmiField.dataEnd)
      } catch (_) { continue }

      // WebMessageInfo.key = field 1
      const keyField = first(wmiMap, 1)
      const msgKey = extractMessageKey(buf, keyField)

      // WebMessageInfo.message = field 2 -> Message
      const msgField = first(wmiMap, 2)
      if (!msgField || msgField.wireType !== 2) continue

      let msgMap
      try {
        msgMap = parseMessage(buf, msgField.dataStart, msgField.dataEnd)
      } catch (_) { continue }

      const mediaResults = extractMediaFromMessage(buf, msgMap, '')
      for (const mr of mediaResults) {
        const entry = {
          ...mr,
          msgKey,
          convId,
          rawMsgFieldStart: msgField.dataStart,
          rawMsgFieldEnd: msgField.dataEnd,
        }
        if (isViewOncePath(mr.wrapperPath)) {
          viewOnceMedia.push(entry)
        } else {
          // Check if the inline viewOnce flag is set
          if (mr.credentials.viewOnceFlag) {
            viewOnceMedia.push(entry)
          } else {
            normalMedia.push(entry)
          }
        }
      }
    }
  }

  output.push(`Total messages scanned: ${totalMessages}`)
  output.push('')

  // --- NORMAL MEDIA ---
  output.push(`--- NORMAL MEDIA MESSAGES ---`)
  if (normalMedia.length === 0) {
    output.push('(none found)')
  } else {
    for (let i = 0; i < normalMedia.length; i++) {
      const m = normalMedia[i]
      const c = m.credentials
      output.push(`[${i + 1}] ${m.wrapperPath} from ${m.msgKey.remoteJid} (msgId: ${m.msgKey.id})`)
      output.push(`    url: ${yn(c.url)}  mediaKey: ${yn(c.mediaKey)}  directPath: ${yn(c.directPath)}  mimetype: ${c.mimetype || '?'}`)
      if (c.fileLength !== null) output.push(`    fileLength: ${c.fileLength}  fileSha256: ${yn(c.fileSha256)}  fileEncSha256: ${yn(c.fileEncSha256)}`)
      if (c.hasThumbnail) output.push(`    jpegThumbnail: YES (${c.thumbnailSize}B)`)
      if (c.mediaKeyTimestamp !== null) output.push(`    mediaKeyTimestamp: ${c.mediaKeyTimestamp}`)
    }
  }
  output.push('')

  // --- VIEWONCE MEDIA ---
  output.push(`--- VIEWONCE MEDIA MESSAGES ---`)
  if (viewOnceMedia.length === 0) {
    output.push('(none found)')
  } else {
    for (let i = 0; i < viewOnceMedia.length; i++) {
      const m = viewOnceMedia[i]
      const c = m.credentials
      output.push(`[${i + 1}] ${m.wrapperPath} from ${m.msgKey.remoteJid} (msgId: ${m.msgKey.id})`)
      output.push(`    url: ${yn(c.url)}  mediaKey: ${yn(c.mediaKey)}  directPath: ${yn(c.directPath)}  mimetype: ${c.mimetype || '?'}`)
      if (c.fileLength !== null) output.push(`    fileLength: ${c.fileLength}  fileSha256: ${yn(c.fileSha256)}  fileEncSha256: ${yn(c.fileEncSha256)}`)
      if (c.hasThumbnail) output.push(`    jpegThumbnail: YES (${c.thumbnailSize}B)`)
      if (c.mediaKeyTimestamp !== null) output.push(`    mediaKeyTimestamp: ${c.mediaKeyTimestamp}`)
      output.push(`    viewOnce flag (inline): ${c.viewOnceFlag ? 'YES' : 'NO'}`)

      // Raw hex dump of the inner media message (first 200 bytes)
      // We find the actual imageMessage or videoMessage field in the raw blob
      // by re-parsing at the Message level
      try {
        const innerMsgField = (() => {
          // Walk back up: find the Message content that contains the actual media
          // We use rawMsgFieldStart/End to get the Message-level blob
          const mMap = parseMessage(buf, m.rawMsgFieldStart, m.rawMsgFieldEnd)
          // Try viewOnce wrappers first
          for (const voFieldNum of [37, 55, 59]) {
            const voFields = mMap.get(voFieldNum) || []
            for (const vo of voFields) {
              if (vo.wireType !== 2) continue
              const futureMap = parseMessage(buf, vo.dataStart, vo.dataEnd)
              const inner = first(futureMap, 1)
              if (!inner || inner.wireType !== 2) continue
              const innerMap = parseMessage(buf, inner.dataStart, inner.dataEnd)
              // Check for imageMessage(3) or videoMessage(9)
              const img = first(innerMap, 3)
              if (img && img.wireType === 2) return img
              const vid = first(innerMap, 9)
              if (vid && vid.wireType === 2) return vid
            }
          }
          // Fallback: direct media
          const img = first(mMap, 3)
          if (img && img.wireType === 2) return img
          const vid = first(mMap, 9)
          if (vid && vid.wireType === 2) return vid
          return null
        })()

        if (innerMsgField) {
          const rawLen = innerMsgField.dataEnd - innerMsgField.dataStart
          const snippet = buf.subarray(innerMsgField.dataStart, Math.min(innerMsgField.dataEnd, innerMsgField.dataStart + 200))
          output.push(`    RAW HEX (first ${Math.min(200, rawLen)} of ${rawLen} bytes): ${Buffer.from(snippet).toString('hex').replace(/(.{2})/g, '$1 ').trim()}`)
        }
      } catch (_) {
        output.push(`    RAW HEX: (error extracting)`)
      }
    }
  }
  output.push('')

  // --- SUMMARY ---
  const normalWithCreds = normalMedia.filter(m => hasCredentials(m.credentials)).length
  const normalWithout = normalMedia.length - normalWithCreds
  const voWithCreds = viewOnceMedia.filter(m => hasCredentials(m.credentials)).length
  const voWithout = viewOnceMedia.length - voWithCreds

  output.push(`--- SUMMARY ---`)
  output.push(`Normal media: ${normalMedia.length} messages, ${normalWithCreds} with credentials, ${normalWithout} without`)
  output.push(`ViewOnce media: ${viewOnceMedia.length} messages, ${voWithCreds} with credentials, ${voWithout} without`)

  if (viewOnceMedia.length > 0) {
    if (voWithCreds === viewOnceMedia.length) {
      output.push(`CONCLUSION: ALL viewOnce messages have download credentials in raw binary`)
    } else if (voWithCreds === 0) {
      output.push(`CONCLUSION: NO viewOnce messages have download credentials in raw binary -- server strips them`)
    } else {
      output.push(`CONCLUSION: MIXED -- ${voWithCreds}/${viewOnceMedia.length} viewOnce messages have credentials`)
    }
  } else {
    output.push(`CONCLUSION: No viewOnce media found in this file`)
  }

  return { output, normalMedia, viewOnceMedia }
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

function main() {
  const args = process.argv.slice(2)
  if (args.length === 0) {
    console.error('Usage: node scripts/analyze-raw-sync.mjs <directory-with-bin-files>')
    console.error('')
    console.error('Reads all .bin files from the given directory and performs')
    console.error('wire-level protobuf analysis to find media messages and their')
    console.error('download credential fields.')
    process.exit(1)
  }

  const dir = resolve(args[0])
  let entries
  try {
    entries = readdirSync(dir)
  } catch (e) {
    console.error(`ERROR: Cannot read directory: ${dir}`)
    console.error(e.message)
    process.exit(1)
  }

  const binFiles = entries
    .filter(f => f.endsWith('.bin'))
    .map(f => join(dir, f))
    .sort()

  if (binFiles.length === 0) {
    console.error(`No .bin files found in ${dir}`)
    process.exit(1)
  }

  console.log(`Found ${binFiles.length} .bin file(s) in ${dir}`)
  console.log('='.repeat(72))

  let totalNormal = 0
  let totalNormalCreds = 0
  let totalVO = 0
  let totalVOCreds = 0

  for (const filePath of binFiles) {
    try {
      const { output, normalMedia, viewOnceMedia } = analyzeFile(filePath)
      for (const line of output) {
        console.log(line)
      }

      totalNormal += normalMedia.length
      totalNormalCreds += normalMedia.filter(m => hasCredentials(m.credentials)).length
      totalVO += viewOnceMedia.length
      totalVOCreds += viewOnceMedia.filter(m => hasCredentials(m.credentials)).length
    } catch (e) {
      console.log('')
      console.log(`=== ERROR processing ${filePath} ===`)
      console.log(e.message)
      console.log(e.stack)
    }
    console.log('='.repeat(72))
  }

  // Grand totals across all files
  if (binFiles.length > 1) {
    console.log('')
    console.log(`=== GRAND TOTALS (${binFiles.length} files) ===`)
    console.log(`Normal media: ${totalNormal} messages, ${totalNormalCreds} with credentials, ${totalNormal - totalNormalCreds} without`)
    console.log(`ViewOnce media: ${totalVO} messages, ${totalVOCreds} with credentials, ${totalVO - totalVOCreds} without`)
    if (totalVO > 0) {
      if (totalVOCreds === totalVO) {
        console.log(`OVERALL CONCLUSION: ALL viewOnce messages have download credentials in raw binary`)
      } else if (totalVOCreds === 0) {
        console.log(`OVERALL CONCLUSION: NO viewOnce messages have download credentials in raw binary -- server strips them`)
      } else {
        console.log(`OVERALL CONCLUSION: MIXED -- ${totalVOCreds}/${totalVO} viewOnce messages have credentials`)
      }
    }
  }
}

main()
