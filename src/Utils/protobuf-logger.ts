import { proto } from '../../WAProto'
import * as fs from 'fs'
import * as path from 'path'
import { Logger } from 'pino'

const DEFAULT_LOG_DIR = 'protobuf-logs'

/**
 * Logs a WAMessage protobuf to disk as JSON.
 * Captures the full raw protocol state before any message cleaning (e.g. viewOnce stripping).
 * Writes to: <logDir>/<jid>/<messageId>.json
 */
export function logProtobufToDisk(
	msg: proto.IWebMessageInfo,
	logDir: string = DEFAULT_LOG_DIR,
	logger?: Logger
): void {
	try {
		const jid = msg.key?.remoteJid || 'unknown'
		const messageId = msg.key?.id || 'unknown'

		// Sanitize jid for filesystem (replace @ and : with _)
		const safeJid = jid.replace(/[@:]/g, '_')

		const dir = path.join(logDir, safeJid)
		fs.mkdirSync(dir, { recursive: true })

		const filePath = path.join(dir, `${messageId}.json`)

		// Use proto.WebMessageInfo.toJSON for full serialization
		const jsonData = proto.WebMessageInfo.toJSON(msg as proto.WebMessageInfo)

		fs.writeFileSync(filePath, JSON.stringify(jsonData, null, 2), 'utf-8')

		logger?.debug({ jid, messageId, filePath }, 'protobuf logged to disk')
	} catch (err) {
		logger?.warn({ err }, 'failed to log protobuf to disk')
	}
}
