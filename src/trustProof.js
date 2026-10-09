// KinCheck — Trust Before Action
// Real cryptographic signatures using Web Crypto API.

const encoder = new TextEncoder();

const FIELDS = [
  "requestId",
  "action",
  "amount",
  "recipient",
  "expiresAt",
  "nonce"
];

export function canonicalPayload(request) {
  if (
    !request ||
    FIELDS.some(
      (field) =>
        !Object.hasOwn(request, field) ||
        request[field] === null ||
        request[field] === undefined
    )
  ) {
    throw new Error("Incomplete verification request");
  }

  if (
    typeof request.requestId !== "string" ||
    typeof request.action !== "string" ||
    typeof request.amount !== "number" ||
    !Number.isFinite(request.amount) ||
    typeof request.recipient !== "string" ||
    typeof request.expiresAt !== "number" ||
    !Number.isSafeInteger(request.expiresAt) ||
    typeof request.nonce !== "string" ||
    !request.requestId.trim() ||
    !request.action.trim() ||
    !request.recipient.trim() ||
    !request.nonce.trim()
  ) {
    throw new Error("Invalid verification request");
  }

  return JSON.stringify(
    Object.fromEntries(FIELDS.map((field) => [field, request[field]]))
  );
}

export async function generateTrustedKeys() {
  return crypto.subtle.generateKey(
    {
      name: "ECDSA",
      namedCurve: "P-256"
    },
    true,
    ["sign", "verify"]
  );
}

export async function exportPublicKey(publicKey) {
  return crypto.subtle.exportKey("jwk", publicKey);
}

export async function importPublicKey(jwk) {
  return crypto.subtle.importKey(
    "jwk",
    jwk,
    {
      name: "ECDSA",
      namedCurve: "P-256"
    },
    false,
    ["verify"]
  );
}

export function createVerificationRequest({
  action,
  amount,
  recipient,
  ttlSeconds = 300
}) {
  if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds <= 0) {
    throw new Error("Invalid expiry duration");
  }

  const request = {
    requestId: crypto.randomUUID(),
    action,
    amount,
    recipient,
    expiresAt: Date.now() + ttlSeconds * 1000,
    nonce: crypto.randomUUID()
  };

  canonicalPayload(request);
  return request;
}

export async function signRequest(request, privateKey) {
  const signature = await crypto.subtle.sign(
    {
      name: "ECDSA",
      hash: "SHA-256"
    },
    privateKey,
    encoder.encode(canonicalPayload(request))
  );

  return Array.from(new Uint8Array(signature));
}

export async function verifyRequest(
  request,
  signature,
  trustedPublicKey,
  usedRequests = new Set()
) {
  try {
    canonicalPayload(request);

    if (Date.now() >= request.expiresAt) {
      return { status: "REJECTED", reason: "EXPIRED" };
    }

    const replayKey = `${request.requestId}:${request.nonce}`;

    if (usedRequests.has(replayKey)) {
      return { status: "REJECTED", reason: "REPLAY" };
    }

    if (
      !Array.isArray(signature) ||
      signature.length !== 64 ||
      !signature.every(
        (byte) => Number.isInteger(byte) && byte >= 0 && byte <= 255
      )
    ) {
      return { status: "REJECTED", reason: "INVALID SIGNATURE" };
    }

    const valid = await crypto.subtle.verify(
      {
        name: "ECDSA",
        hash: "SHA-256"
      },
      trustedPublicKey,
      new Uint8Array(signature),
      encoder.encode(canonicalPayload(request))
    );

    if (!valid) {
      return {
        status: "REJECTED",
        reason: "Proof does not match this request."
      };
    }

    usedRequests.add(replayKey);

    return {
      status: "VERIFIED",
      reason: "Exact request authorised."
    };
  } catch {
    return { status: "REJECTED", reason: "INVALID PROOF" };
  }
}