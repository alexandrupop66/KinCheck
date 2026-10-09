import './style.css'

import {
  parseWhatsAppExport,
  buildLocalFingerprint
} from './whatsappParser.js'

// ----------------------------------------------------
// KinCheck
// ForgeHacks 2026 — AI + Cybersecurity
//
// Architecture:
// AI proposes relationship evidence and challenges.
// Deterministic rules decide the identity verdict.
// ----------------------------------------------------

document.querySelector('#app').innerHTML = `
  <main class="app-shell">
    <header class="topbar">
      <div class="brand">
        <div class="shield">K</div>

        <div>
          <strong>KinCheck</strong>
          <span>Identity verification through shared history</span>
        </div>
      </div>

      <div class="status">● Private by design</div>
    </header>

    <section class="hero">
      <div class="eyebrow">AI + CYBERSECURITY</div>

      <h1>
        AI can clone their voice.<br>
        <span>It can't clone your history.</span>
      </h1>

      <p>
        When a message doesn't feel right, KinCheck compares it with the
        relationship you actually know — not just the words on the screen.
      </p>
    </section>

    <section class="workspace">
      <div class="card baseline-card">
        <div class="step">01</div>

        <h2>Establish a baseline</h2>

        <p>
          Import a WhatsApp chat with someone you trust. KinCheck learns
          relationship patterns without trying to identify generic
          "AI-generated" text.
        </p>

        <label class="upload">
          <input
            id="chatFile"
            type="file"
            accept=".txt"
          >

          <div class="upload-icon">↑</div>

          <strong>Import WhatsApp .txt</strong>

          <span>
            or use our synthetic demo conversation
          </span>
        </label>

        <button
          id="demoButton"
          class="primary"
        >
          Use demo: Mum
        </button>
      </div>

      <div class="card preview-card">
        <div class="step">02</div>

        <h2>Relationship fingerprint</h2>

        <div
          id="emptyState"
          class="empty-state"
        >
          <div class="fingerprint">◎</div>

          <strong>No baseline yet</strong>

          <span>
            Import a conversation or load the demo.
          </span>
        </div>

        <div
          id="profile"
          class="profile hidden"
        >
          <div class="profile-head">
            <div class="avatar">M</div>

            <div>
              <strong>Mum</strong>
              <span>Relationship baseline ready</span>
            </div>

            <div class="verified">
              BASELINE
            </div>
          </div>

          <div class="signal">
            <span>Primary language</span>
            <strong>Romanian</strong>
          </div>

          <div class="signal">
            <span>Messages analysed</span>
            <strong>Demo baseline</strong>
          </div>

          <div class="signal">
            <span>Message style</span>
            <strong>Short, informal</strong>
          </div>

          <div class="signal">
            <span>Common emoji</span>
            <strong>❤️ 😊</strong>
          </div>

          <div class="signal">
            <span>Shared context</span>
            <strong>Available for private challenge</strong>
          </div>
        </div>
      </div>
    </section>

    <section
      id="checkSection"
      class="check-section hidden"
    >
      <div class="section-heading">
        <div>
          <div class="eyebrow">
            IDENTITY CHECK
          </div>

          <h2>
            Does this message look like them?
          </h2>
        </div>

        <span>03</span>
      </div>

      <textarea id="suspectMessage">Hi Alex, I've lost my phone. This is my new number. I need £850 urgently. Can you transfer it now?</textarea>

      <button
        id="analyseButton"
        class="danger-button"
      >
        Check identity
      </button>

      <div
        id="result"
        class="result hidden"
      >
        <div class="verdict">
          <span>IDENTITY VERDICT</span>

          <strong>HIGH RISK</strong>

          <p>
            Multiple signals conflict with the known
            relationship baseline.
          </p>
        </div>

        <div class="evidence">
          <h3>Identity evidence</h3>
        </div>

        <div class="challenge">
          <div class="challenge-label">
            PRIVATE CHALLENGE
          </div>

          <h3>
            Don't trust the voice. Verify the history.
          </h3>

          <p>Ask them:</p>

          <blockquote id="challengeQuestion">
            Generate a private verification question from shared history.
          </blockquote>

          <small id="challengeNote">
            KinCheck does not need the answer.
            The trusted person should know it.
          </small>
        </div>
      </div>
    </section>

    <footer>
      <span>KinCheck</span>

      <span>
        AI proposes evidence.
        Deterministic rules decide.
      </span>
    </footer>
  </main>
`

// ----------------------------------------------------
// DOM
// ----------------------------------------------------

const demoButton =
  document.querySelector('#demoButton')

const emptyState =
  document.querySelector('#emptyState')

const profile =
  document.querySelector('#profile')

const checkSection =
  document.querySelector('#checkSection')

const analyseButton =
  document.querySelector('#analyseButton')

const result =
  document.querySelector('#result')

const chatFile =
  document.querySelector('#chatFile')

const suspectMessage =
  document.querySelector('#suspectMessage')

const challengeQuestion =
  document.querySelector('#challengeQuestion')

const challengeNote =
  document.querySelector('#challengeNote')

// ----------------------------------------------------
// State
// ----------------------------------------------------

const demoBaseline = {
  person: 'Mum',
  primaryLanguage: 'ro',
  typicalGreetings: ['alex', 'pui'],
  commonEmoji: ['❤️', '😊'],
  expectedPaymentRequest: false,
  knownPhoneContext: true,
  messageCount: null,
  messageStyle: 'Short, informal',
  sharedContextAvailable: true
}

let activeBaseline = {
  ...demoBaseline
}

// Raw imported conversation is kept only in memory.
// It is sent to the AI endpoint only when needed.

let activeConversation = ''

let activeAIAnalysis = null

// ----------------------------------------------------
// UI helpers
// ----------------------------------------------------

function showBaseline() {
  emptyState.classList.add('hidden')
  profile.classList.remove('hidden')
  checkSection.classList.remove('hidden')
}

function scrollToIdentityCheck() {
  checkSection.scrollIntoView({
    behavior: 'smooth',
    block: 'start'
  })
}

function resetChallenge() {
  challengeQuestion.textContent =
    'Generate a private verification question from shared history.'

  challengeNote.textContent =
    'KinCheck does not need the answer. The trusted person should know it.'
}

function renderInsufficientHistoryChallenge() {
  challengeQuestion.textContent =
    'Not enough shared history to generate a private challenge.'

  challengeNote.textContent =
    'KinCheck needs more trusted conversation history before it can create a history-based verification question.'
}

function renderDemoProfile() {
  const signalRows =
    profile.querySelectorAll('.signal')

  profile.querySelector(
    '.profile-head strong'
  ).textContent = 'Mum'

  profile.querySelector(
    '.avatar'
  ).textContent = 'M'

  signalRows[0].querySelector(
    'strong'
  ).textContent = 'Romanian'

  signalRows[1].querySelector(
    'strong'
  ).textContent = 'Demo baseline'

  signalRows[2].querySelector(
    'strong'
  ).textContent = 'Short, informal'

  signalRows[3].querySelector(
    'strong'
  ).textContent = '❤️ 😊'

  signalRows[4].querySelector(
    'strong'
  ).textContent =
    'Available for private challenge'
}

function renderImportedProfile(
  fingerprint
) {
  const signalRows =
    profile.querySelectorAll('.signal')

  profile.querySelector(
    '.profile-head strong'
  ).textContent =
    fingerprint.person

  profile.querySelector(
    '.avatar'
  ).textContent =
    fingerprint.person
      .charAt(0)
      .toUpperCase()

  signalRows[0].querySelector(
    'strong'
  ).textContent =
    fingerprint.primaryLanguageLabel

  signalRows[1].querySelector(
    'strong'
  ).textContent =
    `${fingerprint.messageCount} messages analysed`

  signalRows[2].querySelector(
    'strong'
  ).textContent =
    fingerprint.messageStyle

  signalRows[3].querySelector(
    'strong'
  ).textContent =
    fingerprint.commonEmoji.length
      ? fingerprint.commonEmoji.join(' ')
      : 'No frequent emoji'

  signalRows[4].querySelector(
    'strong'
  ).textContent =
    fingerprint.sharedContextAvailable
      ? 'Available for private challenge'
      : 'Not enough history yet'
}

// ----------------------------------------------------
// AI relationship analysis
// ----------------------------------------------------

async function getAIAnalysis() {
  if (
    activeAIAnalysis ||
    !activeConversation
  ) {
    return activeAIAnalysis
  }

  const response =
    await fetch(
      '/api/relationship-analysis',
      {
        method: 'POST',

        headers: {
          'Content-Type':
            'application/json'
        },

        body: JSON.stringify({
          trustedPerson:
            activeBaseline.person,

          conversation:
            activeConversation
        })
      }
    )

  if (!response.ok) {
    let message =
      'AI relationship analysis failed.'

    try {
      const errorData =
        await response.json()

      if (errorData.error) {
        message =
          errorData.error
      }
    } catch {
      // Keep generic message.
    }

    throw new Error(message)
  }

  const data =
    await response.json()

  activeAIAnalysis =
    data.analysis

  return activeAIAnalysis
}

function renderAIChallenge(
  aiAnalysis
) {
  const challenge =
    aiAnalysis?.privateChallenge

  if (
    !challenge ||
    !challenge.question
  ) {
    challengeQuestion.textContent =
      'No grounded private challenge could be generated.'

    challengeNote.textContent =
      'Verify through a separate trusted channel.'

    return
  }

  challengeQuestion.textContent =
    `“${challenge.question}”`

  challengeNote.textContent =
    'AI generated this question from shared history. KinCheck does not need or evaluate the answer.'
}

// ----------------------------------------------------
// Demo
// ----------------------------------------------------

demoButton.addEventListener(
  'click',
  () => {
    activeBaseline = {
      ...demoBaseline
    }

    // Demo profile is deterministic.
    // The real imported-chat flow exercises Gemini.

    activeConversation = ''
    activeAIAnalysis = null

    renderDemoProfile()
    resetChallenge()

    showBaseline()
    scrollToIdentityCheck()
  }
)

// ----------------------------------------------------
// WhatsApp import
// ----------------------------------------------------

chatFile.addEventListener(
  'change',
  async () => {
    const file =
      chatFile.files[0]

    if (!file) {
      return
    }

    try {
      const rawText =
        await file.text()

      const parsedChat =
        parseWhatsAppExport(rawText)

      const participant =
        parsedChat.participants[0]

      if (!participant) {
        throw new Error(
          'No participant could be identified.'
        )
      }

      const fingerprint =
        buildLocalFingerprint(
          parsedChat,
          participant.name
        )

      activeBaseline = {
        person:
          fingerprint.person,

        primaryLanguage:
          fingerprint.primaryLanguage,

        typicalGreetings: [],

        commonEmoji:
          fingerprint.commonEmoji,

        expectedPaymentRequest:
          false,

        knownPhoneContext:
          true,

        messageCount:
          fingerprint.messageCount,

        messageStyle:
          fingerprint.messageStyle,

        sharedContextAvailable:
          fingerprint.sharedContextAvailable
      }

      activeConversation =
        rawText

      activeAIAnalysis =
        null

      renderImportedProfile(
        fingerprint
      )

      resetChallenge()
      showBaseline()
      scrollToIdentityCheck()

      console.log(
        'KinCheck imported baseline:',
        activeBaseline
      )
    } catch (error) {
      console.error(
        'KinCheck import error:',
        error
      )

      alert(
        `KinCheck couldn't read this WhatsApp export.\n\n${error.message}`
      )
    }
  }
)

// ----------------------------------------------------
// Deterministic Identity Engine
// ----------------------------------------------------

function analyseIdentity(
  message,
  baseline
) {
  const text =
    message.trim()

  const lower =
    text.toLowerCase()

  const signals = []

  const englishMarkers = [
    'hi ',
    "i've",
    'my phone',
    'this is my',
    'i need',
    'can you',
    'transfer',
    'urgently',
    'please',
    'money'
  ]

  const englishHits =
    englishMarkers.filter(
      marker =>
        lower.includes(marker)
    ).length

  if (
    baseline.primaryLanguage === 'ro' &&
    englishHits >= 2
  ) {
    signals.push({
      type: 'language',
      label: 'Language changed',
      detail:
        'English vs Romanian baseline',
      severity: 2
    })
  }

  if (
    Array.isArray(
      baseline.typicalGreetings
    ) &&
    baseline.typicalGreetings.length > 0 &&
    lower.startsWith('hi alex') &&
    !baseline.typicalGreetings.includes(
      'hi alex'
    )
  ) {
    signals.push({
      type: 'greeting',
      label: 'Greeting mismatch',
      detail: '“Hi Alex” is atypical',
      severity: 1
    })
  }

  const newContactPatterns = [
    'new number',
    'new phone',
    'lost my phone',
    'broke my phone',
    'phone broke',
    'changed my number'
  ]

  if (
    newContactPatterns.some(
      pattern =>
        lower.includes(pattern)
    )
  ) {
    signals.push({
      type: 'contact',
      label: 'New contact context',
      detail:
        'Claims a new phone or number',
      severity: 3
    })
  }

  const moneyPattern =
    /(?:£|€|\$)\s?\d+|\b\d+\s?(?:pounds?|euros?|dollars?)\b/i

  const paymentWords = [
    'transfer',
    'send money',
    'send me',
    'bank',
    'payment',
    'pay'
  ]

  if (
    moneyPattern.test(text) ||
    paymentWords.some(
      word =>
        lower.includes(word)
    )
  ) {
    signals.push({
      type: 'financial',
      label: 'Financial anomaly',

      detail:
        baseline.expectedPaymentRequest
          ? 'Payment request detected'
          : 'Unexpected payment request',

      severity:
        baseline.expectedPaymentRequest
          ? 1
          : 3
    })
  }

  const urgencyPatterns = [
    'urgent',
    'urgently',
    'right now',
    'immediately',
    'asap',
    'now?',
    'quickly'
  ]

  if (
    urgencyPatterns.some(
      pattern =>
        lower.includes(pattern)
    )
  ) {
    signals.push({
      type: 'urgency',
      label: 'Urgency pattern',
      detail:
        'Immediate action requested',
      severity: 2
    })
  }

  const riskScore =
    signals.reduce(
      (total, signal) =>
        total + signal.severity,
      0
    )

  let verdict =
    'IDENTITY MATCH'

  if (riskScore >= 6) {
    verdict =
      'HIGH RISK'
  } else if (riskScore >= 2) {
    verdict =
      'VERIFY'
  }

  return {
    verdict,
    riskScore,
    signals
  }
}

// ----------------------------------------------------
// Result rendering
// ----------------------------------------------------

function renderIdentityResult(
  analysis
) {
  const verdictBox =
    result.querySelector('.verdict')

  const verdictTitle =
    verdictBox.querySelector('strong')

  const verdictText =
    verdictBox.querySelector('p')

  const evidence =
    result.querySelector('.evidence')

  const challenge =
    result.querySelector('.challenge')

  verdictTitle.textContent =
    analysis.verdict

  if (
    analysis.verdict === 'HIGH RISK'
  ) {
    verdictText.textContent =
      'Multiple signals conflict with the known relationship baseline.'
  } else if (
    analysis.verdict === 'VERIFY'
  ) {
    verdictText.textContent =
      'Some signals differ from the known relationship. Verify independently.'
  } else {
    verdictText.textContent =
      'No significant identity mismatches were detected in this message.'
  }

  evidence.innerHTML = `
    <h3>Identity evidence</h3>

    ${
      analysis.signals.length
        ? analysis.signals
            .map(
              signal => `
                <div class="evidence-row bad">
                  <span>${signal.label}</span>
                  <strong>${signal.detail}</strong>
                </div>
              `
            )
            .join('')
        : `
          <div class="evidence-row">
            <span>Baseline comparison</span>
            <strong>No significant mismatch detected</strong>
          </div>
        `
    }

    <div class="evidence-row">
      <span>Deterministic risk score</span>
      <strong>${analysis.riskScore}</strong>
    </div>
  `

  if (
    analysis.verdict ===
    'IDENTITY MATCH'
  ) {
    challenge.classList.add(
      'hidden'
    )
  } else {
    challenge.classList.remove(
      'hidden'
    )
  }

  result.classList.remove(
    'hidden'
  )

  result.scrollIntoView({
    behavior: 'smooth',
    block: 'start'
  })
}

// ----------------------------------------------------
// Identity check + AI challenge
// ----------------------------------------------------

analyseButton.addEventListener(
  'click',
  async () => {
    const message =
      suspectMessage.value

    if (!message.trim()) {
      alert(
        'Paste a message to check first.'
      )

      return
    }

    // Verdict is calculated FIRST and locally
    // by deterministic rules.

    const analysis =
      analyseIdentity(
        message,
        activeBaseline
      )

    renderIdentityResult(
      analysis
    )

    if (
      analysis.verdict ===
      'IDENTITY MATCH'
    ) {
      analyseButton.textContent =
        'Identity checked'

      return
    }

    // No shared history = no AI challenge.
    // KinCheck must not ask AI to invent one.

    if (
      !activeBaseline.sharedContextAvailable
    ) {
      renderInsufficientHistoryChallenge()

      analyseButton.textContent =
        'Identity checked'

      console.log(
        'Private Challenge skipped: insufficient shared history.'
      )

      return
    }

    // AI enriches the verification step.
    // It does not alter the verdict.

    if (activeConversation) {
      analyseButton.textContent =
        'Generating private challenge...'

      try {
        const aiAnalysis =
          await getAIAnalysis()

        renderAIChallenge(
          aiAnalysis
        )

        console.log(
          'KinCheck AI relationship evidence:',
          aiAnalysis
        )
      } catch (error) {
        console.error(
          'KinCheck AI challenge error:',
          error
        )

        challengeQuestion.textContent =
          'AI challenge temporarily unavailable.'

        challengeNote.textContent =
          'The deterministic identity verdict remains valid. Verify through a separate trusted channel.'
      }
    }

    analyseButton.textContent =
      'Identity checked'
  }
)