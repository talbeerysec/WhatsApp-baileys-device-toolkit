import { Boom } from '@hapi/boom'
import NodeCache from 'node-cache'
import readline from 'readline'
import makeWASocket, { AnyMessageContent, BinaryInfo, delay, DisconnectReason, downloadAndProcessHistorySyncNotification, encodeWAM, fetchLatestBaileysVersion, generateMessageID, generateMessageIDV2, generateWAMessage, getAggregateVotesInPollMessage, getHistoryMsg, isJidNewsletter, makeCacheableSignalKeyStore, makeInMemoryStore, proto, useMultiFileAuthState, WAMessageContent, WAMessageKey, WAPresence } from '../src'
//import MAIN_LOGGER from '../src/Utils/logger'
import open from 'open'
import fs from 'fs'
import P from 'pino'

const logger = P({ timestamp: () => `,"time":"${new Date().toJSON()}"` }, P.destination('./wa-logs.txt'))
logger.level = 'trace'


const useStore = !process.argv.includes('--no-store')
const doReplies = process.argv.includes('--do-reply')
const usePairingCode = process.argv.includes('--use-pairing-code')

// external map to store retry counts of messages when decryption/encryption fails
// keep this out of the socket itself, so as to prevent a message decryption/encryption loop across socket restarts
const msgRetryCounterCache = new NodeCache()

const onDemandMap = new Map<string, string>()

// Silent ping tracking system
interface PendingSilentPing {
	user: string
	deviceId: number
	timestamp: number
	timeoutId: NodeJS.Timeout
	type: 'reaction' | 'delete' | 'edit' | 'call-reject' | 'unknown' | 'poll-response' | 'button-response' | 'device-sent' | 'app-state' | 'peer-data-operation' | 'malformed-message'
}
const pendingSilentPings = new Map<string, PendingSilentPing>()

// Helper function to get status name
function getStatusName(status: number): string {
	switch(status) {
		case 0: return 'ERROR'
		case 1: return 'PENDING'
		case 2: return 'SERVER_ACK'
		case 3: return 'DELIVERY_ACK'
		case 4: return 'READ'
		case 5: return 'PLAYED'
		default: return `UNKNOWN(${status})`
	}
}

// Read line interface
const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
const question = (text: string) => new Promise<string>((resolve) => rl.question(text, resolve))

// the store maintains the data of the WA connection in memory
// can be written out to a file & read from it
const store = useStore ? makeInMemoryStore({ logger }) : undefined
store?.readFromFile('./baileys_store_multi.json')
// save every 10s
setInterval(() => {
	store?.writeToFile('./baileys_store_multi.json')
}, 10_000)

// start a connection
const startSock = async() => {
	const { state, saveCreds } = await useMultiFileAuthState('baileys_auth_info')
	// fetch latest version of WA Web
	const { version, isLatest } = await fetchLatestBaileysVersion()
	console.log(`using WA v${version.join('.')}, isLatest: ${isLatest}`)

	const sock = makeWASocket({
		version,
		logger,
		printQRInTerminal: !usePairingCode,
		auth: {
			creds: state.creds,
			/** caching makes the store faster to send/recv messages */
			keys: makeCacheableSignalKeyStore(state.keys, logger),
		},
		msgRetryCounterCache,
		generateHighQualityLinkPreview: true,
		// ignore all broadcast messages -- to receive the same
		// comment the line below out
		// shouldIgnoreJid: jid => isJidBroadcast(jid),
		// implement to handle retries & poll updates
		getMessage,
	})


	store?.bind(sock.ev)

	// Pairing code for Web clients
	if (usePairingCode && !sock.authState.creds.registered) {
		// todo move to QR event
		const phoneNumber = await question('Please enter your phone number:\n')
		const code = await sock.requestPairingCode(phoneNumber)
		console.log(`Pairing code: ${code}`)
	}

	const sendMessageWTyping = async(msg: AnyMessageContent, jid: string) => {
		await sock.presenceSubscribe(jid)
		await delay(500)

		await sock.sendPresenceUpdate('composing', jid)
		await delay(2000)

		await sock.sendPresenceUpdate('paused', jid)

		await sock.sendMessage(jid, msg)
	}

	const sendMessageToDevice = async(msg: AnyMessageContent, user: string, deviceId?: number) => {
		try {
			console.log(`Attempting to send message to device ${deviceId || 0} of user ${user}`)
			
			// Create the target JID - this is the normal user JID
			const normalJid = `${user}@s.whatsapp.net`
			
			// Create device-specific JID for the participant
			const deviceSpecificJid = deviceId !== undefined ? `${user}:${deviceId}@s.whatsapp.net` : normalJid
			
			// Generate a proper message ID
			const messageId = generateMessageIDV2(sock.user?.id)
			
			// Create message content based on input type
			let messageContent: any
			if (typeof msg === 'object' && 'text' in msg && msg.text) {
				messageContent = { conversation: msg.text }
			} else if (typeof msg === 'string') {
				messageContent = { conversation: msg }
			} else {
				// For other message types, just pass through the content
				messageContent = msg
			}
			
			console.log(`Sending to participant: ${deviceSpecificJid}`)
			console.log(`Message content:`, messageContent)
			
			// Use relayMessage with specific participant - this should target only the specified device
			await sock.relayMessage(normalJid, messageContent, {
				messageId: messageId,
				participant: {
					jid: deviceSpecificJid,
					count: 0
				}
			})

			console.log(`✓ Message sent specifically to device ${deviceId || 0} of user ${user}`)
			console.log(`Message ID: ${messageId}`)
			
			return {
				key: {
					id: messageId,
					remoteJid: normalJid,
					fromMe: true
				},
				message: messageContent,
				messageTimestamp: Date.now()
			}
		} catch (error) {
			console.error(`Failed to send message to specific device:`, error)
			logger.error({ error, user, deviceId }, 'Failed to send message to specific device')
			throw error
		}
	}

	// the process function lets you process all events that just occurred
	// efficiently in a batch
	sock.ev.process(
		// events is a map for event name => event data
		async(events) => {
			// Debug: Show all events being processed
			const eventNames = Object.keys(events)
			if(eventNames.length > 0) {
				console.log(`🎭 Processing events: ${eventNames.join(', ')}`)
			}
			// something about the connection changed
			// maybe it closed, or we received all offline message or connection opened
			if(events['connection.update']) {
				const update = events['connection.update']
				const { connection, lastDisconnect } = update
				if(connection === 'close') {
					// reconnect if not logged out
					if((lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut) {
						startSock()
					} else {
						console.log('Connection closed. You are logged out.')
					}
				}
				
				// WARNING: THIS WILL SEND A WAM EXAMPLE AND THIS IS A ****CAPTURED MESSAGE.****
				// DO NOT ACTUALLY ENABLE THIS UNLESS YOU MODIFIED THE FILE.JSON!!!!!
				// THE ANALYTICS IN THE FILE ARE OLD. DO NOT USE THEM.
				// YOUR APP SHOULD HAVE GLOBALS AND ANALYTICS ACCURATE TO TIME, DATE AND THE SESSION
				// THIS FILE.JSON APPROACH IS JUST AN APPROACH I USED, BE FREE TO DO THIS IN ANOTHER WAY.
				// THE FIRST EVENT CONTAINS THE CONSTANT GLOBALS, EXCEPT THE seqenceNumber(in the event) and commitTime
				// THIS INCLUDES STUFF LIKE ocVersion WHICH IS CRUCIAL FOR THE PREVENTION OF THE WARNING
				const sendWAMExample = false;
				if(connection === 'open' && sendWAMExample) {
					/// sending WAM EXAMPLE
					const {
						header: {
							wamVersion,
							eventSequenceNumber,
						},
						events,
					} = JSON.parse(await fs.promises.readFile("./boot_analytics_test.json", "utf-8"))

					const binaryInfo = new BinaryInfo({
						protocolVersion: wamVersion,
						sequence: eventSequenceNumber,
						events: events
					})

					const buffer = encodeWAM(binaryInfo);
					
					const result = await sock.sendWAMBuffer(buffer)
					console.log(result)
				}

				console.log('connection update', update)
				
				// Start interactive command interface when connected
				if(connection === 'open') {
					setupCommandInterface()
				}
			}

			// credentials updated -- save them
			if(events['creds.update']) {
				await saveCreds()
			}

			if(events['labels.association']) {
				console.log(events['labels.association'])
			}


			if(events['labels.edit']) {
				console.log(events['labels.edit'])
			}

			if(events.call) {
				console.log('recv call event', events.call)
			}

			// history received
			if(events['messaging-history.set']) {
				const { chats, contacts, messages, isLatest, progress, syncType } = events['messaging-history.set']
				if (syncType === proto.HistorySync.HistorySyncType.ON_DEMAND) {
					console.log('received on-demand history sync, messages=', messages)
				}
				console.log(`recv ${chats.length} chats, ${contacts.length} contacts, ${messages.length} msgs (is latest: ${isLatest}, progress: ${progress}%), type: ${syncType}`)
			}

			// received a new message
			if(events['messages.upsert']) {
				const upsert = events['messages.upsert']
				console.log('recv messages ', JSON.stringify(upsert, undefined, 2))

				if(upsert.type === 'notify') {
					for (const msg of upsert.messages) {
						//TODO: More built-in implementation of this
						/* if (
							msg.message?.protocolMessage?.type ===
							proto.Message.ProtocolMessage.Type.HISTORY_SYNC_NOTIFICATION
						  ) {
							const historySyncNotification = getHistoryMsg(msg.message)
							if (
							  historySyncNotification?.syncType ==
							  proto.HistorySync.HistorySyncType.ON_DEMAND
							) {
							  const { messages } =
								await downloadAndProcessHistorySyncNotification(
								  historySyncNotification,
								  {}
								)

								
								const chatId = onDemandMap.get(
									historySyncNotification!.peerDataRequestSessionId!
								)
								
								console.log(messages)

							  onDemandMap.delete(
								historySyncNotification!.peerDataRequestSessionId!
							  )

							  /*
								// 50 messages is the limit imposed by whatsapp
								//TODO: Add ratelimit of 7200 seconds
								//TODO: Max retries 10
								const messageId = await sock.fetchMessageHistory(
									50,
									oldestMessageKey,
									oldestMessageTimestamp
								)
								onDemandMap.set(messageId, chatId)
							}
						  } */

						if (msg.message?.conversation || msg.message?.extendedTextMessage?.text) {
							const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text
							if (text == "requestPlaceholder" && !upsert.requestId) {
								const messageId = await sock.requestPlaceholderResend(msg.key) 
								console.log('requested placeholder resync, id=', messageId)
							} else if (upsert.requestId) {
								console.log('Message received from phone, id=', upsert.requestId, msg)
							}

							// go to an old chat and send this
							if (text == "onDemandHistSync") {
								const messageId = await sock.fetchMessageHistory(50, msg.key, msg.messageTimestamp!) 
								console.log('requested on-demand sync, id=', messageId)
							}
						}

						if(!msg.key.fromMe && doReplies && !isJidNewsletter(msg.key?.remoteJid!)) {
							console.log('replying to', msg.key.remoteJid)
							await sock!.readMessages([msg.key])
							await sendMessageWTyping({ text: 'Hello there!' }, msg.key.remoteJid!)
						}
					}
				}
			}

			// messages updated like status delivered, message deleted etc.
			if(events['messages.update']) {
				console.log(
					JSON.stringify(events['messages.update'], undefined, 2)
				)

				// Check for silent ping status updates (for direct messages)
				for(const { key, update } of events['messages.update']) {
					const messageId = key?.id
					if(messageId && pendingSilentPings.has(messageId) && update.status) {
						const pingInfo = pendingSilentPings.get(messageId)!
						const roundTripTime = Date.now() - pingInfo.timestamp
						
						console.log(`🎯 Silent ping status update received!`)
						console.log(`   User: ${pingInfo.user}`)
						console.log(`   Device ID: ${pingInfo.deviceId}`)
						console.log(`   Round-trip time: ${roundTripTime}ms`)
						console.log(`   Status: ${update.status} (${getStatusName(update.status)})`)
						
						// Clean up tracking on final status (delivered or read)
						if(update.status >= 2) { // DELIVERY_ACK or higher
							clearTimeout(pingInfo.timeoutId)
							pendingSilentPings.delete(messageId)
						}
					}

					if(update.pollUpdates) {
						const pollCreation = await getMessage(key)
						if(pollCreation) {
							console.log(
								'got poll update, aggregation: ',
								getAggregateVotesInPollMessage({
									message: pollCreation,
									pollUpdates: update.pollUpdates,
								})
							)
						}
					}
				}
			}

			if(events['message-receipt.update']) {
				console.log('📨 Raw receipt event:', JSON.stringify(events['message-receipt.update'], null, 2))
				
				// Check for silent ping responses
				for(const receipt of events['message-receipt.update']) {
					console.log(`🔍 Checking receipt with message ID: ${receipt.key?.id}`)
					console.log(`🗃️ Pending pings:`, Array.from(pendingSilentPings.keys()))
					
					const messageId = receipt.key?.id
					if(messageId && pendingSilentPings.has(messageId)) {
						const pingInfo = pendingSilentPings.get(messageId)!
						const roundTripTime = Date.now() - pingInfo.timestamp
						
						console.log(`🎯 Silent ping response received!`)
						console.log(`   User: ${pingInfo.user}`)
						console.log(`   Device ID: ${pingInfo.deviceId}`)
						console.log(`   Round-trip time: ${roundTripTime}ms`)
						console.log(`   Receipt data:`, JSON.stringify(receipt.receipt, null, 2))
						console.log(`   Status: Response received - device is active`)
						
						// Clean up the tracking
						clearTimeout(pingInfo.timeoutId)
						pendingSilentPings.delete(messageId)
					}
				}
			}

			// Debug: Log ALL events to see what's available
			if(Object.keys(events).some(key => key.includes('receipt'))) {
				console.log('🔎 All receipt-related events:', Object.keys(events).filter(k => k.includes('receipt')))
				for(const [eventName, eventData] of Object.entries(events)) {
					if(eventName.includes('receipt')) {
						console.log(`📋 Event ${eventName}:`, JSON.stringify(eventData, null, 2))
					}
				}
			}

			if(events['messages.reaction']) {
				console.log(events['messages.reaction'])
			}

			if(events['presence.update']) {
				console.log(events['presence.update'])
			}

			if(events['chats.update']) {
				console.log(events['chats.update'])
			}

			if(events['contacts.update']) {
				for(const contact of events['contacts.update']) {
					if(typeof contact.imgUrl !== 'undefined') {
						const newUrl = contact.imgUrl === null
							? null
							: await sock!.profilePictureUrl(contact.id!).catch(() => null)
						console.log(
							`contact ${contact.id} has a new profile pic: ${newUrl}`,
						)
					}
				}
			}

			if(events['chats.delete']) {
				console.log('chats deleted ', events['chats.delete'])
			}
		}
	)

	const setupCommandInterface = () => {
		const processCommand = async (input: string) => {
			const [command, ...args] = input.trim().split(' ')
			
			switch(command.toLowerCase()) {
				case 'send':
					if(args.length >= 2) {
						const jid = args[0]
						const message = args.slice(1).join(' ')
						try {
							await sock.sendMessage(jid, { text: message })
							console.log(`Message sent to ${jid}`)
						} catch (error) {
							console.log(`Failed to send message: ${error}`)
						}
					} else {
						console.log('Usage: send <jid> <message>')
						console.log('Example: send 1234567890@s.whatsapp.net Hello there!')
					}
					break
					
				case 'sendtodevice':
					if(args.length >= 3) {
						const user = args[0]
						const deviceId = parseInt(args[1])
						const message = args.slice(2).join(' ')
						try {
							const result = await sendMessageToDevice({ text: message }, user, deviceId)
							console.log(`Message sent to device ${deviceId} of ${user}`)
							if(result?.key?.id) {
								console.log(`Message ID: ${result.key.id}`)
							}
						} catch (error) {
							console.log(`Failed to send message to device: ${error}`)
						}
					} else {
						console.log('Usage: sendtodevice <user> <deviceId> <message>')
						console.log('Example: sendtodevice 1234567890 1 Hello specific device!')
						console.log('Note: Use device ID 0 for primary device')
					}
					break
					
				case 'list':
					if(store) {
						const chats = store.chats.all()
						console.log('Recent chats:')
						if(chats.length === 0) {
							console.log('No chats found')
						} else {
							chats.slice(0, 10).forEach((chat, index) => {
								console.log(`${index + 1}. ${chat.id} - ${chat.name || 'Unknown'}`)
							})
						}
					} else {
						console.log('Store not available')
					}
					break
					
				case 'status':
					console.log(`Connection state: ${sock.user ? 'Connected' : 'Disconnected'}`)
					console.log(`Auth state: ${sock.authState.creds.registered ? 'Registered' : 'Not registered'}`)
					if(sock.user) {
						console.log(`Logged in as: ${sock.user.name} (${sock.user.id})`)
					}
					if(store) {
						const chatCount = store.chats.all().length
						const contactCount = Object.keys(store.contacts).length
						console.log(`Chats: ${chatCount}, Contacts: ${contactCount}`)
					}
					break
					
				case 'contacts':
					if(store) {
						const contacts = Object.values(store.contacts)
						console.log('Recent contacts:')
						if(contacts.length === 0) {
							console.log('No contacts found')
						} else {
							contacts.slice(0, 10).forEach((contact, index) => {
								console.log(`${index + 1}. ${contact.id} - ${contact.name || contact.notify || 'Unknown'}`)
							})
						}
					} else {
						console.log('Store not available')
					}
					break
					
				case 'presence':
					if(args.length >= 1) {
						const jid = args[0]
						const presenceInput = args[1] || 'available'
						const validPresenceTypes: WAPresence[] = ['available', 'unavailable', 'composing', 'recording', 'paused']
						
						if(validPresenceTypes.includes(presenceInput as WAPresence)) {
							const presenceType = presenceInput as WAPresence
							try {
								await sock.sendPresenceUpdate(presenceType, jid)
								console.log(`Presence updated to ${presenceType} for ${jid}`)
							} catch (error) {
								console.log(`Failed to update presence: ${error}`)
							}
						} else {
							console.log(`Invalid presence type: ${presenceInput}`)
							console.log('Valid types: available, unavailable, composing, recording, paused')
						}
					} else {
						console.log('Usage: presence <jid> [type]')
						console.log('Types: available, unavailable, composing, recording, paused')
					}
					break
					
				case 'read':
					if(args.length >= 1) {
						const jid = args[0]
						if(store) {
							const messages = store.messages[jid]
							if(messages && messages.array.length > 0) {
								const lastMsg = messages.array[messages.array.length - 1]
								try {
									await sock.readMessages([lastMsg.key])
									console.log(`Marked messages as read for ${jid}`)
								} catch (error) {
									console.log(`Failed to mark as read: ${error}`)
								}
							} else {
								console.log(`No messages found for ${jid}`)
							}
						} else {
							console.log('Store not available')
						}
					} else {
						console.log('Usage: read <jid>')
					}
					break
					
				case 'react':
					if(args.length >= 3) {
						const user = args[0]
						const messageId = args[1]
						const reaction = args[2]
						
						// Convert user number to JID format
						const jid = user.includes('@') ? user : `${user}@s.whatsapp.net`
						
						try {
							// Create message key for the reaction target
							const messageKey = {
								remoteJid: jid,
								id: messageId,
								fromMe: false // Set to true if reacting to your own message
							}
							
							await sock.sendMessage(jid, {
								react: {
									text: reaction,
									key: messageKey
								}
							})
							
							console.log(`Reaction "${reaction}" sent to message ${messageId} for user ${user}`)
						} catch (error) {
							console.log(`Failed to send reaction: ${error}`)
						}
					} else if(args.length >= 2) {
						const user = args[0]
						const reaction = args[1]
						
						// Convert user number to JID format
						const jid = user.includes('@') ? user : `${user}@s.whatsapp.net`
						
						// React to the last message in the chat
						if(store) {
							const messages = store.messages[jid]
							if(messages && messages.array.length > 0) {
								const lastMsg = messages.array[messages.array.length - 1]
								try {
									await sock.sendMessage(jid, {
										react: {
											text: reaction,
											key: lastMsg.key
										}
									})
									console.log(`Reaction "${reaction}" sent to last message for user ${user}`)
									console.log(`Message ID: ${lastMsg.key.id}`)
								} catch (error) {
									console.log(`Failed to send reaction: ${error}`)
								}
							} else {
								console.log(`No messages found for user ${user}`)
							}
						} else {
							console.log('Store not available - please provide message ID')
							console.log('Usage: react <user> <messageId> <emoji>')
						}
					} else {
						console.log('Usage: react <user> <emoji>                - React to last message')
						console.log('       react <user> <messageId> <emoji>    - React to specific message')
						console.log('       react <user> ""                     - Remove reaction from last message')
						console.log('')
						console.log('Examples:')
						console.log('  react 1234567890 👍')
						console.log('  react 1234567890 ABCD1234 ❤️')
						console.log('  react 1234567890 "" (remove reaction)')
						console.log('  react 1234567890@s.whatsapp.net 😂 (full JID also supported)')
					}
					break
					
				case 'silentping':
					if(args.length >= 2) {
						const user = args[0]
						const deviceId = parseInt(args[1])
						let actualMessageId = ''
						let randomMessageId = ''
						
						try {
							console.log(`📡 Sending silent ping to device ${deviceId} of user ${user}...`)
							
							// Convert user number to JID format
							const jid = user.includes('@') ? user : `${user}@s.whatsapp.net`
							
							// Generate a realistic WhatsApp message ID using the proper function
							randomMessageId = generateMessageIDV2(sock.user?.id)
							
							// Generate the actual message ID that will be used for relaying
							actualMessageId = generateMessageIDV2(sock.user?.id)
							
							console.log(`📤 Tracking message ID: ${actualMessageId}`)
							console.log(`🎯 Targeting reaction to random ID: ${randomMessageId}`)
							console.log(`🔧 Relay message ID: ${actualMessageId}`)
							
							// Set up timeout for this ping (30 seconds)
							const timeoutId = setTimeout(() => {
								if(pendingSilentPings.has(actualMessageId)) {
									console.log(`⏰ Silent ping timeout for ${user}:${deviceId} (no response after 30s)`)
									pendingSilentPings.delete(actualMessageId)
								}
							}, 30000)
							
							// Track this silent ping using the actualMessageId (which gets the receipts)
							pendingSilentPings.set(actualMessageId, {
								user,
								deviceId,
								timestamp: Date.now(),
								timeoutId,
								type: 'reaction'
							})
							
							// Create device-specific JID for the participant (same as sendtodevice)
							const deviceSpecificJid = deviceId !== undefined ? `${user}:${deviceId}@s.whatsapp.net` : jid
							
							// Create reaction message content in proper proto.IMessage format
							const reactionMessage = {
								reactionMessage: {
									key: {
										remoteJid: jid,
										id: randomMessageId,
										fromMe: false // Random message, not from us
									},
									text: '', // Empty string removes reaction
									senderTimestampMs: Date.now()
								}
							}
							
							// Use relayMessage with specific participant to target only the specified device
							await sock.relayMessage(jid, reactionMessage, {
								messageId: actualMessageId, // Use the tracked message ID
								participant: {
									jid: deviceSpecificJid,
									count: 0
								}
							})
							
							console.log(`✅ Silent ping sent! Waiting for response... (timeout: 30s)`)
							console.log(`💡 Watch for notification receipts to track device activity`)
							
						} catch (error) {
							// Clean up tracking on error if it was set up
							if(pendingSilentPings.has(actualMessageId)) {
								clearTimeout(pendingSilentPings.get(actualMessageId)!.timeoutId)
								pendingSilentPings.delete(actualMessageId)
							}
							
							console.log(`❌ Silent ping failed: ${error}`)
						}
					} else {
						console.log('Usage: silentping <user> <deviceId>')
						console.log('Examples:')
						console.log('  silentping 1234567890 0           - Ping primary device')
						console.log('  silentping 1234567890 1           - Ping secondary device')
						console.log('  silentping 1234567890 2           - Ping device 2')
						console.log('')
						console.log('Note: This sends a reaction removal to a non-existing message')
						console.log('      to create a subtle notification ping to the specific device.')
					}
					break
					
				case 'silentping2':
					if(args.length >= 2) {
						const user = args[0]
						const deviceId = parseInt(args[1])
						let actualMessageId = ''
						let randomMessageId = ''
						
						try {
							console.log(`📡 Sending delete-based silent ping to device ${deviceId} of user ${user}...`)
							
							// Convert user number to JID format
							const jid = user.includes('@') ? user : `${user}@s.whatsapp.net`
							
							// Generate a realistic WhatsApp message ID using the proper function
							randomMessageId = generateMessageIDV2(sock.user?.id)
							
							// Generate the actual message ID that will be used for relaying
							actualMessageId = generateMessageIDV2(sock.user?.id)
							
							console.log(`📤 Tracking message ID: ${actualMessageId}`)
							console.log(`🎯 Targeting delete to random ID: ${randomMessageId}`)
							console.log(`🔧 Relay message ID: ${actualMessageId}`)
							
							// Set up timeout for this ping (30 seconds)
							const timeoutId = setTimeout(() => {
								if(pendingSilentPings.has(actualMessageId)) {
									console.log(`⏰ Delete-based silent ping timeout for ${user}:${deviceId} (no response after 30s)`)
									pendingSilentPings.delete(actualMessageId)
								}
							}, 30000)
							
							// Track this silent ping
							pendingSilentPings.set(actualMessageId, {
								user,
								deviceId,
								timestamp: Date.now(),
								timeoutId,
								type: 'delete'
							})
							
							// Create device-specific JID for the participant
							const deviceSpecificJid = deviceId !== undefined ? `${user}:${deviceId}@s.whatsapp.net` : jid
							
							// Create a delete message targeting a non-existent message
							const deleteMessage = {
								protocolMessage: {
									type: 0, // REVOKE
									key: {
										remoteJid: jid,
										id: randomMessageId,
										fromMe: false
									}
								}
							}
							
							// Log delete ping message fields
							console.log(`📋 Delete Ping Message Fields:`)
							console.log(`   protocolMessage.type: ${deleteMessage.protocolMessage.type} (REVOKE)`)
							console.log(`   protocolMessage.key.remoteJid: ${deleteMessage.protocolMessage.key.remoteJid}`)
							console.log(`   protocolMessage.key.id: ${deleteMessage.protocolMessage.key.id}`)
							console.log(`   protocolMessage.key.fromMe: ${deleteMessage.protocolMessage.key.fromMe}`)
							console.log(`   Target device JID: ${deviceSpecificJid}`)
							console.log(`   Relay message ID: ${actualMessageId}`)

							console.log(`📋 Delete Ping Message : ${deleteMessage}`)
							
							await sock.relayMessage(jid, deleteMessage, {
								messageId: actualMessageId,
								participant: {
									jid: deviceSpecificJid,
									count: 0
								}
							})
							
							console.log(`✅ Delete-based silent ping sent! Waiting for response... (timeout: 30s)`)
							console.log(`🕒 Started at: ${new Date().toLocaleTimeString()}`)
							
						} catch (error) {
							// Clean up tracking on error
							if(pendingSilentPings.has(actualMessageId)) {
								clearTimeout(pendingSilentPings.get(actualMessageId)!.timeoutId)
								pendingSilentPings.delete(actualMessageId)
							}
							
							console.log(`❌ Delete-based silent ping failed: ${error}`)
						}
					} else {
						console.log('Usage: silentping2 <user> <deviceId>')
						console.log('Examples:')
						console.log('  silentping2 1234567890 0           - Ping primary device with delete')
						console.log('  silentping2 1234567890 1           - Ping secondary device with delete')
						console.log('  silentping2 1234567890 2           - Ping device 2 with delete')
						console.log('')
						console.log('Note: This sends a delete request to a non-existing message')
						console.log('      to create a subtle notification ping to the specific device.')
					}
					break
					
				case 'silentping3':
					if(args.length >= 2) {
						const user = args[0]
						const deviceId = parseInt(args[1])
						let actualMessageId = ''
						let randomMessageId = ''
						
						try {
							console.log(`📡 Sending edit-based silent ping to device ${deviceId} of user ${user}...`)
							
							// Convert user number to JID format
							const jid = user.includes('@') ? user : `${user}@s.whatsapp.net`
							const deviceSpecificJid = deviceId !== undefined ? `${user}:${deviceId}@s.whatsapp.net` : jid
							
							// Generate IDs
							actualMessageId = generateMessageIDV2(sock.user?.id)
							randomMessageId = generateMessageIDV2(sock.user?.id)
							
							console.log(`📤 Tracking message ID: ${actualMessageId}`)
							console.log(`🎯 Targeting edit to random ID: ${randomMessageId}`)
							
							// Track this silent ping with timeout
							const timeoutId = setTimeout(() => {
								if(pendingSilentPings.has(actualMessageId)) {
									console.log(`⏰ Edit-based silent ping timeout for ${user}:${deviceId} (no response after 30s)`)
									pendingSilentPings.delete(actualMessageId)
								}
							}, 30000)
							
							pendingSilentPings.set(actualMessageId, {
								user,
								deviceId,
								timestamp: Date.now(),
								timeoutId,
								type: 'edit'
							})
							
							// Create an edit message targeting a non-existent message
							const editMessage = {
								protocolMessage: {
									type: 14, // MESSAGE_EDIT
									key: {
										remoteJid: jid,
										id: randomMessageId,
										fromMe: false
									},
									editedMessage: {
										conversation: ''
									}
								}
							}
							
							await sock.relayMessage(jid, editMessage, {
								messageId: actualMessageId,
								participant: {
									jid: deviceSpecificJid,
									count: 0
								}
							})
							
							console.log(`✅ Edit-based silent ping sent! Waiting for response... (timeout: 30s)`)
							console.log(`🕒 Started at: ${new Date().toLocaleTimeString()}`)
							
						} catch (error) {
							// Clean up tracking on error
							if(pendingSilentPings.has(actualMessageId)) {
								clearTimeout(pendingSilentPings.get(actualMessageId)!.timeoutId)
								pendingSilentPings.delete(actualMessageId)
							}
							
							console.log(`❌ Edit-based silent ping failed: ${error}`)
						}
					} else {
						console.log('Usage: silentping3 <user> <deviceId>')
						console.log('Examples:')
						console.log('  silentping3 1234567890 0           - Ping primary device with edit')
						console.log('  silentping3 1234567890 1           - Ping secondary device with edit')
						console.log('  silentping3 1234567890 2           - Ping device 2 with edit')
						console.log('')
						console.log('Note: This sends an edit request to a non-existing message')
						console.log('      to create a subtle notification ping to the specific device.')
					}
					break
					
				case 'silentping4':
					if(args.length >= 2) {
						const user = args[0]
						const deviceId = parseInt(args[1])
						let actualMessageId = ''
						let randomCallId = ''
						
						try {
							console.log(`📡 Sending call-reject based silent ping to device ${deviceId} of user ${user}...`)
							
							// Convert user number to JID format
							const jid = user.includes('@') ? user : `${user}@s.whatsapp.net`
							const deviceSpecificJid = deviceId !== undefined ? `${user}:${deviceId}@s.whatsapp.net` : jid
							
							// Generate IDs
							actualMessageId = generateMessageIDV2(sock.user?.id)
							randomCallId = generateMessageIDV2(sock.user?.id) // Use message ID generator for call ID
							
							console.log(`📤 Tracking message ID: ${actualMessageId}`)
							console.log(`📞 Rejecting random call ID: ${randomCallId}`)
							
							// Track this silent ping with timeout
							const timeoutId = setTimeout(() => {
								if(pendingSilentPings.has(actualMessageId)) {
									console.log(`⏰ Call-reject based silent ping timeout for ${user}:${deviceId} (no response after 30s)`)
									pendingSilentPings.delete(actualMessageId)
								}
							}, 30000)
							
							pendingSilentPings.set(actualMessageId, {
								user,
								deviceId,
								timestamp: Date.now(),
								timeoutId,
								type: 'call-reject'
							})
							
							// Create call reject message using protocolMessage for proper receipt tracking
							// WhatsApp call ID format: typically the message ID or a unique call identifier
							const whatsappCallId = randomCallId; // Use the random message ID as call ID
							const callRejectMessage = {
								protocolMessage: {
									type: 22, // CALL_LOG_MESSAGE type for call events  
									key: {
										remoteJid: jid,
										id: randomCallId,
										fromMe: false
									},
									callLogMessage: {
										isVideo: false,
										callOutcome: 3, // REJECTED (1=CONNECTED, 2=NO_ANSWER, 3=REJECTED, 4=FAILED)
										durationSecs: 0,
										isGroup: false,
										callId: whatsappCallId, // Use the same ID as the message key
										scheduledCallCreationMessage: null,
										participants: [{
											jid: deviceSpecificJid,
											callOutcome: 3 // REJECTED
										}]
									}
								}
							}
							
							console.log('📋 Call-reject message details:')
							console.log(`   - Call ID: ${whatsappCallId}`)
							console.log(`   - Target JID: ${jid}`)
							console.log(`   - Device-specific JID: ${deviceSpecificJid}`)
							console.log(`   - Random message ID: ${randomCallId}`)
							console.log(`   - Actual tracking ID: ${actualMessageId}`)
							console.log(`   - Protocol type: ${callRejectMessage.protocolMessage.type}`)
							console.log(`   - Call outcome: ${callRejectMessage.protocolMessage.callLogMessage?.callOutcome} (3=REJECTED)`)
							console.log(`   - Message structure:`, JSON.stringify(callRejectMessage, null, 2))
							
							// Send using relayMessage for proper receipt tracking
							await sock.relayMessage(jid, callRejectMessage, {
								messageId: actualMessageId,
								participant: {
									jid: deviceSpecificJid,
									count: 0
								}
							})
							
							console.log(`✅ Call-reject ping sent! Waiting for receipt responses... (timeout: 30s)`)
							console.log(`🕒 Started at: ${new Date().toLocaleTimeString()}`)
							
						} catch (error) {
							// Clean up tracking on error
							if(pendingSilentPings.has(actualMessageId)) {
								clearTimeout(pendingSilentPings.get(actualMessageId)!.timeoutId)
								pendingSilentPings.delete(actualMessageId)
							}
							
							console.log(`❌ Call-reject based silent ping failed: ${error}`)
						}
					} else {
						console.log('Usage: silentping4 <user> <deviceId>')
						console.log('Examples:')
						console.log('  silentping4 1234567890 0           - Ping primary device with call reject')
						console.log('  silentping4 1234567890 1           - Ping secondary device with call reject')
						console.log('  silentping4 1234567890 2           - Ping device 2 with call reject')
						console.log('')
						console.log('Note: This sends a call reject to a non-existing call ID')
						console.log('      to create a subtle notification ping to the specific device.')
					}
					break
					
				case 'silentping5':
					if(args.length >= 2) {
						const user = args[0]
						const deviceId = parseInt(args[1])
						let actualMessageId = ''
						let randomMessageId = ''
						
						try {
							console.log(`📡 Sending unknown protocol message ping to device ${deviceId} of user ${user}...`)
							
							// Convert user number to JID format
							const jid = user.includes('@') ? user : `${user}@s.whatsapp.net`
							const deviceSpecificJid = deviceId !== undefined ? `${user}:${deviceId}@s.whatsapp.net` : jid
							
							// Generate IDs
							actualMessageId = generateMessageIDV2(sock.user?.id)
							randomMessageId = generateMessageIDV2(sock.user?.id)
							
							console.log(`📤 Tracking message ID: ${actualMessageId}`)
							console.log(`🎯 Targeting unknown protocol to random ID: ${randomMessageId}`)
							
							// Set up timeout for this ping (30 seconds)
							const timeoutId = setTimeout(() => {
								if(pendingSilentPings.has(actualMessageId)) {
									console.log(`⏰ Unknown protocol ping timeout for ${user}:${deviceId} (no response after 30s)`)
									pendingSilentPings.delete(actualMessageId)
								}
							}, 30000)
							
							pendingSilentPings.set(actualMessageId, {
								user,
								deviceId,
								timestamp: Date.now(),
								timeoutId,
								type: 'unknown'
							})
							
							// Create unknown protocol message using non-existent type 101
							const unknownProtocolMessage = {
								protocolMessage: {
									type: 101, // NON-EXISTENT protocol message type
									key: {
										remoteJid: jid,
										id: randomMessageId,
										fromMe: false
									}
								}
							}
							
							console.log('📋 Unknown protocol message details:')
							console.log(`   - Protocol type: 101 (NON-EXISTENT)`)
							console.log(`   - Target JID: ${jid}`)
							console.log(`   - Device-specific JID: ${deviceSpecificJid}`)
							console.log(`   - Random message ID: ${randomMessageId}`)
							console.log(`   - Actual tracking ID: ${actualMessageId}`)
							console.log(`   - Message structure:`, JSON.stringify(unknownProtocolMessage, null, 2))
							
							// Send using relayMessage for proper receipt tracking
							await sock.relayMessage(jid, unknownProtocolMessage, {
								messageId: actualMessageId,
								participant: {
									jid: deviceSpecificJid,
									count: 0
								}
							})
							
							console.log(`✅ Unknown protocol ping sent! Waiting for receipt responses... (timeout: 30s)`)
							console.log(`🕒 Started at: ${new Date().toLocaleTimeString()}`)
							
						} catch (error) {
							// Clean up tracking on error
							if(pendingSilentPings.has(actualMessageId)) {
								clearTimeout(pendingSilentPings.get(actualMessageId)!.timeoutId)
								pendingSilentPings.delete(actualMessageId)
							}
							
							console.log(`❌ Unknown protocol ping failed: ${error}`)
						}
					} else {
						console.log('Usage: silentping5 <user> <deviceId>')
						console.log('Examples:')
						console.log('  silentping5 1234567890 0           - Ping primary device with unknown protocol')
						console.log('  silentping5 1234567890 1           - Ping secondary device with unknown protocol')
						console.log('  silentping5 1234567890 2           - Ping device 2 with unknown protocol')
						console.log('')
						console.log('Note: This sends a protocol message with type 101 (non-existent)')
						console.log('      to test how WhatsApp handles unknown protocol messages.')
					}
					break
					
				case 'silentping6':
					if(args.length >= 2) {
						const user = args[0]
						const deviceId = parseInt(args[1])
						
						try {
							console.log(`Starting poll response-based silent ping to device ${deviceId} of user ${user}...`)
							console.log(`Timestamp: ${new Date().toISOString()}`)
							
							// Convert user number to JID format
							const jid = user.includes('@') ? user : `${user}@s.whatsapp.net`
							
							// Generate a random message ID for the non-existent poll
							const randomMessageId = generateMessageIDV2(sock.user?.id)
							
							// Generate the actual message ID for tracking
							const actualMessageId = generateMessageIDV2(sock.user?.id)
							
							// Create device-specific JID for targeting
							const deviceSpecificJid = deviceId !== undefined ? `${user}:${deviceId}@s.whatsapp.net` : jid
							
							console.log(`📤 Tracking message ID: ${actualMessageId}`)
							console.log(`🎯 Targeting poll response to random poll ID: ${randomMessageId}`)
							console.log(`📱 Device-specific JID: ${deviceSpecificJid}`)
							
							// Create a poll response message targeting a non-existent poll
							// Use a simple encrypted vote structure
							const message = {
								pollUpdateMessage: {
									pollCreationMessageKey: {
										remoteJid: jid,
										id: randomMessageId,
										fromMe: false
									},
									vote: {
										encPayload: Buffer.from('fake_encrypted_vote'),
										encIv: Buffer.from('fake_iv_12345')
									}
								}
							}
							
							console.log('📋 Poll response message structure:', JSON.stringify(message, null, 2))
							
							// Set up timeout (30 seconds)
							const timeoutId = setTimeout(() => {
								if(pendingSilentPings.has(actualMessageId)) {
									console.log(`⏰ Poll response ping timeout for ${user}:${deviceId} (no response after 30s)`)
									pendingSilentPings.delete(actualMessageId)
								}
							}, 30000)
							
							// Track this silent ping using the actualMessageId (which gets the receipts)
							pendingSilentPings.set(actualMessageId, {
								user,
								deviceId,
								timestamp: Date.now(),
								timeoutId,
								type: 'poll-response'
							})
							
							// Send the poll response message using relayMessage for proper receipt tracking
							await sock.relayMessage(jid, message, {
								messageId: actualMessageId,
								participant: {
									jid: deviceSpecificJid,
									count: 0
								}
							})
							
							console.log(`✅ Poll response-based silent ping sent! Waiting for response... (timeout: 30s)`)
						} catch (error) {
							// Clean up tracking on error
							const actualMessageId = generateMessageIDV2(sock.user?.id)
							if(pendingSilentPings.has(actualMessageId)) {
								pendingSilentPings.delete(actualMessageId)
							}
							
							console.log(`❌ Poll response ping failed: ${error}`)
						}
					} else {
						console.log('Usage: silentping6 <user> <deviceId>')
						console.log('Examples:')
						console.log('  silentping6 1234567890 0           - Ping primary device with poll response')
						console.log('  silentping6 1234567890 1           - Ping secondary device with poll response')
						console.log('  silentping6 1234567890 2           - Ping device 2 with poll response')
						console.log('')
						console.log('Note: This sends a poll response targeting a non-existent poll')
						console.log('      to test device connectivity via poll response tracking.')
					}
					break
					
				case 'silentping7':
					if(args.length >= 2) {
						const user = args[0]
						const deviceId = parseInt(args[1])
						
						try {
							console.log(`Starting button response-based silent ping to device ${deviceId} of user ${user}...`)
							console.log(`Timestamp: ${new Date().toISOString()}`)
							
							// Convert user number to JID format
							const jid = user.includes('@') ? user : `${user}@s.whatsapp.net`
							
							// Generate a random message ID for the non-existent button message
							const randomMessageId = generateMessageIDV2(sock.user?.id)
							
							// Generate the actual message ID for tracking
							const actualMessageId = generateMessageIDV2(sock.user?.id)
							
							// Create device-specific JID for targeting
							const deviceSpecificJid = deviceId !== undefined ? `${user}:${deviceId}@s.whatsapp.net` : jid
							
							console.log(`📤 Tracking message ID: ${actualMessageId}`)
							console.log(`🎯 Targeting button response to random button message ID: ${randomMessageId}`)
							console.log(`📱 Device-specific JID: ${deviceSpecificJid}`)
							
							// Create a button response message targeting a non-existent button message
							const message = {
								buttonsResponseMessage: {
									selectedButtonId: 'fake_button_id',
									contextInfo: {
										stanzaId: randomMessageId,
										participant: deviceSpecificJid
									},
									type: 1 // SINGLE_SELECT
								}
							}
							
							console.log('📋 Button response message structure:', JSON.stringify(message, null, 2))
							
							// Set up timeout (30 seconds)
							const timeoutId = setTimeout(() => {
								if(pendingSilentPings.has(actualMessageId)) {
									console.log(`⏰ Button response ping timeout for ${user}:${deviceId} (no response after 30s)`)
									pendingSilentPings.delete(actualMessageId)
								}
							}, 30000)
							
							// Track this silent ping using the actualMessageId (which gets the receipts)
							pendingSilentPings.set(actualMessageId, {
								user,
								deviceId,
								timestamp: Date.now(),
								timeoutId,
								type: 'button-response'
							})
							
							// Send the button response message using relayMessage for proper receipt tracking
							await sock.relayMessage(jid, message, {
								messageId: actualMessageId,
								participant: {
									jid: deviceSpecificJid,
									count: 0
								}
							})
							
							console.log(`✅ Button response-based silent ping sent! Waiting for response... (timeout: 30s)`)
						} catch (error) {
							// Clean up tracking on error
							const actualMessageId = generateMessageIDV2(sock.user?.id)
							if(pendingSilentPings.has(actualMessageId)) {
								pendingSilentPings.delete(actualMessageId)
							}
							
							console.log(`❌ Button response ping failed: ${error}`)
						}
					} else {
						console.log('Usage: silentping7 <user> <deviceId>')
						console.log('Examples:')
						console.log('  silentping7 1234567890 0           - Ping primary device with button response')
						console.log('  silentping7 1234567890 1           - Ping secondary device with button response')
						console.log('  silentping7 1234567890 2           - Ping device 2 with button response')
						console.log('')
						console.log('Note: This sends a button response targeting a non-existent button message')
						console.log('      to test device interactive UI capabilities.')
					}
					break
					
				case 'silentping8':
					if(args.length >= 2) {
						const user = args[0]
						const deviceId = parseInt(args[1])
						
						try {
							console.log(`Starting device sent-based silent ping to device ${deviceId} of user ${user}...`)
							console.log(`Timestamp: ${new Date().toISOString()}`)
							
							// Convert user number to JID format
							const jid = user.includes('@') ? user : `${user}@s.whatsapp.net`
							
							// Generate the actual message ID for tracking
							const actualMessageId = generateMessageIDV2(sock.user?.id)
							
							// Create device-specific JID for targeting
							const deviceSpecificJid = deviceId !== undefined ? `${user}:${deviceId}@s.whatsapp.net` : jid
							
							console.log(`📤 Tracking message ID: ${actualMessageId}`)
							console.log(`🎯 Targeting device coordination message`)
							console.log(`📱 Device-specific JID: ${deviceSpecificJid}`)
							
							// Create a device sent message for multi-device coordination
							const message = {
								deviceSentMessage: {
									destinationJid: deviceSpecificJid,
									message: {
										conversation: 'fake_device_coordination_message'
									},
									phash: 'fake_participant_hash'
								}
							}
							
							console.log('📋 Device sent message structure:', JSON.stringify(message, null, 2))
							
							// Set up timeout (30 seconds)
							const timeoutId = setTimeout(() => {
								if(pendingSilentPings.has(actualMessageId)) {
									console.log(`⏰ Device sent ping timeout for ${user}:${deviceId} (no response after 30s)`)
									pendingSilentPings.delete(actualMessageId)
								}
							}, 30000)
							
							// Track this silent ping using the actualMessageId (which gets the receipts)
							pendingSilentPings.set(actualMessageId, {
								user,
								deviceId,
								timestamp: Date.now(),
								timeoutId,
								type: 'device-sent'
							})
							
							// Send the device sent message using relayMessage for proper receipt tracking
							await sock.relayMessage(jid, message, {
								messageId: actualMessageId,
								participant: {
									jid: deviceSpecificJid,
									count: 0
								}
							})
							
							console.log(`✅ Device sent-based silent ping sent! Waiting for response... (timeout: 30s)`)
						} catch (error) {
							// Clean up tracking on error
							const actualMessageId = generateMessageIDV2(sock.user?.id)
							if(pendingSilentPings.has(actualMessageId)) {
								pendingSilentPings.delete(actualMessageId)
							}
							
							console.log(`❌ Device sent ping failed: ${error}`)
						}
					} else {
						console.log('Usage: silentping8 <user> <deviceId>')
						console.log('Examples:')
						console.log('  silentping8 1234567890 0           - Ping primary device with device coordination')
						console.log('  silentping8 1234567890 1           - Ping secondary device with device coordination')
						console.log('  silentping8 1234567890 2           - Ping device 2 with device coordination')
						console.log('')
						console.log('Note: This sends a device sent message for multi-device coordination testing')
						console.log('      to test device sync and hierarchy behavior.')
					}
					break
					
				// COMMENTED OUT - TypeScript errors with IMessage interface
				/* case 'silentping9':
					if(args.length >= 2) {
						const user = args[0]
						const deviceId = parseInt(args[1])
						
						try {
							console.log(`Starting app state-based silent ping to device ${deviceId} of user ${user}...`)
							console.log(`Timestamp: ${new Date().toISOString()}`)
							
							// Convert user number to JID format
							const jid = user.includes('@') ? user : `${user}@s.whatsapp.net`
							
							// Generate the actual message ID for tracking
							const actualMessageId = generateMessageIDV2(sock.user?.id)
							
							// Create device-specific JID for targeting
							const deviceSpecificJid = deviceId !== undefined ? `${user}:${deviceId}@s.whatsapp.net` : jid
							
							console.log(`📤 Tracking message ID: ${actualMessageId}`)
							console.log(`🎯 Targeting app state fatal exception notification`)
							console.log(`📱 Device-specific JID: ${deviceSpecificJid}`)
							
							// Create an app state fatal exception notification with fake data
							const message = {
								appStateFatalExceptionNotification: {
									collectionNames: ['fake_collection_1', 'fake_collection_2'],
									timestamp: Date.now()
								}
							}
							
							console.log('📋 App state message structure:', JSON.stringify(message, null, 2))
							
							// Set up timeout (30 seconds)
							const timeoutId = setTimeout(() => {
								if(pendingSilentPings.has(actualMessageId)) {
									console.log(`⏰ App state ping timeout for ${user}:${deviceId} (no response after 30s)`)
									pendingSilentPings.delete(actualMessageId)
								}
							}, 30000)
							
							// Track this silent ping using the actualMessageId (which gets the receipts)
							pendingSilentPings.set(actualMessageId, {
								user,
								deviceId,
								timestamp: Date.now(),
								timeoutId,
								type: 'app-state'
							})
							
							// Send the app state message using relayMessage for proper receipt tracking
							await sock.relayMessage(jid, message, {
								messageId: actualMessageId,
								participant: {
									jid: deviceSpecificJid,
									count: 0
								}
							})
							
							console.log(`✅ App state-based silent ping sent! Waiting for response... (timeout: 30s)`)
						} catch (error) {
							// Clean up tracking on error
							const actualMessageId = generateMessageIDV2(sock.user?.id)
							if(pendingSilentPings.has(actualMessageId)) {
								pendingSilentPings.delete(actualMessageId)
							}
							
							console.log(`❌ App state ping failed: ${error}`)
						}
					} else {
						console.log('Usage: silentping9 <user> <deviceId>')
						console.log('Examples:')
						console.log('  silentping9 1234567890 0           - Ping primary device with app state exception')
						console.log('  silentping9 1234567890 1           - Ping secondary device with app state exception')
						console.log('  silentping9 1234567890 2           - Ping device 2 with app state exception')
						console.log('')
						console.log('Note: This sends an app state fatal exception notification')
						console.log('      to test low-level app state handling and internal behavior.')
					}
					break */
					
				// COMMENTED OUT - TypeScript errors with IMessage interface
				/* case 'silentping10':
					if(args.length >= 2) {
						const user = args[0]
						const deviceId = parseInt(args[1])
						
						try {
							console.log(`Starting peer data operation-based silent ping to device ${deviceId} of user ${user}...`)
							console.log(`Timestamp: ${new Date().toISOString()}`)
							
							// Convert user number to JID format
							const jid = user.includes('@') ? user : `${user}@s.whatsapp.net`
							
							// Generate a random message ID for the peer operation request
							const randomMessageId = generateMessageIDV2(sock.user?.id)
							
							// Generate the actual message ID for tracking
							const actualMessageId = generateMessageIDV2(sock.user?.id)
							
							// Create device-specific JID for targeting
							const deviceSpecificJid = deviceId !== undefined ? `${user}:${deviceId}@s.whatsapp.net` : jid
							
							console.log(`📤 Tracking message ID: ${actualMessageId}`)
							console.log(`🎯 Targeting peer data operation request ID: ${randomMessageId}`)
							console.log(`📱 Device-specific JID: ${deviceSpecificJid}`)
							
							// Create a peer data operation request message for P2P data operations
							const operationData = Buffer.from('fake_peer_operation_data_request_' + Date.now())
							const message = {
								peerDataOperationRequestMessage: {
									peerDataOperationRequestType: 1, // Fake operation type
									peerDataOperationRequestMessageType: 1, // Fake message type
									requestId: randomMessageId,
									applicationData: operationData
								}
							}
							
							console.log('📋 Peer data operation request message structure:')
							console.log(`   - Operation type: 1 (FAKE)`)
							console.log(`   - Message type: 1 (FAKE)`)
							console.log(`   - Request ID: ${randomMessageId}`)
							console.log(`   - Application data: ${operationData.length} bytes`)
							console.log(JSON.stringify({
								...message,
								peerDataOperationRequestMessage: {
									...message.peerDataOperationRequestMessage,
									applicationData: `Buffer(${operationData.length} bytes)`
								}
							}, null, 2))
							
							// Set up timeout (30 seconds)
							const timeoutId = setTimeout(() => {
								if(pendingSilentPings.has(actualMessageId)) {
									console.log(`⏰ Peer data operation ping timeout for ${user}:${deviceId} (no response after 30s)`)
									pendingSilentPings.delete(actualMessageId)
								}
							}, 30000)
							
							// Track this silent ping using the actualMessageId (which gets the receipts)
							pendingSilentPings.set(actualMessageId, {
								user,
								deviceId,
								timestamp: Date.now(),
								timeoutId,
								type: 'peer-data-operation'
							})
							
							// Send the peer data operation request using relayMessage for proper receipt tracking
							await sock.relayMessage(jid, message, {
								messageId: actualMessageId,
								participant: {
									jid: deviceSpecificJid,
									count: 0
								}
							})
							
							console.log(`✅ Peer data operation-based silent ping sent! Waiting for response... (timeout: 30s)`)
						} catch (error) {
							// Clean up tracking on error
							const actualMessageId = generateMessageIDV2(sock.user?.id)
							if(pendingSilentPings.has(actualMessageId)) {
								pendingSilentPings.delete(actualMessageId)
							}
							
							console.log(`❌ Peer data operation ping failed: ${error}`)
						}
					} else {
						console.log('Usage: silentping10 <user> <deviceId>')
						console.log('Examples:')
						console.log('  silentping10 1234567890 0           - Ping primary device with peer data operation')
						console.log('  silentping10 1234567890 1           - Ping secondary device with peer data operation')
						console.log('  silentping10 1234567890 2           - Ping device 2 with peer data operation')
						console.log('')
						console.log('Note: This sends a peer data operation request message')
						console.log('      to test P2P data operations and device coordination capabilities.')
					}
					break */
					
				case 'silentping11':
					if(args.length >= 2) {
						const user = args[0]
						const deviceId = parseInt(args[1])
						
						try {
							console.log(`Starting malformed message-based silent ping to device ${deviceId} of user ${user}...`)
							console.log(`Timestamp: ${new Date().toISOString()}`)
							
							// Convert user number to JID format
							const jid = user.includes('@') ? user : `${user}@s.whatsapp.net`
							
							// Generate tracking message ID
							const actualMessageId = generateMessageIDV2(sock.user?.id)
							const deviceSpecificJid = deviceId !== undefined ? `${user}:${deviceId}@s.whatsapp.net` : jid
							
							console.log(`📤 Tracking message ID: ${actualMessageId}`)
							console.log(`📍 Device-specific JID: ${deviceSpecificJid}`)
							
							// Set up timeout for this ping (30 seconds)
							const timeoutId = setTimeout(() => {
								if(pendingSilentPings.has(actualMessageId)) {
									console.log(`⏰ Malformed message ping timeout for ${user}:${deviceId} (no response after 30s)`)
									pendingSilentPings.delete(actualMessageId)
								}
							}, 30000)
							
							// Track this silent ping
							pendingSilentPings.set(actualMessageId, {
								user,
								deviceId,
								timestamp: Date.now(),
								timeoutId,
								type: 'malformed-message'
							})
							
							// Create malformed message with invalid field name (violates proto.Message specification)
							const malformedMessage = {
								// ❌ INVALID FIELD: 'conversation1' is not a recognized proto.Message field
								// Valid field would be 'conversation', but 'conversation1' should trigger validation errors
								conversation1: 'fake_malformed_message_content',
								messageContextInfo: {
									deviceListMetadata: {
										senderKeyHash: Buffer.from('fake_sender_key_hash_' + Date.now()),
										senderTimestamp: Date.now()
									},
									deviceListMetadataVersion: 1
								}
							}
							
							console.log('📋 Malformed message details:')
							console.log(`   - INVALID FIELD: 'conversation1' (should be 'conversation')`)
							console.log(`   - Target JID: ${jid}`)
							console.log(`   - Device-specific JID: ${deviceSpecificJid}`)
							console.log(`   - This violates proto.Message specification - should cause PLAINTEXT_BYTE_MISMATCH`)
							console.log(`   - Message structure:`, JSON.stringify({
								...malformedMessage,
								messageContextInfo: {
									...malformedMessage.messageContextInfo,
									deviceListMetadata: {
										...malformedMessage.messageContextInfo.deviceListMetadata,
										senderKeyHash: `Buffer(${malformedMessage.messageContextInfo.deviceListMetadata.senderKeyHash.length} bytes)`
									}
								}
							}, null, 2))
							
							// Use relayMessage with specific participant to target only the specified device
							await sock.relayMessage(jid, malformedMessage, {
								messageId: actualMessageId, // Use the tracked message ID
								participant: {
									jid: deviceSpecificJid,
									count: 0
								}
							})
							
							console.log(`✅ Malformed message ping sent! Waiting for response... (timeout: 30s)`)
							
						} catch (error) {
							// Clean up tracking on error
							const actualMessageId = generateMessageIDV2(sock.user?.id)
							if(pendingSilentPings.has(actualMessageId)) {
								pendingSilentPings.delete(actualMessageId)
							}
							
							console.log(`❌ Malformed message ping failed: ${error}`)
						}
					} else {
						console.log('Usage: silentping11 <user> <deviceId>')
						console.log('Examples:')
						console.log('  silentping11 1234567890 0           - Ping primary device with malformed message')
						console.log('  silentping11 1234567890 1           - Ping secondary device with malformed message')
						console.log('  silentping11 1234567890 2           - Ping device 2 with malformed message')
						console.log('')
						console.log('Note: This sends a malformed message with invalid field name (conversation1)')
						console.log('      to test protocol buffer validation and trigger PLAINTEXT_BYTE_MISMATCH.')
					}
					break
					
				case 'devices':
					if(args.length >= 1) {
						const user = args[0]
						let jid = user.includes('@') ? user : `${user}@s.whatsapp.net`
						
						// 🔍 TRANSLATION: If user looks like a phone number, translate to WhatsApp JID first
						// This handles cases where phone number != WhatsApp ID due to number changes
						if (!user.includes('@') && /^\+?\d+$/.test(user.replace(/[^\d+]/g, ''))) {
							console.log(`🔍 Translating phone number ${user} to WhatsApp JID...`)
							try {
								const phoneResults = await sock.onWhatsApp(user)
								if (phoneResults && phoneResults.length > 0 && phoneResults[0].exists) {
									jid = phoneResults[0].jid
									console.log(`✅ Translated ${user} → ${jid}`)
								} else {
									console.log(`⚠️ Phone number ${user} not found on WhatsApp`)
									break
								}
							} catch (error) {
								console.log(`❌ Failed to translate phone number ${user}:`, error)
								// Fall back to original JID format if translation fails
								jid = `${user}@s.whatsapp.net`
							}
						}
						
						try {
							console.log(`Fetching devices for ${jid} (fresh from server, not cached)...`)
							const devices = await sock.getUSyncDevices([jid], false, false)
							
							if(devices && devices.length > 0) {
								console.log(`Devices for ${user}:`)
								devices.forEach((deviceInfo, index) => {
									console.log(`${index + 1}. User: ${deviceInfo.user}`)
									if(deviceInfo.device !== undefined) {
										console.log(`   Device ID: ${deviceInfo.device}`)
									} else {
										console.log(`   Device ID: 0 (primary device)`)
									}
								})
								
								// Group devices by user
								const devicesByUser = new Map<string, number[]>()
								devices.forEach(deviceInfo => {
									const user = deviceInfo.user
									const deviceId = deviceInfo.device || 0
									if(!devicesByUser.has(user)) {
										devicesByUser.set(user, [])
									}
									devicesByUser.get(user)!.push(deviceId)
								})
								
								console.log(`\nSummary:`)
								devicesByUser.forEach((deviceIds, user) => {
									console.log(`${user}: ${deviceIds.length} device(s) - IDs: [${deviceIds.sort((a, b) => a - b).join(', ')}]`)
								})
							} else {
								console.log(`No device information found for ${user}`)
							}
						} catch (error) {
							console.log(`Failed to get devices: ${error}`)
						}
					} else {
						console.log('Usage: devices <user>')
						console.log('Example: devices 1234567890')
						console.log('         devices 1234567890@s.whatsapp.net (also supported)')
					}
					break
					
				case 'corruptmsg':
					if(args.length >= 3) {
						const user = args[0]
						const deviceId = parseInt(args[1])
						const message = args.slice(2).join(' ')
						
						try {
							console.log(`Sending corrupted message to device ${deviceId} of user ${user}...`)
							
							// Convert user number to JID format
							const jid = user.includes('@') ? user : `${user}@s.whatsapp.net`
							
							// Create device-specific JID for the participant
							const deviceSpecificJid = deviceId !== undefined ? `${user}:${deviceId}@s.whatsapp.net` : jid
							
							// Access the signal repository to hook encryption
							const socketAny = sock as any
							const signalRepo = socketAny.signalRepository
							
							if (signalRepo) {
								// Store original encryption functions
								const originalEncryptMessage = signalRepo.encryptMessage
								const originalEncryptGroupMessage = signalRepo.encryptGroupMessage
								let corruptionApplied = false
								
								// Hook encryptMessage (for 1-to-1 messages) - only corrupt once
								signalRepo.encryptMessage = async function(params: any) {
									console.log('Intercepting encryptMessage...')
									const result = await originalEncryptMessage.call(this, params)
									
									// Only corrupt the first call to avoid corrupting multiple encryptions
									if (!corruptionApplied && result.ciphertext && Buffer.isBuffer(result.ciphertext)) {
										corruptionApplied = true
										const corrupted = Buffer.from(result.ciphertext)
										const randomIndex = Math.floor(Math.random() * corrupted.length)
										const originalByte = corrupted[randomIndex]
										corrupted[randomIndex] = originalByte ^ 0xFF
										
										console.log(`CORRUPTED 1-to-1 encryption at byte ${randomIndex}: 0x${originalByte.toString(16)} -> 0x${corrupted[randomIndex].toString(16)}`)
										console.log(`Original ciphertext (first 32 bytes): ${result.ciphertext.subarray(0, 32).toString('hex')}`)
										console.log(`Corrupted ciphertext (first 32 bytes): ${corrupted.subarray(0, 32).toString('hex')}`)
										result.ciphertext = corrupted
									}
									
									return result
								}
								
								// Hook encryptGroupMessage (for group messages) - only corrupt once  
								signalRepo.encryptGroupMessage = async function(params: any) {
									console.log('Intercepting encryptGroupMessage...')
									const result = await originalEncryptGroupMessage.call(this, params)
									
									// Only corrupt the first call
									if (!corruptionApplied && result.ciphertext && Buffer.isBuffer(result.ciphertext)) {
										corruptionApplied = true
										const corrupted = Buffer.from(result.ciphertext)
										const randomIndex = Math.floor(Math.random() * corrupted.length)
										const originalByte = corrupted[randomIndex]
										corrupted[randomIndex] = originalByte ^ 0xFF
										
										console.log(`CORRUPTED group encryption at byte ${randomIndex}: 0x${originalByte.toString(16)} -> 0x${corrupted[randomIndex].toString(16)}`)
										console.log(`Original ciphertext (first 32 bytes): ${result.ciphertext.subarray(0, 32).toString('hex')}`)
										console.log(`Corrupted ciphertext (first 32 bytes): ${corrupted.subarray(0, 32).toString('hex')}`)
										result.ciphertext = corrupted
									}
									
									return result
								}
								
								// Send the message to specific device - encryption will be corrupted
								await sock.relayMessage(jid, { conversation: message }, {
									messageId: generateMessageIDV2(sock.user?.id),
									participant: {
										jid: deviceSpecificJid,
										count: 0
									}
								})
								
								// Restore original functions
								signalRepo.encryptMessage = originalEncryptMessage
								signalRepo.encryptGroupMessage = originalEncryptGroupMessage
								
								console.log(`✓ Corrupted message sent to device ${deviceId} of user ${user}`)
							} else {
								console.log('Signal repository not accessible')
							}
							
						} catch (error) {
							console.log(`Failed to send corrupted message: ${error}`)
						}
					} else {
						console.log('Usage: corruptmsg <user> <deviceId> <message>')
						console.log('Examples:')
						console.log('  corruptmsg 1234567890 0 This message will be corrupted  - Send to primary device')
						console.log('  corruptmsg 1234567890 1 This message will be corrupted  - Send to secondary device')
						console.log('Note: Corrupts the encrypted payload before sending to specific device')
					}
					break
					
				case 'pingstat':
					if(pendingSilentPings.size === 0) {
						console.log('📊 No pending silent pings')
					} else {
						console.log(`📊 Pending silent pings (${pendingSilentPings.size}):`)
						pendingSilentPings.forEach((pingInfo, messageId) => {
							const elapsed = Date.now() - pingInfo.timestamp
							console.log(`   ${pingInfo.user}:${pingInfo.deviceId} - ${elapsed}ms ago (ID: ${messageId.substring(0, 8)}...)`)
						})
					}
					break
					
				case 'help':
					console.log('Available commands:')
					console.log('  send <jid> <message>           - Send a text message to all devices')
					console.log('  sendtodevice <user> <id> <msg> - Send a message to specific device')
					console.log('  silentping <user> <id>         - Silent ping using reaction removal to non-existent message')
					console.log('  silentping2 <user> <id>        - Silent ping using delete request to non-existent message')
					console.log('  silentping3 <user> <id>        - Silent ping using edit request to non-existent message')
					console.log('  silentping4 <user> <id>        - Silent ping using call reject to non-existent call')
					console.log('  silentping5 <user> <id>        - Silent ping using unknown protocol type')
					console.log('  silentping6 <user> <id>        - Silent ping using poll response to non-existent poll')
					console.log('  silentping7 <user> <id>        - Silent ping using button response to non-existent button')
					console.log('  silentping8 <user> <id>        - Silent ping using device sent coordination message')
					console.log('  silentping9 <user> <id>        - Silent ping using app state fatal exception')
					console.log('  silentping10 <user> <id>       - Silent ping using peer data operation request')
					console.log('  silentping11 <user> <id>       - Silent ping using malformed message (invalid field)')
					console.log('  pingstat                       - Show pending silent ping status')
					console.log('  corruptmsg <user> <deviceId> <message> - Send corrupted message to specific device')
					console.log('  react <user> <emoji>           - React to last message')
					console.log('  react <user> <msgId> <emoji>   - React to specific message')
					console.log('  list                           - List recent chats')
					console.log('  contacts                       - List recent contacts')
					console.log('  status                         - Show connection status')
					console.log('  presence <jid> [type]          - Update presence status')
					console.log('  read <jid>                     - Mark messages as read')
					console.log('  devices <user>                 - Show all devices for a user')
					console.log('  help                           - Show this help message')
					console.log('  exit                           - Close the application')
					console.log('')
					console.log('JID format examples (for send, presence, read):')
					console.log('  Individual: 1234567890@s.whatsapp.net')
					console.log('  Group: 120363xxx@g.us')
					console.log('')
					console.log('User format examples (for devices, sendtodevice, react, silentping):')
					console.log('  devices 1234567890')
					console.log('  sendtodevice 1234567890 0 Hello primary device!')
					console.log('  silentping 1234567890 1       - Reaction-based silent ping with tracking')
					console.log('  silentping2 1234567890 1      - Delete-based silent ping with tracking')
					console.log('  silentping3 1234567890 1      - Edit-based silent ping with tracking')
					console.log('  silentping4 1234567890 1      - Call-reject based silent ping with tracking')
					console.log('  silentping5 1234567890 1      - Unknown protocol ping with tracking')
					console.log('  silentping6 1234567890 1      - Poll response ping with tracking')
					console.log('  silentping7 1234567890 1      - Button response ping with tracking')
					console.log('  silentping8 1234567890 1      - Device sent coordination ping with tracking')
					console.log('  silentping9 1234567890 1      - App state exception ping with tracking')
					console.log('  silentping10 1234567890 1     - Peer data operation ping with tracking')
					console.log('  silentping11 1234567890 1     - Malformed message ping with tracking')
					console.log('  pingstat                       - Show tracked ping status')
					console.log('  react 1234567890 👍')
					console.log('  react 1234567890 ABCD1234 ❤️')
					console.log('  react 1234567890 "" (remove reaction)')
					break
					
				case 'exit':
					console.log('Goodbye!')
					rl.close()
					process.exit(0)
					
				default:
					if(input.trim()) {
						console.log('Unknown command. Type "help" for available commands.')
					}
			}
			
			// Continue listening for input
			rl.question('> ', processCommand)
		}
		
		console.log('\n=== Interactive WhatsApp CLI ===')
		console.log('Connection established! Type "help" for available commands.')
		rl.question('> ', processCommand)
	}

	return sock

	async function getMessage(key: WAMessageKey): Promise<WAMessageContent | undefined> {
		if(store) {
			const msg = await store.loadMessage(key.remoteJid!, key.id!)
			return msg?.message || undefined
		}

		// only if store is present
		return proto.Message.fromObject({})
	}
}

startSock()