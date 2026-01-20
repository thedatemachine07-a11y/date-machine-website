import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  doc,
  getDoc,
  getFirestore,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  clearCart,
  formatCurrency,
  getCartSummary,
  removeFromCart,
  updateCartQuantity,
} from "./cart-utils.js";

const listEl = document.querySelector("#cart-items");
const summaryEl = document.querySelector("#cart-summary");
const emptyEl = document.querySelector("#cart-empty");
const checkoutButton = document.querySelector("#cart-checkout");
const clearButton = document.querySelector("#cart-clear");
let taxRate = 0;

const renderSummary = () => {
  if (!summaryEl) {
    return;
  }
  const { count, total } = getCartSummary();
  const taxAmount = total * taxRate;
  const totalWithTax = total + taxAmount;
  summaryEl.innerHTML = "";
  const itemsRow = document.createElement("div");
  itemsRow.className = "cart-summary-row";
  itemsRow.innerHTML = `<span>Subtotal (${count})</span><strong>${formatCurrency(total)}</strong>`;
  summaryEl.appendChild(itemsRow);

  const taxRow = document.createElement("div");
  taxRow.className = "cart-summary-row";
  taxRow.innerHTML = `<span>Tax</span><strong>${formatCurrency(taxAmount)}</strong>`;
  summaryEl.appendChild(taxRow);

  const totalRow = document.createElement("div");
  totalRow.className = "cart-summary-row cart-summary-total";
  totalRow.innerHTML = `<span>Estimated total</span><strong>${formatCurrency(totalWithTax)}</strong>`;
  summaryEl.appendChild(totalRow);
};

const renderCart = () => {
  if (!listEl) {
    return;
  }
  const { items } = getCartSummary();
  listEl.innerHTML = "";

  if (!items.length) {
    if (emptyEl) {
      emptyEl.hidden = false;
    }
    if (checkoutButton) {
      checkoutButton.disabled = true;
    }
    renderSummary();
    return;
  }

  if (emptyEl) {
    emptyEl.hidden = true;
  }
  if (checkoutButton) {
    checkoutButton.disabled = false;
  }

  items.forEach((item) => {
    const row = document.createElement("div");
    row.className = "cart-item";

    const media = document.createElement("div");
    media.className = "cart-item-media";
    if (item.imageUrl) {
      const img = document.createElement("img");
      img.src = item.imageUrl;
      img.alt = item.name ? `${item.name} photo` : "Shop item";
      img.loading = "lazy";
      media.appendChild(img);
    } else {
      const placeholder = document.createElement("span");
      placeholder.className = "footer-note";
      placeholder.textContent = "Image coming soon.";
      media.appendChild(placeholder);
    }

    const info = document.createElement("div");
    info.className = "cart-item-info";

    const name = document.createElement("p");
    name.className = "cart-item-name";
    if (item.size) {
      name.textContent = `${item.name || "Item"} (${item.size})`;
    } else {
      name.textContent = item.name || "Item";
    }


    const price = document.createElement("p");
    price.className = "cart-item-price";
    price.textContent = formatCurrency(item.price);

    info.append(name);
    if (item.size) {
      const size = document.createElement("span");
      size.className = "pill";
      size.textContent = item.size;
      info.appendChild(size);
    }
    info.append(price);

    const controls = document.createElement("div");
    controls.className = "cart-item-controls";

    const qtyWrap = document.createElement("div");
    qtyWrap.className = "qty-control";

    const minus = document.createElement("button");
    minus.type = "button";
    minus.textContent = "-";
    minus.addEventListener("click", () => {
      if (item.quantity <= 1) {
        removeFromCart(item.key || item.id);
      } else {
        updateCartQuantity(item.key || item.id, item.quantity - 1);
      }
      renderCart();
    });

    const input = document.createElement("input");
    input.type = "number";
    input.min = "1";
    input.value = String(item.quantity);
    input.addEventListener("change", () => {
      updateCartQuantity(item.key || item.id, input.value);
      renderCart();
    });

    const plus = document.createElement("button");
    plus.type = "button";
    plus.textContent = "+";
    plus.addEventListener("click", () => {
      updateCartQuantity(item.key || item.id, item.quantity + 1);
      renderCart();
    });

    qtyWrap.append(minus, input, plus);

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "btn btn-ghost btn-small";
    remove.textContent = "Remove";
    remove.addEventListener("click", () => {
      removeFromCart(item.key || item.id);
      renderCart();
    });

    controls.append(qtyWrap, remove);
    row.append(media, info, controls);
    listEl.appendChild(row);
  });

  renderSummary();
};

if (checkoutButton) {
  checkoutButton.addEventListener("click", () => {
    const { items } = getCartSummary();
    if (items.length) {
      window.location.href = "checkout.html";
    }
  });
}

if (clearButton) {
  clearButton.addEventListener("click", () => {
    clearCart();
    renderCart();
  });
}

const loadTaxRate = async () => {
  if (!window.firebaseConfig || window.firebaseConfig.apiKey === "REPLACE_ME") {
    return;
  }
  try {
    const app = initializeApp(window.firebaseConfig);
    const db = getFirestore(app);
    const snapshot = await getDoc(doc(db, "settings", "shop"));
    if (snapshot.exists()) {
      const data = snapshot.data();
      taxRate = Number.isFinite(data.taxRate) ? data.taxRate / 100 : 0;
    }
  } catch (error) {
    taxRate = 0;
  }
};

loadTaxRate().finally(() => {
  renderCart();
});
