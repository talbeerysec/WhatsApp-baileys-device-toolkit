import type { AxiosRequestConfig } from 'axios'
import * as fs from 'fs'
import * as path from 'path'
import { promisify } from 'util'
import { inflate } from 'zlib'
import { proto } from '../../WAProto/index.js'
import type { Chat, Contact, MediaType } from '../Types'
import { WAMessageStubType } from '../Types'
import { isJidUser } from '../WABinary'
import { toNumber } from './generics'
import { normalizeMessageContent } from './messages'
import { downloadContentFromMessage } from './messages-media'

const inflatePromise = promisify(inflate)

/** Sanitize a JID for use as a filesystem directory name */
function sanitizeJid(jid: string): string {
	return jid.replace(/[/:*?"<>|]/g, '_')
}

/** Derive file extension from mimetype (e.g. 'image/jpeg' -> 'jpeg') */
function extFromMimetype(mimetype: string | null | undefined): string {
	if (!mimetype) return 'bin'
	const parts = mimetype.split('/')
	if (parts.length === 2) {
		// Handle common subtypes: 'image/jpeg' -> 'jpeg', 'video/mp4' -> 'mp4'
		return parts[1].split(';')[0].trim() || 'bin'
	}
	return 'bin'
}

/**
 * Detected viewOnce media message with its context, ready for download.
 */
interface ViewOnceMediaInfo {
	messageId: string
	remoteJid: string
	/** The media message object (imageMessage or videoMessage) */
	mediaMsg: any
	/** 'image' or 'video' for downloadContentFromMessage */
	downloadType: MediaType
	/** Source: 'wrapper' (viewOnceMessage/V2/V2Extension) or 'inline' (imageMessage.viewOnce=true) */
	source: string
	mimetype: string | null
}

/**
 * Detect viewOnce messages from a decoded history sync.
 *
 * Checks BOTH:
 * 1. Wrapper types: viewOnceMessage, viewOnceMessageV2, viewOnceMessageV2Extension
 * 2. Inline flags: imageMessage.viewOnce === true, videoMessage.viewOnce === true
 *
 * The inline check is critical because history sync often encodes viewOnce
 * as imageMessage with viewOnce=true rather than using wrapper types.
 */
function detectViewOnceMessages(syncData: proto.IHistorySync): ViewOnceMediaInfo[] {
	const results: ViewOnceMediaInfo[] = []
	if (!syncData.conversations) return results

	for (const conv of syncData.conversations) {
		for (const histMsg of (conv.messages || [])) {
			const m = histMsg.message?.message
			if (!m) continue

			const messageId = histMsg.message?.key?.id || 'unknown'
			const remoteJid = histMsg.message?.key?.remoteJid || 'unknown'

			// --- Check 1: Wrapper types (viewOnceMessage / V2 / V2Extension) ---
			const voWrapper = m.viewOnceMessage || m.viewOnceMessageV2 || m.viewOnceMessageV2Extension
			if (voWrapper?.message) {
				const inner = voWrapper.message
				if (inner.imageMessage) {
					results.push({
						messageId,
						remoteJid,
						mediaMsg: inner.imageMessage,
						downloadType: 'image',
						source: m.viewOnceMessage ? 'viewOnceMessage'
							: m.viewOnceMessageV2 ? 'viewOnceMessageV2'
							: 'viewOnceMessageV2Extension',
						mimetype: (inner.imageMessage as any).mimetype || null
					})
					continue // Don't double-count
				}
				if (inner.videoMessage) {
					results.push({
						messageId,
						remoteJid,
						mediaMsg: inner.videoMessage,
						downloadType: 'video',
						source: m.viewOnceMessage ? 'viewOnceMessage'
							: m.viewOnceMessageV2 ? 'viewOnceMessageV2'
							: 'viewOnceMessageV2Extension',
						mimetype: (inner.videoMessage as any).mimetype || null
					})
					continue
				}
			}

			// --- Check 2: Inline viewOnce flag on imageMessage/videoMessage ---
			// History sync often sends viewOnce as imageMessage.viewOnce=true
			// WITHOUT wrapping in viewOnceMessage/V2/V2Extension
			if (m.imageMessage && (m.imageMessage as any).viewOnce === true) {
				results.push({
					messageId,
					remoteJid,
					mediaMsg: m.imageMessage,
					downloadType: 'image',
					source: 'imageMessage.viewOnce',
					mimetype: (m.imageMessage as any).mimetype || null
				})
				continue
			}

			if (m.videoMessage && (m.videoMessage as any).viewOnce === true) {
				results.push({
					messageId,
					remoteJid,
					mediaMsg: m.videoMessage,
					downloadType: 'video',
					source: 'videoMessage.viewOnce',
					mimetype: (m.videoMessage as any).mimetype || null
				})
				continue
			}
		}
	}

	return results
}

/**
 * Download and cache a single viewOnce media file to disk.
 * Returns the file path on success, or null on failure.
 */
async function downloadAndCacheViewOnceMedia(info: ViewOnceMediaInfo): Promise<string | null> {
	const { mediaMsg, downloadType, messageId, remoteJid, mimetype } = info
	const mk = mediaMsg.mediaKey
	const dp = mediaMsg.directPath

	// Must have credentials to download
	if (!mk || !dp) {
		return null
	}

	const cacheBase = process.env.MEDIA_CACHE_PATH || 'media-cache'
	const jidDir = path.join(cacheBase, sanitizeJid(remoteJid))
	const ext = extFromMimetype(mimetype)
	const filePath = path.join(jidDir, `${messageId}.${ext}`)

	// Skip if already cached
	if (fs.existsSync(filePath)) {
		console.log(`[HistorySync:VO-Cache] Already cached: ${filePath}`)
		return filePath
	}

	fs.mkdirSync(jidDir, { recursive: true })

	const stream = await downloadContentFromMessage(mediaMsg, downloadType, {})
	const chunks: Buffer[] = []
	for await (const chunk of stream) {
		chunks.push(chunk)
	}
	const fileBuffer = Buffer.concat(chunks)
	fs.writeFileSync(filePath, fileBuffer)

	return filePath
}

/**
 * Scan raw protobuf binary for known WhatsApp media URL patterns.
 * This detects whether the server sent media credentials even if
 * proto.HistorySync.decode() strips them.
 */
function scanRawBinaryForMediaPatterns(buffer: Buffer): {
	mmgUrlCount: number
	directPathCount: number
	mediaKeyCount: number
} {
	const bufStr = buffer.toString('latin1')
	let mmgUrlCount = 0
	let directPathCount = 0
	let mediaKeyCount = 0

	// Count mmg.whatsapp.net URLs
	let idx = 0
	while (idx < bufStr.length) {
		const pos = bufStr.indexOf('mmg.whatsapp.net', idx)
		if (pos === -1) break
		mmgUrlCount++
		idx = pos + 16
	}

	// Count directPath patterns (/o1/v/ and /v/t62)
	idx = 0
	while (idx < bufStr.length) {
		const pos = bufStr.indexOf('/o1/v/', idx)
		if (pos === -1) break
		directPathCount++
		idx = pos + 6
	}
	idx = 0
	while (idx < bufStr.length) {
		const pos = bufStr.indexOf('/v/t62', idx)
		if (pos === -1) break
		directPathCount++
		idx = pos + 6
	}

	// Count potential 32-byte mediaKey fields (protobuf field 8, wire type 2, length 32)
	for (let i = 0; i < buffer.length - 33; i++) {
		if (buffer[i] === 0x42 && buffer[i + 1] === 0x20) {
			mediaKeyCount++
		}
	}

	return { mmgUrlCount, directPathCount, mediaKeyCount }
}

export const downloadHistory = async(msg: proto.Message.IHistorySyncNotification, options: AxiosRequestConfig<{}>) => {
	// Log all notification fields for debugging
	console.log(
		`[HistorySync:NOTIF] syncType=${msg.syncType}, chunkOrder=${msg.chunkOrder}, ` +
		`progress=${msg.progress}, fileLength=${msg.fileLength}, ` +
		`hasFileSha256=${!!msg.fileSha256}, hasMediaKey=${!!msg.mediaKey}, ` +
		`hasDirectPath=${!!msg.directPath}, hasEncHandle=${!!msg.encHandle}, ` +
		`hasInlinePayload=${!!(msg as any).initialHistBootstrapInlinePayload}, ` +
		`inlinePayloadSize=${(msg as any).initialHistBootstrapInlinePayload?.length || 0}`
	)

	let buffer: Buffer
	let dataSource: string

	// Check for inline payload first (initialHistBootstrapInlinePayload)
	// When inlineInitialPayloadInE2EeMsg is true, the primary device may send
	// initial history data inline in the E2E message rather than as a media download.
	// The inline payload is E2E encrypted end-to-end and may contain viewOnce credentials
	// that the downloadable blob version strips.
	const inlinePayload = (msg as any).initialHistBootstrapInlinePayload as Uint8Array | null | undefined
	if (inlinePayload && inlinePayload.length > 0) {
		console.log(`[HistorySync:INLINE] Using inline payload (${inlinePayload.length} bytes)`)
		const rawInline = Buffer.from(inlinePayload)

		// Try decompressing (the inline payload may be compressed like the download blob)
		try {
			buffer = await inflatePromise(rawInline)
			dataSource = 'inline-inflated'
			console.log(`[HistorySync:INLINE] Inflated ${rawInline.length} -> ${buffer.length} bytes`)
		} catch {
			// If inflate fails, try using the raw bytes directly (might be uncompressed)
			buffer = rawInline
			dataSource = 'inline-raw'
			console.log(`[HistorySync:INLINE] Inflate failed, using raw ${buffer.length} bytes`)
		}
	} else {
		// Standard download path
		const stream = await downloadContentFromMessage(msg, 'md-msg-hist', { options })
		const bufferArray: Buffer[] = []
		for await (const chunk of stream) {
			bufferArray.push(chunk)
		}

		let downloaded = Buffer.concat(bufferArray)

		// decompress buffer
		buffer = await inflatePromise(downloaded)
		dataSource = 'download'
	}

	// Save raw decompressed buffer to disk (useful for debugging)
	const logDir = process.env.PROTOBUF_LOG_PATH || 'protobuf-logs'
	const histSyncLogDir = path.join(logDir, 'history-sync-raw')
	try {
		fs.mkdirSync(histSyncLogDir, { recursive: true })
		const rawFilePath = path.join(histSyncLogDir, `history-sync-${dataSource}-${Date.now()}.bin`)
		fs.writeFileSync(rawFilePath, buffer)
		console.log(`[HistorySync:RAW] Saved ${buffer.length} bytes to ${rawFilePath} (source: ${dataSource})`)
	} catch (err) {
		console.error('[HistorySync:RAW] Failed to save raw buffer:', err)
	}

	// Scan raw binary for media patterns before protobuf decode
	const rawScan = scanRawBinaryForMediaPatterns(buffer)
	console.log(
		`[HistorySync:RAW-SCAN] source=${dataSource}, mmgUrls=${rawScan.mmgUrlCount}, ` +
		`directPaths=${rawScan.directPathCount}, ` +
		`mediaKeys=${rawScan.mediaKeyCount}`
	)

	const syncData = proto.HistorySync.decode(buffer)

	// Detect viewOnce messages (both wrapper types AND inline viewOnce flags)
	const viewOnceMessages = detectViewOnceMessages(syncData)

	const withCredentials = viewOnceMessages.filter(v => v.mediaMsg.mediaKey && v.mediaMsg.directPath)
	const withoutCredentials = viewOnceMessages.filter(v => !v.mediaMsg.mediaKey || !v.mediaMsg.directPath)

	console.log(
		`[HistorySync:SUMMARY] syncType=${syncData.syncType}, ` +
		`conversations=${syncData.conversations?.length || 0}, ` +
		`viewOnce total=${viewOnceMessages.length}, ` +
		`withCredentials=${withCredentials.length}, ` +
		`withoutCredentials=${withoutCredentials.length}`
	)

	// Log each detected viewOnce message
	for (const vo of viewOnceMessages) {
		const mk = vo.mediaMsg.mediaKey
		const dp = vo.mediaMsg.directPath
		const mkLen = mk ? (mk instanceof Uint8Array ? mk.length : Buffer.from(mk, 'base64').length) : 0
		console.log(
			`[HistorySync:VO] ${vo.messageId} from ${vo.remoteJid}: ` +
			`source=${vo.source}, type=${vo.downloadType}, ` +
			`mediaKey=${mkLen > 0 ? `${mkLen}B` : 'NONE'}, ` +
			`directPath=${dp ? 'YES' : 'NONE'}, ` +
			`mime=${vo.mimetype || 'unknown'}`
		)
	}

	// Early download: cache viewOnce media with credentials to disk before they expire
	// Includes retry logic: up to 2 retries with exponential backoff for transient failures
	if (withCredentials.length > 0) {
		const DL_MAX_RETRIES = 2
		const DL_RETRY_BASE_MS = 2000

		console.log(`[ViewOnce-Fix] Starting early download of ${withCredentials.length} viewOnce media files...`)

		const downloadResults = await Promise.allSettled(
			withCredentials.map(async (vo) => {
				let lastErr: any
				for (let attempt = 0; attempt <= DL_MAX_RETRIES; attempt++) {
					try {
						if (attempt > 0) {
							const backoff = DL_RETRY_BASE_MS * attempt
							console.log(`[ViewOnce-Fix] Retry ${attempt}/${DL_MAX_RETRIES} for ${vo.messageId} after ${backoff}ms`)
							await new Promise(r => setTimeout(r, backoff))
						}
						const cachedPath = await downloadAndCacheViewOnceMedia(vo)
						if (cachedPath) {
							console.log(`[ViewOnce-Fix] Cached ${vo.messageId} -> ${cachedPath}`)
						}
						return { messageId: vo.messageId, path: cachedPath }
					} catch (err) {
						lastErr = err
						console.warn(
							`[ViewOnce-Fix] Download attempt ${attempt + 1} failed for ${vo.messageId}: ` +
							`${err instanceof Error ? err.message : String(err)}`
						)
					}
				}
				console.error(`[ViewOnce-Fix] All retries exhausted for ${vo.messageId}`)
				throw lastErr
			})
		)

		const succeeded = downloadResults.filter(r => r.status === 'fulfilled').length
		const failed = downloadResults.filter(r => r.status === 'rejected').length
		console.log(`[ViewOnce-Fix] Early download complete: ${succeeded} cached, ${failed} failed`)
	}

	return syncData
}

export const processHistoryMessage = (item: proto.IHistorySync) => {
	const messages: proto.IWebMessageInfo[] = []
	const contacts: Contact[] = []
	const chats: Chat[] = []

	switch (item.syncType) {
		case proto.HistorySync.HistorySyncType.INITIAL_BOOTSTRAP:
		case proto.HistorySync.HistorySyncType.RECENT:
		case proto.HistorySync.HistorySyncType.FULL:
		case proto.HistorySync.HistorySyncType.ON_DEMAND:
			for (const chat of item.conversations! as Chat[]) {
				contacts.push({
					id: chat.id,
					name: chat.name || undefined,
					lid: chat.lidJid || undefined,
					jid: isJidUser(chat.id) ? chat.id : undefined
				})

				const msgs = chat.messages || []
				delete chat.messages

				for (const item of msgs) {
					const message = item.message!
					messages.push(message)

					if (!chat.messages?.length) {
						// keep only the most recent message in the chat array
						chat.messages = [{ message }]
					}

					if (!message.key.fromMe && !chat.lastMessageRecvTimestamp) {
						chat.lastMessageRecvTimestamp = toNumber(message.messageTimestamp)
					}

					if (
						(message.messageStubType === WAMessageStubType.BIZ_PRIVACY_MODE_TO_BSP ||
							message.messageStubType === WAMessageStubType.BIZ_PRIVACY_MODE_TO_FB) &&
						message.messageStubParameters?.[0]
					) {
						contacts.push({
							id: message.key.participant || message.key.remoteJid!,
							verifiedName: message.messageStubParameters?.[0]
						})
					}
				}

				chats.push({ ...chat })
			}

			break
		case proto.HistorySync.HistorySyncType.PUSH_NAME:
			for (const c of item.pushnames!) {
				contacts.push({ id: c.id!, notify: c.pushname! })
			}

			break
	}

	return {
		chats,
		contacts,
		messages,
		syncType: item.syncType,
		progress: item.progress
	}
}

export const downloadAndProcessHistorySyncNotification = async (
	msg: proto.Message.IHistorySyncNotification,
	options: AxiosRequestConfig<{}>
) => {
	const historyMsg = await downloadHistory(msg, options)
	return processHistoryMessage(historyMsg)
}

export const getHistoryMsg = (message: proto.IMessage) => {
	const normalizedContent = !!message ? normalizeMessageContent(message) : undefined
	const anyHistoryMsg = normalizedContent?.protocolMessage?.historySyncNotification

	return anyHistoryMsg
}
