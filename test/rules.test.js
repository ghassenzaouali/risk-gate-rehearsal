import { test } from "node:test";
import assert from "node:assert/strict";
import { validateTransaction } from "../src/rules.js";

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
