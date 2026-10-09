import express from 'express'
import dotenv from 'dotenv'
import { GoogleGenAI } from '@google/genai'

dotenv.config({
  path: '.env.local'
})

const app = express()
const PORT = 3001

app.use(
  express.json({
    limit: '1mb'
  })
)

if (!process.env.GEMINI_API_KEY) {
  console.error(
    'GEMINI_API_KEY is missing from .env.local'
  )
  process.exit(1)
}

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY
})

const GEMINI_MODEL = 'gemini-3.8-flash'

const MAX_ATTEMPTS = 3
const ATTEMPT_TIMEOUT_MS = 20000

const sleep = milliseconds =>
  new Promise(resolve =>
    setTimeout(resolve, milliseconds)
  )

// ----------------------------------------------------
// Retry detection
// ----------------------------------------------------

function isRetryableError(error) {
  const status =
    error?.status ||
    error?.error?.code

  const code =
    error?.code ||
    error?.cause?.code ||
    ''

  const message =
    String(
      error?.message || ''
    ).toLowerCase()

  return (
    status === 429 ||
    status === 503 ||
    code === 'KINCHECK_TIMEOUT' ||
    code === 'UND_ERR_HEADERS_TIMEOUT' ||
    code === 'UND_ERR_CONNECT_TIMEOUT' ||
    code === 'ETIMEDOUT' ||
    message.includes('fetch failed') ||
    message.includes('timeout')
  )
}

// ----------------------------------------------------
// Promise timeout
// ----------------------------------------------------

function withTimeout(
  promise,
  milliseconds
) {
  let timer

  const timeout =
    new Promise(
      (_, reject) => {
        timer = setTimeout(
          () => {
            const error =
              new Error(
                `Gemini request timed out after ${milliseconds}ms`
              )

            error.code =
              'KINCHECK_TIMEOUT'

            reject(error)
          },
          milliseconds
        )
      }
    )

  return Promise.race([
    promise,
    timeout
  ]).finally(() => {
    clearTimeout(timer)
  })
}

// ----------------------------------------------------
// Gemini request with bounded retry
// ----------------------------------------------------

async function generateWithRetry(
  request
) {
  let lastError

  for (
    let attempt = 1;
    attempt <= MAX_ATTEMPTS;
    attempt += 1
  ) {
    try {
      console.log(
        `Gemini attempt ${attempt}/${MAX_ATTEMPTS}`
      )

      return await withTimeout(
        ai.models.generateContent(
          request
        ),
        ATTEMPT_TIMEOUT_MS
      )
    } catch (error) {
      lastError = error

      const retryable =
        isRetryableError(error)

      if (
        !retryable ||
        attempt === MAX_ATTEMPTS
      ) {
        throw error
      }

      const delay =
        1000 *
        Math.pow(
          2,
          attempt - 1
        )

      console.warn(
        `Temporary Gemini/network error. Retrying in ${delay}ms...`
      )

      await sleep(delay)
    }
  }

  throw lastError
}

// ----------------------------------------------------
// Health check
// ----------------------------------------------------

app.get(
  '/api/health',
  (req, res) => {
    res.json({
      ok: true,
      service: 'KinCheck AI',
      model: GEMINI_MODEL,
      groundingGuard: true
    })
  }
)

// ----------------------------------------------------
// Relationship analysis
//
// Gemini proposes relationship evidence.
// KinCheck deterministic rules decide identity.
// ----------------------------------------------------

app.post(
  '/api/relationship-analysis',
  async (req, res) => {
    try {
      const {
        trustedPerson,
        conversation
      } = req.body

      if (
        !trustedPerson ||
        !conversation ||
        typeof conversation !== 'string'
      ) {
        return res
          .status(400)
          .json({
            error:
              'trustedPerson and conversation are required.'
          })
      }

      const prompt = `
You are the relationship-evidence component of KinCheck,
an anti-impersonation system.

Analyse ONLY the supplied conversation.

You do NOT decide whether another message is authentic,
fraudulent, safe, unsafe, or AI-generated.

Trusted person:
${trustedPerson}

Conversation:
--- START CHAT ---
${conversation}
--- END CHAT ---

Return ONLY valid JSON with exactly this structure:

{
  "relationshipSignals": {
    "language": "short description",
    "addressTerms": ["term"],
    "communicationStyle": "short description",
    "recurringTopics": ["topic"],
    "sharedMemories": ["specific shared memory"]
  },
  "privateChallenge": {
    "question": "verification question",
    "answerFact": "fact explicitly present in the conversation",
    "supportingEvidence": "exact excerpt from the conversation containing the answer"
  }
}

STRICT RULES:

1. Use ONLY facts explicitly present in the conversation.

2. Never invent or infer a missing name, place, event,
relationship detail, answer or memory.

3. A Private Challenge is valid ONLY when its answer appears
explicitly in the supplied conversation.

4. supportingEvidence MUST be copied VERBATIM from the supplied
conversation and MUST contain the information needed to answer
the question.

5. Never ask for a fact that is absent from supportingEvidence.

BAD EXAMPLE:

Conversation:
"We complained about the fish at a restaurant in Corfu."

INVALID:
"What was the name of the restaurant?"

The restaurant name was never supplied.

VALID:
"What did we complain about at the restaurant in Corfu?"

answerFact:
"peste"

supportingEvidence:
"Ala unde ne-am plans de peste"

6. Prefer a distinctive shared memory over generic facts.

7. Do not reveal answerFact in the question.

8. Do not assign a fraud probability or identity verdict.

9. If no grounded challenge can be created, return:

"privateChallenge": {
  "question": "",
  "answerFact": "",
  "supportingEvidence": ""
}

10. Output JSON only. No markdown.
`

      const response =
        await generateWithRetry({
          model: GEMINI_MODEL,

          contents: prompt,

          config: {
            responseMimeType:
              'application/json',

            temperature: 0
          }
        })

      const rawText =
        response.text

      if (!rawText) {
        throw new Error(
          'Gemini returned an empty response.'
        )
      }

      let parsed

      try {
        parsed =
          JSON.parse(rawText)
      } catch {
        throw new Error(
          'Gemini did not return valid JSON.'
        )
      }

      // ------------------------------------------------
      // Grounding guard
      //
      // Evidence must exist verbatim in the source chat.
      // The answer fact must be present in that evidence.
      // ------------------------------------------------

      const challenge =
        parsed?.privateChallenge

      let challengeGrounded =
        false

      if (
        challenge?.question &&
        challenge?.answerFact &&
        challenge?.supportingEvidence
      ) {
        const source =
          conversation
            .toLowerCase()

        const evidence =
          challenge
            .supportingEvidence
            .trim()
            .toLowerCase()

        const answerFact =
          challenge
            .answerFact
            .trim()
            .toLowerCase()

        const evidenceExists =
          evidence.length > 0 &&
          source.includes(evidence)

        const answerSupported =
          answerFact.length > 0 &&
          evidence.includes(answerFact)

        challengeGrounded =
          evidenceExists &&
          answerSupported
      }

      if (!challengeGrounded) {
        console.warn(
          'Rejected ungrounded private challenge.'
        )

        parsed.privateChallenge = {
          question: '',
          answerFact: '',
          supportingEvidence: ''
        }
      } else {
        console.log(
          'Private Challenge grounded: PASS'
        )
      }

      return res.json({
        source: 'gemini',
        model: GEMINI_MODEL,
        trustedPerson,
        challengeGrounded,
        analysis: parsed
      })
    } catch (error) {
      console.error(
        'KinCheck Gemini error:',
        error
      )

      if (
        isRetryableError(error)
      ) {
        return res
          .status(503)
          .json({
            error:
              'AI relationship analysis is temporarily unavailable.',
            retryable: true
          })
      }

      return res
        .status(500)
        .json({
          error:
            'KinCheck AI analysis failed.',
          retryable: false
        })
    }
  }
)

// ----------------------------------------------------
// Start
// ----------------------------------------------------

app.listen(
  PORT,
  () => {
    console.log(
      `KinCheck AI server running on http://localhost:${PORT}`
    )

    console.log(
      `Gemini model: ${GEMINI_MODEL}`
    )

    console.log(
      'Private Challenge grounding guard: ON'
    )

    console.log(
      `AI timeout: ${ATTEMPT_TIMEOUT_MS / 1000}s × ${MAX_ATTEMPTS} attempts`
    )
  }
)