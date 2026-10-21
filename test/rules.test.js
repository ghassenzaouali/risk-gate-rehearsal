import { test } from "node:test";
import assert from "node:assert/strict";
import { validateTransaction, evaluate } from "../src/rules.js";

// The "normal" demo case, which is valid; each test changes one field
const normal = {
  amount: 45,
  country: "FR",
  merchantCategory: "grocery",
  channel: "in_store",
  cardNumber: "4111111111111111",
};

test("accepts a valid transaction", () => {
  assert.equal(validateTransaction(normal), null);
});

test("rejects an amount that is not a number between 0 and 1000000", () => {
  assert.match(validateTransaction({ ...normal, amount: "45" }), /amount/);
  assert.match(validateTransaction({ ...normal, amount: 0 }), /amount/);
  assert.match(validateTransaction({ ...normal, amount: 1000001 }), /amount/);
});

test("rejects a country that is not 2 uppercase letters", () => {
  assert.match(validateTransaction({ ...normal, country: "fr" }), /country/);
  assert.match(validateTransaction({ ...normal, country: "USA" }), /country/);
});

test("rejects an empty merchant, an unknown channel and a card that is not 16 digits", () => {
  assert.match(validateTransaction({ ...normal, merchantCategory: " " }), /merchantCategory/);
  assert.match(validateTransaction({ ...normal, channel: "phone" }), /channel/);
  assert.match(validateTransaction({ ...normal, cardNumber: "4111 1111 1111 1111" }), /cardNumber/);
});

test("rejects a missing body", () => {
  assert.match(validateTransaction(undefined), /body/);
});

// The three demo cases of the interface, then the exact REJECTED threshold
test("normal case: no rule matches, score 0, APPROVED", () => {
  assert.deepEqual(evaluate(normal), { decision: "APPROVED", score: 0, reasons: [] });
});

test("suspect case: big amount, online, score 30, REVIEW", () => {
  const result = evaluate({ ...normal, amount: 1500, merchantCategory: "electronics", channel: "online" });
  assert.equal(result.score, 30);
  assert.equal(result.decision, "REVIEW");
});

test("fraud case: the four rules match, score 70, REJECTED", () => {
  const result = evaluate({ ...normal, amount: 2500, country: "US", merchantCategory: "crypto", channel: "online" });
  assert.equal(result.score, 70);
  assert.equal(result.decision, "REJECTED");
});

test("a score of exactly 60 is REJECTED", () => {
  const result = evaluate({ ...normal, amount: 2000, country: "US", merchantCategory: "crypto" });
  assert.equal(result.score, 60);
  assert.equal(result.decision, "REJECTED");
});
