import express from "express";

// Port can be changed with the PORT variable, 3000 by default
const port = process.env.PORT || 3000;
const app = express();

// Health check: a quick way to know the server is up
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// Start listening for HTTP requests
app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
