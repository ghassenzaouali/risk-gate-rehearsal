// Settings of the business rules
const MAX_AMOUNT = 1000000;

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
