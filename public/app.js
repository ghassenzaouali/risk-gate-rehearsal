// Demo transactions, the same as in the tests: one per possible decision
const DEMO_CASES = {
  normal: { amount: 45, country: "FR", merchantCategory: "grocery", channel: "in_store" },
  suspect: { amount: 1500, country: "FR", merchantCategory: "electronics", channel: "online" },
  fraud: { amount: 2500, country: "US", merchantCategory: "crypto", channel: "online" },
};

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

// Add a decision at the top of the history and keep only the last 10
function addToHistory(transaction, body) {
  const list = document.getElementById("history");
  const item = document.createElement("li");
  item.textContent = transaction.amount + " " + transaction.country + " → " + body.decision + " (score " + body.score + ")";
  list.prepend(item);
  if (list.children.length > 10) {
    list.lastElementChild.remove();
  }
}

// Send a transaction to the API, then show the verdict and the history (or a message if no answer)
async function score(transaction) {
  try {
    const response = await fetch("/api/decisions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(transaction),
    });
    const body = await response.json();
    showVerdict(response.status, body);
    if (response.status === 200) {
      addToHistory(transaction, body);
    }
  } catch (error) {
    console.error(error);
    showVerdict(0, { error: "no answer from the server, please try again" });
  }
}

// The form scores what was typed (without reloading the page); each demo button scores its case
document.getElementById("form").addEventListener("submit", async (event) => {
  event.preventDefault();
  await score(readForm());
});
for (const button of document.querySelectorAll("[data-case]")) {
  button.addEventListener("click", () => score({ ...DEMO_CASES[button.dataset.case], cardNumber: "4111111111111111" }));
}
