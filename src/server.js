import os from "node:os";
import express from "express";
import { validateTransaction, evaluate } from "./rules.js";

// Settings: port (PORT variable, 3000 by default), name of this server copy, deployed version
const port = process.env.PORT || 3000;
const instanceId = os.hostname();
const version = process.env.APP_VERSION || "dev";
const app = express();

// Tag every response, errors included, with the server copy that answered
app.use((req, res, next) => {
  res.set("X-Instance-Id", instanceId);
  next();
});

// Read JSON request bodies into req.body
app.use(express.json());

// Health check: a quick way to know the server is up, and which version is running
app.get("/health", (req, res) => {
  res.json({ status: "ok", version: version });
});

// Score a transaction: 400 with the message if a field is invalid, otherwise the decision
app.post("/api/decisions", (req, res) => {
  const error = validateTransaction(req.body);
  if (error !== null) {
    res.status(400).json({ error: error });
    return;
  }
  const result = evaluate(req.body);
  // One JSON log line per decision; the card is masked: only its last 4 digits are kept
  const maskedCard = "************" + req.body.cardNumber.slice(-4);
  console.log(JSON.stringify({ ...result, instance: instanceId, card: maskedCard }));
  res.json(result);
});

// Errors: a malformed JSON body gives 400, anything else 500 (logged); the server keeps running
app.use((err, req, res, next) => {
  if (err.type === "entity.parse.failed") {
    res.status(400).json({ error: "malformed JSON body" });
    return;
  }
  console.error(JSON.stringify({ error: err.message, stack: err.stack }));
  res.status(500).json({ error: "internal error" });
});

// Start listening for HTTP requests
app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
