
import {
  generateTrustedKeys,
  createVerificationRequest,
  signRequest,
  verifyRequest
} from './trustProof.js'

// KinCheck — Trust Before Action
// Real cryptographic signatures; locally simulated trusted device.

const result = document.querySelector('#result')
const verdict = result.querySelector('.verdict')

const panel = document.createElement('section')
panel.id = 'trust-before-action'
panel.className = 'card hidden'
panel.style.marginTop = '24px'

panel.innerHTML = `
  <div class="eyebrow">04 — TRUST BEFORE ACTION</div>

  <h2>Verify the action, not just the identity.</h2>

  <p>
    A cryptographic proof must match the exact action,
    amount and recipient.
  </p>

  <div id="trustSetup">
    <label for="trustAmount">Amount (GBP)</label>
    <input
      id="trustAmount"
      type="number"
      value="20"
      min="0.01"
      step="0.01"
    >

    <label for="trustRecipient">Recipient</label>
    <input
      id="trustRecipient"
      type="text"
      value="John"
      maxlength="100"
    >

    <button id="createTrustRequest" class="primary">
      Create verification request
    </button>
  </div>

  <div id="trustWorkspace" class="hidden">
    <h3>Original signed request</h3>

    <p id="trustSummary"></p>
    <p id="trustRequestId"></p>

    <div id="trustComparison" class="hidden"
      style="padding:16px; margin:18px 0;
      border:1px solid #394454; border-radius:10px;
      background:#101820">
      <strong>Payload comparison</strong>
      <p id="trustOriginalPayload"></p>
      <p id="trustModifiedPayload"></p>
    </div>

    <button id="approveTrust" class="primary">
      Approve on trusted device (simulated)
    </button>

    <button id="verifyTrust" class="primary" disabled>
      Verify original request
    </button>

    <button id="tamperTrust" class="danger-button" disabled>
      Change amount to GBP 800 and verify
    </button>

    <button id="tamperRecipient" class="danger-button" disabled>
      Change recipient and verify
    </button>

    <button id="replayTrust" class="danger-button" disabled>
      Reuse proof (replay attack)
    </button>

    <div id="trustOutcome" aria-live="polite"></div>
  </div>

  <small>
    ECDSA P-256 / SHA-256.
    Real signatures; simulated trusted device.
    No real payments or secure device enrolment.
  </small>
`

result.appendChild(panel)

const $ = selector => panel.querySelector(selector)

let trustedKeys = null
let request = null
let signature = null
let verificationUsed = new Set()

function formatAction(payload) {
  return `Send GBP ${payload.amount.toFixed(2)} to ${payload.recipient}`
}

function showOutcome(status, reason) {
  const outcome = $('#trustOutcome')
  outcome.replaceChildren()

  const heading = document.createElement('h3')
  heading.textContent = status
  heading.style.color =
    status === 'VERIFIED'
      ? '#4be0ae'
      : status === 'REJECTED' || status === 'ERROR'
        ? '#ef4444'
        : '#e8edf5'

  const detail = document.createElement('p')
  detail.textContent = reason

  outcome.append(heading, detail)
}

function showComparison(modified) {
  $('#trustComparison').classList.remove('hidden')

  $('#trustOriginalPayload').textContent =
    `ORIGINAL (SIGNED): ${formatAction(request)}`

  $('#trustModifiedPayload').textContent =
    `MODIFIED (UNSIGNED): ${formatAction(modified)}`

  $('#trustOriginalPayload').style.color = '#4be0ae'
  $('#trustModifiedPayload').style.color = '#ef4444'
}

function hideComparison() {
  $('#trustComparison').classList.add('hidden')
}

function setInputLocked(locked) {
  $('#trustAmount').disabled = locked
  $('#trustRecipient').disabled = locked
}

function resetButtons() {
  $('#approveTrust').disabled = false
  $('#verifyTrust').disabled = true
  $('#tamperTrust').disabled = true
  $('#tamperRecipient').disabled = true
  $('#replayTrust').disabled = true
}

$('#createTrustRequest').addEventListener('click', async () => {
  try {
    const amountText = $('#trustAmount').value
    const amount = Number(amountText)
    const recipient = $('#trustRecipient').value.trim()

    if (
      !amountText ||
      !Number.isFinite(amount) ||
      amount <= 0 ||
      !recipient
    ) {
      $('#trustWorkspace').classList.remove('hidden')
      showOutcome(
        'ERROR',
        'Enter a valid positive amount and recipient.'
      )
      return
    }

    if (!trustedKeys) {
      trustedKeys = await generateTrustedKeys()
    }

    request = createVerificationRequest({
      action: 'send',
      amount,
      recipient
    })

    signature = null
    verificationUsed = new Set()

    $('#trustWorkspace').classList.remove('hidden')

    $('#trustSummary').textContent = formatAction(request)
    $('#trustRequestId').textContent =
      `Request ID: ${request.requestId}`

    setInputLocked(true)
    resetButtons()
    hideComparison()

    showOutcome(
      'PENDING',
      'Awaiting approval of this exact request.'
    )
  } catch {
    showOutcome(
      'ERROR',
      'Unable to create verification request.'
    )
  }
})

$('#approveTrust').addEventListener('click', async () => {
  try {
    if (!request || !trustedKeys) return

    signature = await signRequest(
      request,
      trustedKeys.privateKey
    )

    $('#approveTrust').disabled = true
    $('#verifyTrust').disabled = false
    $('#tamperTrust').disabled = false
    $('#tamperRecipient').disabled = false

    hideComparison()

    showOutcome(
      'APPROVED',
      `Simulated trusted device signed: ${formatAction(request)}`
    )
  } catch {
    showOutcome('ERROR', 'Cryptographic signing failed.')
  }
})

$('#verifyTrust').addEventListener('click', async () => {
  if (!request || !signature || !trustedKeys) return

  hideComparison()

  const outcome = await verifyRequest(
    request,
    signature,
    trustedKeys.publicKey,
    verificationUsed
  )

  showOutcome(outcome.status, outcome.reason)

  if (outcome.status === 'VERIFIED') {
    $('#replayTrust').disabled = false
    $('#verifyTrust').disabled = true
  }
})

$('#tamperTrust').addEventListener('click', async () => {
  if (!request || !signature || !trustedKeys) return

  const modified = {
    ...request,
    amount: request.amount === 800 ? 850 : 800
  }

$('#trustAmount').value = String(modified.amount)
  showComparison(modified)

  // Independent verification context isolates signature mismatch
  // from replay detection.
  const outcome = await verifyRequest(
    modified,
    signature,
    trustedKeys.publicKey,
    new Set()
  )

  showOutcome(
    outcome.status,
    `Amount changed from GBP ${request.amount.toFixed(2)} ` +
    `to GBP ${modified.amount.toFixed(2)}. ${outcome.reason}`
  )
})

$('#tamperRecipient').addEventListener('click', async () => {
  if (!request || !signature || !trustedKeys) return

  const modified = {
    ...request,
    recipient: `${request.recipient}-changed`
  }

  showComparison(modified)

  const outcome = await verifyRequest(
    modified,
    signature,
    trustedKeys.publicKey,
    new Set()
  )

  showOutcome(
    outcome.status,
    `Recipient changed. ${outcome.reason}`
  )
})

$('#replayTrust').addEventListener('click', async () => {
  if (!request || !signature || !trustedKeys) return

  hideComparison()

  const outcome = await verifyRequest(
    request,
    signature,
    trustedKeys.publicKey,
    verificationUsed
  )

  showOutcome(outcome.status, outcome.reason)
})

// Reveal after VERIFY or HIGH RISK.
const observer = new MutationObserver(() => {
  const label = verdict.querySelector('strong')?.textContent

  if (
    !result.classList.contains('hidden') &&
    (label === 'VERIFY' || label === 'HIGH RISK')
  ) {
    panel.classList.remove('hidden')
  } else {
    panel.classList.add('hidden')
  }
})

observer.observe(result, {
  attributes: true,
  attributeFilter: ['class']
})

observer.observe(verdict.querySelector('strong'), {
  childList: true,
  characterData: true,
  subtree: true
})
