import assert from 'node:assert/strict'

import {
  generateTrustedKeys,
  createVerificationRequest,
  signRequest,
  verifyRequest
} from './src/trustProof.js'

let passed = 0
let failed = 0

async function test(name, fn) {
  try {
    await fn()
    passed++
    console.log(`PASS — ${name}`)
  } catch (error) {
    failed++
    console.error(`FAIL — ${name}`)
    console.error(`  ${error.message}`)
  }
}

const trusted = await generateTrustedKeys()
const attacker = await generateTrustedKeys()

const request = createVerificationRequest({
  action: 'send',
  amount: 20,
  recipient: 'John'
})

const signature = await signRequest(
  request,
  trusted.privateKey
)

async function check(candidate, proof = signature, key = trusted.publicKey) {
  return verifyRequest(
    candidate,
    proof,
    key,
    new Set()
  )
}

// 1 — Correct request

await test('Valid proof authorises exact request', async () => {
  const result = await check(request)
  assert.equal(result.status, 'VERIFIED')
})

// 2 — Changed amount

await test('Changed amount is rejected', async () => {
  const result = await check({ ...request, amount: 800 })
  assert.equal(result.status, 'REJECTED')
})

// 3 — Changed recipient

await test('Changed recipient is rejected', async () => {
  const result = await check({ ...request, recipient: 'Attacker' })
  assert.equal(result.status, 'REJECTED')
})

// 4 — Changed action

await test('Changed action is rejected', async () => {
  const result = await check({ ...request, action: 'withdraw' })
  assert.equal(result.status, 'REJECTED')
})

// 5 — Expired proof

await test('Expired request is rejected', async () => {
  const expired = {
    ...request,
    expiresAt: Date.now() - 1000
  }

  const result = await check(expired)
  assert.equal(result.status, 'REJECTED')
  assert.equal(result.reason, 'EXPIRED')
})

// 6 — Replay

await test('Replayed request is rejected', async () => {
  const used = new Set()

  const first = await verifyRequest(
    request,
    signature,
    trusted.publicKey,
    used
  )

  const second = await verifyRequest(
    request,
    signature,
    trusted.publicKey,
    used
  )

  assert.equal(first.status, 'VERIFIED')
  assert.equal(second.status, 'REJECTED')
  assert.equal(second.reason, 'REPLAY')
})

// 7 — Corrupted signature

await test('Invalid signature is rejected', async () => {
  const corrupted = [...signature]
  corrupted[0] ^= 255

  const result = await check(request, corrupted)
  assert.equal(result.status, 'REJECTED')
})

// 8 — Wrong public key

await test('Wrong public key is rejected', async () => {
  const result = await check(
    request,
    signature,
    attacker.publicKey
  )

  assert.equal(result.status, 'REJECTED')
})

// 9 — Modified nonce

await test('Modified nonce is rejected', async () => {
  const result = await check({
    ...request,
    nonce: crypto.randomUUID()
  })

  assert.equal(result.status, 'REJECTED')
})

// 10 — Modified request ID

await test('Modified request ID is rejected', async () => {
  const result = await check({
    ...request,
    requestId: crypto.randomUUID()
  })

  assert.equal(result.status, 'REJECTED')
})

// 11 — Missing required field

await test('Incomplete request is rejected', async () => {
  const incomplete = { ...request }
  delete incomplete.recipient

  const result = await check(incomplete)
  assert.equal(result.status, 'REJECTED')
})

// 12 — New request cannot reuse an old proof

await test('Proof cannot authorise another request', async () => {
  const another = createVerificationRequest({
    action: 'send',
    amount: 20,
    recipient: 'John'
  })

  const result = await check(another)
  assert.equal(result.status, 'REJECTED')
})

console.log('\nKINCheck Security Test Results')
console.log(`Passed: ${passed}`)
console.log(`Failed: ${failed}`)
console.log(`Total:  ${passed + failed}`)

if (failed > 0) {
  process.exitCode = 1
}