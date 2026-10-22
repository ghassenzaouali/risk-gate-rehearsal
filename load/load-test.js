// Load test with k6: k6 run -e BASE_URL=https://<fqdn> load/load-test.js
import http from "k6/http";
import { check } from "k6";

// Ramp up to 50 virtual users, hold 2 minutes, ramp down; fail if errors >= 1 % or p95 >= 500 ms
export const options = {
  stages: [
    { duration: "30s", target: 50 },
    { duration: "2m", target: 50 },
    { duration: "15s", target: 0 },
  ],
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<500"],
  },
};

// Target address (local server by default) and the three demo transactions, sent in turn
const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";
const TRANSACTIONS = [
  { amount: 45, country: "FR", merchantCategory: "grocery", channel: "in_store", cardNumber: "4111111111111111" },
  { amount: 1500, country: "FR", merchantCategory: "electronics", channel: "online", cardNumber: "4111111111111111" },
  { amount: 2500, country: "US", merchantCategory: "crypto", channel: "online", cardNumber: "4111111111111111" },
];

// Each virtual user scores transactions in a loop, without pause, and checks every answer
export default function scoreTransactions() {
  const transaction = TRANSACTIONS[__ITER % TRANSACTIONS.length];
  const response = http.post(BASE_URL + "/api/decisions", JSON.stringify(transaction), {
    headers: { "Content-Type": "application/json" },
  });
  check(response, { "status is 200": (r) => r.status === 200 });
}
