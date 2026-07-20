import assert from "node:assert/strict";
import test from "node:test";

import { parseMauthDocumentActionProposal, strippedJsonProposalSource } from "./mauthActionProposal.ts";

test("strippedJsonProposalSource unwraps fenced JSON", () => {
  assert.equal(strippedJsonProposalSource('```json\n{"type":"document.validation.run"}\n```'), '{"type":"document.validation.run"}');
});

test("parseMauthDocumentActionProposal accepts a single action", () => {
  const actions = parseMauthDocumentActionProposal('{"type":"document.validation.run"}');

  assert.equal(actions.length, 1);
  assert.equal(actions[0].type, "document.validation.run");
});

test("parseMauthDocumentActionProposal accepts arrays and action envelopes", () => {
  assert.deepEqual(
    parseMauthDocumentActionProposal('[{"type":"document.validation.run"},{"type":"question.add","question":{"id":"q1"}}]').map(
      (action) => action.type,
    ),
    ["document.validation.run", "question.add"],
  );
  assert.deepEqual(
    parseMauthDocumentActionProposal('{"actions":[{"type":"document.validation.run"}]}').map((action) => action.type),
    ["document.validation.run"],
  );
  assert.deepEqual(
    parseMauthDocumentActionProposal('{"action":{"type":"document.validation.run"}}').map((action) => action.type),
    ["document.validation.run"],
  );
});

test("parseMauthDocumentActionProposal rejects empty or invalid proposals", () => {
  assert.throws(() => parseMauthDocumentActionProposal(""), /Paste a JSON action/);
  assert.throws(() => parseMauthDocumentActionProposal("[]"), /No actions found/);
  assert.throws(() => parseMauthDocumentActionProposal("[1]"), /Every proposed action/);
});
