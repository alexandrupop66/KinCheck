import {
  generateTrustedKeys,
  createVerificationRequest,
  signRequest,
  verifyRequest
} from "./src/trustProof.js";

const keys = await generateTrustedKeys();

const request = createVerificationRequest({
  action: "send",
  amount: 20,
  recipient: "John"
});

const signature = await signRequest(request, keys.privateKey);

const valid = await verifyRequest(
  request,
  signature,
  keys.publicKey
);

const modified = { ...request, amount: 800 };

const tampered = await verifyRequest(
  modified,
  signature,
  keys.publicKey
);

console.log("ORIGINAL £20:", valid);
console.log("MODIFIED £800:", tampered);
