import {
  generateTrustedKeys,
  createVerificationRequest,
  signRequest,
  verifyRequest
} from './trustProof.js'

// KinCheck — Trust Before Action
// Demonstration: trusted device simulated locally.

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
    A trusted device must authorise the exact action,
    amount and recipient.
  </p>

  <button id="createTrustRequest" class="primary">
    Create verification request
  </button>

  <div id="trustWorkspace" class="hidden">
    <h3>Verification request</h3>

    <p>
      Action:
      <strong>Send money</strong>
    </p>

    <label for="trustAmount">Amount (£)</label>
    <input id="trustAmount" type="number"
      value="20" min="0.01" step="0.01">

    <label for="trustRecipient">Recipient</label>
    <input id="trustRecipient" value="John">

    <p id="trustRequestId"></p>

    <button id="approveTrust" class="primary">
      Approve on trusted device (simulated)
    </button>

    <button id="verifyTrust" class="primary" disabled>
      Verify original request
    </button>

    <button id="tamperTrust" class="danger-button" disabled>
      Change amount to £800 and verify
    </button>

    <div id="trustOutcome" aria-live="polite"
      style="margin-top:20px"></div>
  </div>

  <small>
    Security demo: ECDSA P-256 / SHA-256.
    No banking integration or real device enrolment.
  </small>
`

result.appendChild(panel)

const $ = (selector) => panel.querySelector(selector)

let trustedKeys = null
let request = null
let signature = null
let verificationUsed = new Set()

function showOutcome(status, reason) {
  const outcome = $('#trustOutcome')
  outcome.replaceChildren()

  const heading = document.createElement('h3')
  heading.textContent = status
  heading.style.color =
    status === 'VERIFIED' ? '#16a34a' : '#dc2626'

  const detail = document.createElement('p')
  detail.textContent = reason

  outcome.append(heading, detail)
}

$('#createTrustRequest').addEventListener('click', async () => {
  try {
    if (!trustedKeys) {
      trustedKeys = await generateTrustedKeys()
    }

    $('#trustWorkspace').classList.remove('hidden')
    $('#trustAmount').value = '20'
    $('#trustRecipient').value = 'John'

    request = createVerificationRequest({
      action: 'send',
      amount: 20,
      recipient: 'John'
    })

    signature = null
    verificationUsed = new Set()

    $('#trustRequestId').textContent =
      `Request ID: ${request.requestId}`

    $('#approveTrust').disabled = false
    $('#verifyTrust').disabled = true
    $('#tamperTrust').disabled = true

    showOutcome('PENDING', 'Awaiting trusted-device approval.')
  } catch {
    showOutcome('ERROR', 'Unable to create verification request.')
  }
})

$('#approveTrust').addEventListener('click', async () => {
  try {
    if (!request || !trustedKeys) return

    // The trusted-device simulation signs the immutable
    // request snapshot, never the editable input fields.
    signature = await signRequest(
      request,
      trustedKeys.privateKey
    )

    $('#approveTrust').disabled = true
    $('#verifyTrust').disabled = false
    $('#tamperTrust').disabled = false

    showOutcome(
      'APPROVED',
      'Trusted device signed the exact £20 request for John.'
    )
  } catch {
    showOutcome('ERROR', 'Signing failed.')
  }
})

$('#verifyTrust').addEventListener('click', async () => {
  if (!signature || !request) return

  const current = {
    ...request,
    amount: Number($('#trustAmount').value),
    recipient: $('#trustRecipient').value
  }

  const outcome = await verifyRequest(
    current,
    signature,
    trustedKeys.publicKey,
    verificationUsed
  )

  showOutcome(outcome.status, outcome.reason)
})

$('#tamperTrust').addEventListener('click', async () => {
  if (!signature || !request) return

  $('#trustAmount').value = '800'

  const modified = {
    ...request,
    amount: 800,
    recipient: $('#trustRecipient').value
  }

  // Independent verification context demonstrates that
  // the signature fails even before replay protection.
  const outcome = await verifyRequest(
    modified,
    signature,
    trustedKeys.publicKey,
    new Set()
  )

  showOutcome(outcome.status, outcome.reason)
})

// Reveal this feature only after VERIFY or HIGH RISK.
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