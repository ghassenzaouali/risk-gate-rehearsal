// Settings of the business rules: limits, risky lists and decision thresholds
const MAX_AMOUNT = 1000000;
const AMOUNT_THRESHOLD = 1000;
const LOW_RISK_COUNTRIES = ["FR", "DE", "ES", "IT", "BE"];
const HIGH_RISK_MERCHANTS = ["gambling", "crypto", "jewelry", "money_transfer"];
const REVIEW_SCORE = 30;
const REJECT_SCORE = 60;

// Return an error message for the first invalid field, or null when the transaction is valid
export function validateTransaction(tx) {
  if (typeof tx !== "object" || tx === null) {
    return "body must be a JSON object";
  }
  if (typeof tx.amount !== "number" || tx.amount <= 0 || tx.amount > MAX_AMOUNT) {
    return "amount must be a number greater than 0 and at most 1000000";
  }
  if (typeof tx.country !== "string" || !/^[A-Z]{2}$/.test(tx.country)) {
    return "country must be a 2-letter uppercase code, like FR";
  }
  if (typeof tx.merchantCategory !== "string" || tx.merchantCategory.trim() === "") {
    return "merchantCategory must be a non-empty string";
  }
  if (tx.channel !== "online" && tx.channel !== "in_store") {
    return "channel must be online or in_store";
  }
  if (typeof tx.cardNumber !== "string" || !/^\d{16}$/.test(tx.cardNumber)) {
    return "cardNumber must be a string of 16 digits";
  }
  return null;
}

// Each matching rule adds its weight to the score; the thresholds turn the score into a decision
export function evaluate(tx) {
  const reasons = [];
  if (!LOW_RISK_COUNTRIES.includes(tx.country)) {
    reasons.push({ rule: "COUNTRY_RISK", weight: 25 });
  }
  if (tx.amount > AMOUNT_THRESHOLD) {
    reasons.push({ rule: "AMOUNT_THRESHOLD", weight: 20 });
  }
  if (HIGH_RISK_MERCHANTS.includes(tx.merchantCategory)) {
    reasons.push({ rule: "HIGH_RISK_MERCHANT", weight: 15 });
  }
  if (tx.channel === "online") {
    reasons.push({ rule: "CARD_NOT_PRESENT", weight: 10 });
  }

  let score = 0;
  for (const reason of reasons) {
    score = score + reason.weight;
  }
  let decision = "APPROVED";
  if (score >= REJECT_SCORE) {
    decision = "REJECTED";
  } else if (score >= REVIEW_SCORE) {
    decision = "REVIEW";
  }
  return { decision, score, reasons };
}
