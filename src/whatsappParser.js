// KinCheck WhatsApp Parser v0.1
// Parses common WhatsApp .txt export formats locally in the browser.
// No chat data is uploaded anywhere by this module.

const MESSAGE_PATTERNS = [
  // UK / EU style:
  // 03/10/2026, 14:32 - Mum: Buna Alex
  /^(\d{1,2}\/\d{1,2}\/\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?)\s+-\s+([^:]+):\s?(.*)$/,

  // Some exports use square brackets:
  // [03/10/2026, 14:32:01] Mum: Buna Alex
  /^\[(\d{1,2}\/\d{1,2}\/\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?)\]\s+([^:]+):\s?(.*)$/,

  // US exports with AM / PM:
  // 10/3/26, 2:32 PM - Mum: Hi
  /^(\d{1,2}\/\d{1,2}\/\d{2,4}),?\s+(\d{1,2}:\d{2}(?:\s?[AP]M))\s+-\s+([^:]+):\s?(.*)$/i
]

function matchMessage(line) {
  for (const pattern of MESSAGE_PATTERNS) {
    const match = line.match(pattern)

    if (match) {
      return {
        date: match[1],
        time: match[2],
        sender: match[3].trim(),
        text: match[4].trim()
      }
    }
  }

  return null
}

export function parseWhatsAppExport(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    throw new Error('WhatsApp export is empty.')
  }

  const cleanText = rawText
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')

  const lines = cleanText.split('\n')

  const messages = []
  let currentMessage = null

  for (const rawLine of lines) {
    const line = rawLine.trimEnd()
    const parsed = matchMessage(line)

    if (parsed) {
      if (currentMessage) {
        messages.push(currentMessage)
      }

      currentMessage = parsed
      continue
    }

    // WhatsApp messages can span multiple lines.
    if (currentMessage && line.trim()) {
      currentMessage.text += `\n${line.trim()}`
    }
  }

  if (currentMessage) {
    messages.push(currentMessage)
  }

  if (!messages.length) {
    throw new Error(
      'No WhatsApp messages could be recognised in this file.'
    )
  }

  const participantMap = new Map()

  for (const message of messages) {
    const existing = participantMap.get(message.sender) || {
      name: message.sender,
      messageCount: 0,
      characterCount: 0,
      messages: []
    }

    existing.messageCount += 1
    existing.characterCount += message.text.length
    existing.messages.push(message)

    participantMap.set(message.sender, existing)
  }

  const participants = [...participantMap.values()]
    .sort((a, b) => b.messageCount - a.messageCount)

  return {
    messageCount: messages.length,
    participants,
    messages
  }
}

// ----------------------------------------------------
// Lightweight local fingerprint extraction
// This is intentionally deterministic.
// AI enrichment will be added later.
// ----------------------------------------------------

const EMOJI_PATTERN =
  /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2764}\u{FE0F}]/gu

const ROMANIAN_MARKERS = [
  'ce',
  'faci',
  'bine',
  'da',
  'nu',
  'te',
  'ai',
  'am',
  'este',
  'sunt',
  'mama',
  'mami',
  'pui',
  'drag',
  'acasă',
  'acasa',
  'mâine',
  'maine',
  'unde',
  'când',
  'cand',
  'mulțumesc',
  'multumesc'
]

const ENGLISH_MARKERS = [
  'the',
  'you',
  'are',
  'what',
  'how',
  'yes',
  'no',
  'thanks',
  'hello',
  'hi',
  'tomorrow',
  'where',
  'when',
  'please',
  'can',
  'will'
]

function detectLanguage(messages) {
  const text = messages
    .map(message => message.text.toLowerCase())
    .join(' ')

  const words = text
    .replace(/[^\p{L}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)

  let romanianScore = 0
  let englishScore = 0

  for (const word of words) {
    if (ROMANIAN_MARKERS.includes(word)) {
      romanianScore += 1
    }

    if (ENGLISH_MARKERS.includes(word)) {
      englishScore += 1
    }
  }

  if (romanianScore === 0 && englishScore === 0) {
    return {
      code: 'unknown',
      label: 'Not enough data'
    }
  }

  if (romanianScore >= englishScore) {
    return {
      code: 'ro',
      label: 'Romanian'
    }
  }

  return {
    code: 'en',
    label: 'English'
  }
}

function extractEmoji(messages) {
  const counts = new Map()

  for (const message of messages) {
    const matches = message.text.match(EMOJI_PATTERN) || []

    for (const emoji of matches) {
      if (emoji === '\uFE0F') continue

      counts.set(
        emoji,
        (counts.get(emoji) || 0) + 1
      )
    }
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([emoji]) => emoji)
}

function calculateMessageStyle(messages) {
  if (!messages.length) {
    return 'Unknown'
  }

  const totalCharacters = messages.reduce(
    (sum, message) => sum + message.text.length,
    0
  )

  const averageLength =
    totalCharacters / messages.length

  if (averageLength < 35) {
    return 'Short, conversational'
  }

  if (averageLength < 90) {
    return 'Medium, conversational'
  }

  return 'Long-form'
}

export function buildLocalFingerprint(parsedChat, participantName) {
  const participant = parsedChat.participants.find(
    item => item.name === participantName
  )

  if (!participant) {
    throw new Error(
      `Participant "${participantName}" was not found.`
    )
  }

  const language = detectLanguage(participant.messages)
  const emoji = extractEmoji(participant.messages)

  return {
    person: participant.name,
    messageCount: participant.messageCount,

    primaryLanguage: language.code,
    primaryLanguageLabel: language.label,

    messageStyle: calculateMessageStyle(
      participant.messages
    ),

    commonEmoji: emoji,

    sharedContextAvailable:
      participant.messageCount >= 5
  }
}