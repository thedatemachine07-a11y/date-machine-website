import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  doc,
  getDoc,
  getFirestore,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getFunctions,
  httpsCallable,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
import { formatCurrency, getCartSummary } from "./cart-utils.js";

const form = document.querySelector("#checkout-form");
const summaryEl = document.querySelector("#checkout-summary");
const emptyEl = document.querySelector("#checkout-empty");
const successEl = document.querySelector("#checkout-success");
const errorEl = document.querySelector("#checkout-error");
const submitButton = form ? form.querySelector("button[type='submit']") : null;
let taxRate = 0;

const setMessage = (element, message) => {
  if (!element) {
    return;
  }
  element.textContent = message || "";
  element.hidden = !message;
};

const setLoading = (isLoading) => {
  if (!submitButton) {
    return;
  }
  submitButton.disabled = isLoading;
  submitButton.classList.toggle("loading", isLoading);
};

const renderSummary = () => {
  if (!summaryEl) {
    return;
  }
  const { items, count, total } = getCartSummary();
  const taxAmount = total * taxRate;
  const totalWithTax = total + taxAmount;
  summaryEl.innerHTML = "";

  if (!items.length) {
    if (emptyEl) {
      emptyEl.hidden = false;
    }
    return;
  }

  if (emptyEl) {
    emptyEl.hidden = true;
  }

  items.forEach((item) => {
    const row = document.createElement("div");
    row.className = "cart-summary-row";
    const lineTotal = (Number(item.price) || 0) * item.quantity;
    const sizeLabel = item.size ? ` (${item.size})` : "";
    row.innerHTML = `<span>${item.name}${sizeLabel} x${item.quantity}</span><strong>${formatCurrency(lineTotal)}</strong>`;
    summaryEl.appendChild(row);
  });

  const taxRow = document.createElement("div");
  taxRow.className = "cart-summary-row";
  taxRow.innerHTML = `<span>Tax</span><strong>${formatCurrency(taxAmount)}</strong>`;
  summaryEl.appendChild(taxRow);

  const totalRow = document.createElement("div");
  totalRow.className = "cart-summary-row cart-summary-total";
  totalRow.innerHTML = `<span>Total (${count} items)</span><strong>${formatCurrency(totalWithTax)}</strong>`;
  summaryEl.appendChild(totalRow);
};

if (!window.firebaseConfig || window.firebaseConfig.apiKey === "REPLACE_ME") {
  setMessage(errorEl, "Missing Firebase config. Update firebase-config.js.");
  if (submitButton) {
    submitButton.disabled = true;
  }
} else if (!window.firebaseConfig.stripePublishableKey) {
  setMessage(errorEl, "Missing Stripe publishable key in firebase-config.js.");
  if (submitButton) {
    submitButton.disabled = true;
  }
} else if (form) {
  const app = initializeApp(window.firebaseConfig);
  const db = getFirestore(app);
  const functions = getFunctions(app);
  const createCheckoutSession = httpsCallable(functions, "createCheckoutSession");
  getDoc(doc(db, "settings", "shop"))
    .then((snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        taxRate = Number.isFinite(data.taxRate) ? data.taxRate / 100 : 0;
        renderSummary();
      }
    })
    .catch(() => {});

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    setMessage(successEl, "");
    setMessage(errorEl, "");
    setLoading(true);

    const { items, total } = getCartSummary();
    if (!items.length) {
      setMessage(errorEl, "Your cart is empty.");
      setLoading(false);
      return;
    }

    try {
      const response = await createCheckoutSession({
        items: items.map((item) => ({
          id: item.id,
          type: item.type,
          quantity: item.quantity,
          size: item.size || "",
        })),
        customer: {
          name: form.name.value.trim(),
          email: form.email.value.trim(),
          phone: form.phone.value.trim(),
          address: form.address.value.trim(),
          city: form.city.value.trim(),
          state: form.state.value.trim(),
          zip: form.zip.value.trim(),
          notes: form.notes.value.trim(),
        },
        origin: window.location.origin,
        successUrl: `${window.location.origin}/checkout-success.html?session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${window.location.origin}/checkout-cancel.html`,
      });
      const sessionId = response.data && response.data.sessionId;
      if (!sessionId) {
        throw new Error("Unable to start checkout.");
      }
      if (!window.Stripe) {
        throw new Error("Stripe failed to load.");
      }
      const stripe = window.Stripe(window.firebaseConfig.stripePublishableKey);
      const { error } = await stripe.redirectToCheckout({ sessionId });
      if (error) {
        throw error;
      }
    } catch (error) {
      setMessage(errorEl, error.message || "Unable to start checkout.");
      setLoading(false);
    }
  });
}

renderSummary();
