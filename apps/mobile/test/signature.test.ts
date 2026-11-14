import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  canAddSignature,
  createSignatureSession,
  signatureRoles,
} from "../src/lib/signatures";
import type {
  CaptureSignature,
  SignatureEvidence,
} from "../../../packages/api-contracts/signatures";
const evidence: SignatureEvidence = {
  id: "signature",
  documentId: "document",
  documentVersionId: "version",
  versionNumber: 1,
  signerName: "Fictional Signer",
  signerRole: "SHIPPER",
  signedAt: "2026-09-28T12:00:00Z",
};
test("signature affordance appears only for uploaded/current BOL or POD; defaults and Free access", () => {
  const base = {
    documentType: "BOL",
    status: "RECEIVED",
    documentId: "document",
    documentVersionId: "version",
  };
  assert.equal(canAddSignature(base), true);
  assert.equal(
    canAddSignature({ ...base, documentType: "POD", status: "ACCEPTED" }),
    true,
  );
  for (const change of [
    { documentType: "RATE_CONFIRMATION" },
    { status: "MISSING" },
    { status: "REJECTED" },
    { documentId: null },
    { documentVersionId: null },
  ])
    assert.equal(canAddSignature({ ...base, ...change }), false);
  assert.deepEqual(signatureRoles("BOL"), ["SHIPPER", "DRIVER"]);
  assert.deepEqual(signatureRoles("POD"), ["RECEIVER", "DRIVER"]);
  assert.equal(
    createSignatureSession("POD", "version", async () => evidence).snapshot()
      .role,
    "RECEIVER",
  );
});
test("typed name and image required; Clear resets; cancel/skip submits nothing", async () => {
  let calls = 0;
  const session = createSignatureSession("BOL", "version", async () => {
    calls++;
    return evidence;
  });
  await session.save();
  assert.equal(calls, 0);
  session.edit({ name: "Fictional Signer" });
  await session.save();
  assert.equal(calls, 0);
  session.edit({ image: "data:image/png;base64,c2ln" });
  session.clear();
  assert.equal(session.snapshot().image, "");
  session.edit({ image: "data:image/png;base64,c2ln" });
  session.cancel();
  await session.save();
  assert.equal(calls, 0);
});
test("double tap protected and captured state updates only after success", async () => {
  let finish: ((item: SignatureEvidence) => void) | undefined,
    calls = 0;
  const session = createSignatureSession("BOL", "version", () => {
    calls++;
    return new Promise((resolve) => {
      finish = resolve;
    });
  });
  session.edit({
    name: " Fictional Signer ",
    image: "data:image/png;base64,c2ln",
  });
  const first = session.save();
  assert.equal(session.snapshot().saving, true);
  assert.equal(session.snapshot().saved, null);
  await session.save();
  assert.equal(calls, 1);
  session.edit({ name: "changed" });
  assert.equal(session.snapshot().name, " Fictional Signer ");
  finish!(evidence);
  await first;
  assert.equal(session.snapshot().saved, evidence);
  assert.equal(session.snapshot().saving, false);
  await session.save();
  assert.equal(calls, 1);
});
test("network ambiguity retains name/drawing and retries exact payload/idempotency key", async () => {
  const sent: CaptureSignature[] = [];
  const session = createSignatureSession(
    "BOL",
    "version",
    async (body) => {
      sent.push(body);
      if (sent.length === 1) throw Error("offline");
      return evidence;
    },
    "fixed-test-request-key",
  );
  session.edit({
    name: "Fictional Signer",
    image: "data:image/png;base64,c2ln",
  });
  await session.save();
  assert.equal(session.snapshot().saved, null);
  assert.ok(session.snapshot().error);
  assert.equal(session.snapshot().image, "data:image/png;base64,c2ln");
  session.clear();
  session.edit({ name: "Different" });
  await session.save();
  assert.deepEqual(sent[0], sent[1]);
  assert.equal(session.snapshot().saved, evidence);
});
test("Signature Mode boundary has a full-screen modal and no account/navigation/premium dependency", () => {
  const mode = readFileSync(
    new URL("../src/components/signature-mode.tsx", import.meta.url),
    "utf8",
  );
  assert.match(mode, /presentationStyle="fullScreen"/);
  assert.match(mode, /SafeAreaView/);
  assert.match(mode, /KeyboardAvoidingView/);
  assert.doesNotMatch(
    mode,
    /useSubscription|applicationUser|router\.|Finance|firstName|driverName/,
  );
  assert.match(mode, /onRequestClose/);
  assert.match(mode, /onEmpty/);
  const detail = readFileSync(
    new URL("../app/(driver)/loads/[loadId].tsx", import.meta.url),
    "utf8",
  );
  assert.match(detail, /const multipart = uploadForm\(file\)/);
  assert.match(detail, /multipart\.append\("actionToken", actionToken/);
  assert.match(detail, /method: "POST",\s+multipart,/);
  assert.match(detail, /Complete Delivery/);
  assert.doesNotMatch(detail, /signature.*canLeave|canLeave.*signature/);
});
