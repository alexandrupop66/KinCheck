
# KinCheck — Trust Before Action

> **AI can clone their voice. It can't clone your history.**

An AI-assisted impersonation risk checker with cryptographic, action-bound verification.

Built for **ForgeHacks Online 2026 — AI + Cybersecurity**.

## The Problem

A scammer can impersonate someone you trust, copy their writing style or clone their voice.

Recognising a familiar identity is not the same as authorising a financial action.

KinCheck explores a stronger security boundary:

**Don't just verify who is asking. Verify exactly what was authorised.**

## How It Works

### 1. Establish a relationship baseline

Import a standard WhatsApp `.txt` conversation or use the included synthetic demo.

KinCheck locally extracts:

- Primary language
- Communication patterns
- Common emoji
- Message statistics
- Shared conversational context

### 2. Check a suspicious message

The deterministic risk engine evaluates:

- Language changes
- New phone number claims
- Unexpected financial requests
- Urgency
- Greeting mismatches, where supported

Possible identity verdicts:

- IDENTITY MATCH
- VERIFY
- HIGH RISK

These are heuristic risk classifications, not proof of identity.

### 3. Optional AI Private Challenge

Google Gemini can propose a question grounded in explicit conversation history.

A grounding guard checks that supporting evidence exists in the imported chat.

Gemini does not determine the identity verdict or authorise transactions.

When Gemini is unavailable, deterministic analysis continues.

### 4. Trust Before Action

The prototype demonstrates an exact-action authorisation workflow.

Example:

A verification request specifies:

- Action: send
- Amount: £20
- Recipient: John

A simulated trusted device signs the canonical request using ECDSA P-256 with SHA-256.

The verifier checks the signature against the trusted public key.

Original request:

**VERIFIED — Exact request authorised.**

Change the amount from £20 to £800 while reusing the signature:

**REJECTED — Proof does not match this request.**

The signature also binds the action, recipient, request ID, expiry and nonce.

## Cryptographic Design

The signed payload contains:

```json
{
  "requestId": "unique-request-id",
  "action": "send",
  "amount": 20,
  "recipient": "John",
  "expiresAt": 1790000000000,
  "nonce": "unique-nonce"
}
```

The example values above are illustrative.

The implementation uses:

- Web Crypto API
- ECDSA P-256
- SHA-256
- A deterministic field-order canonical payload
- Cryptographically generated UUIDs
- Signature verification
- Expiry checks
- In-memory replay detection

The canonical representation is defined in `src/trustProof.js`.

All signed fields are verified together. Changes to a signed field invalidate the signature.

Replay detection is local to the supplied verification state. It is not persistent across sessions or distributed verifiers.

## Security Tests

Run:

```bash
node test-trust.mjs
```

The automated suite covers 12 scenarios:

1. Valid signed request
2. Changed amount
3. Changed recipient
4. Changed action
5. Expired request payload
6. Replay rejection
7. Corrupted signature
8. Wrong public key
9. Modified nonce
10. Modified request ID
11. Missing required field
12. Old proof applied to a different request

Expected result: **12 passed, 0 failed**.

An additional manual test confirmed that an originally valid signed request is rejected after its expiry time.

## Architecture

```text
WhatsApp Export
      |
      v
Local Parser
      |
      v
Relationship Fingerprint
      |
      v
Suspicious Message
      |
      v
Deterministic Risk Engine
      |
      +----> Identity Verdict
      |
      +----> Optional Gemini Private Challenge
      |
      v
Trust Before Action
      |
      v
Canonical Verification Request
      |
      v
Simulated Trusted Device
      |
      v
ECDSA Signature
      |
      v
Deterministic Proof Verification
      |
      +----> VERIFIED
      |
      +----> REJECTED
```

## Technology

Frontend:
- Vite
- Vanilla JavaScript
- HTML and CSS
- Web Crypto API

Backend:
- Node.js
- Express
- Google Gemini via `@google/genai`

No database, banking integration or WhatsApp API is required.

## Running Locally

Prerequisite: Node.js with Web Crypto support.

Install dependencies:

```bash
npm install
```

Start the frontend:

```bash
npm run dev
```

Open:

http://localhost:5173

For Gemini-powered Private Challenge functionality, configure the local backend environment and run:

```bash
node server.js
```

Backend:

http://localhost:3001

Keep the Gemini API key in `.env.local`. Never commit credentials to source control.

The cryptographic Trust Before Action demonstration does not require Gemini.

## Demo Walkthrough

1. Select **Use demo: Mum**.
2. Analyse the suspicious financial message.
3. Observe **HIGH RISK**.
4. Select **Create verification request**.
5. Review the £20 request for John.
6. Select **Approve on trusted device (simulated)**.
7. Select **Verify original request**.
8. Observe **VERIFIED**.
9. Select **Change amount to £800 and verify**.
10. Observe **REJECTED**.

The signing and verification operations use actual cryptography, not hard-coded verdicts.

## Privacy

WhatsApp parsing, fingerprint generation and deterministic identity analysis run locally in the browser.

When an AI challenge is requested, conversation content is sent through the local backend to Gemini.

The included demonstration conversation is synthetic.

No real financial transactions are performed.

## Prototype Limitations

KinCheck is a hackathon prototype, not a production authentication or payment system.

Important limitations:

- The trusted device is simulated within the same browser application.
- Key generation and signing occur in the local demonstration environment.
- There is no secure device enrolment, identity binding or independent trusted-device authentication.
- There is no persistent or distributed replay-protection store.
- The verification request is currently a demonstration request, not an automatically extracted and authenticated financial instruction.
- Cryptographic proof does not establish that a real person reviewed or consented to an action.
- A compromised signing environment can undermine the trust boundary.
- The demonstration does not initiate or approve real payments.

A production design would require secure trusted-device enrolment, protected signing keys, independent approval, authenticated request delivery and persistent replay protection.

## Core Principle

**AI proposes. Cryptography proves. Deterministic rules decide.**

KinCheck does not try to prove that a voice or message is fake.

It demonstrates how a cryptographic signature can prove that an exact request payload was signed, and reject altered requests.
