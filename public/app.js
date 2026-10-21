// Read the form fields into a transaction object
function readForm() {
  return {
    amount: Number(document.getElementById("amount").value),
    country: document.getElementById("country").value,
    merchantCategory: document.getElementById("merchantCategory").value,
    channel: document.getElementById("channel").value,
    cardNumber: document.getElementById("cardNumber").value,
  };
}

// Show the verdict of a decision, or the error message
function showVerdict(status, body) {
  const verdict = document.getElementById("verdict");
  verdict.hidden = false;
  if (status !== 200) {
    verdict.className = "card error";
    verdict.textContent = "Error " + status + ": " + body.error;
    return;
  }
  const rules = body.reasons.map((reason) => reason.rule + " +" + reason.weight).join(", ");
  verdict.className = "card " + body.decision;
  verdict.textContent = body.decision + " · score " + body.score + " · " + (rules || "no rule");
}

// Send a transaction to the API, then show the verdict (or a message if the server does not answer)
async function score(transaction) {
  try {
    const response = await fetch("/api/decisions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(transaction),
    });
    const body = await response.json();
    showVerdict(response.status, body);
  } catch (error) {
    console.error(error);
    showVerdict(0, { error: "no answer from the server, please try again" });
  }
}

// The form scores what was typed, without reloading the page
document.getElementById("form").addEventListener("submit", async (event) => {
  event.preventDefault();
  await score(readForm());
});
