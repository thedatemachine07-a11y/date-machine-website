import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  collection,
  doc,
  getDoc,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { addToCart, formatCurrency, getCartSummary } from "./cart-utils.js";

const listEl = document.querySelector("#shop-items");
const errorEl = document.querySelector("#shop-error");
const emptyEl = document.querySelector("#shop-empty");
const cartEmptyEl = document.querySelector("[data-cart-empty]");
const cartPreviewEl = document.querySelector("[data-cart-preview]");
const cartCountEl = document.querySelector("[data-cart-count]");
const cartTotalEl = document.querySelector("[data-cart-total]");
const cartTaxEl = document.querySelector("[data-cart-tax]");
let taxRate = 0;
let shopItems = [];
let eventItems = [];

const setMessage = (element, message) => {
  if (!element) {
    return;
  }
  element.textContent = message || "";
  element.hidden = !message;
};

const updateCartPreview = () => {
  const { items, count, total } = getCartSummary();
  const taxAmount = total * taxRate;
  const totalWithTax = total + taxAmount;
  if (cartCountEl) {
    cartCountEl.textContent = String(count);
  }
  if (cartTotalEl) {
    cartTotalEl.textContent = formatCurrency(totalWithTax);
  }
  if (cartTaxEl) {
    cartTaxEl.textContent = formatCurrency(taxAmount);
  }

  if (!cartPreviewEl || !cartEmptyEl) {
    return;
  }

  if (!items.length) {
    cartEmptyEl.hidden = false;
    cartPreviewEl.hidden = true;
    cartPreviewEl.innerHTML = "";
    return;
  }

  cartEmptyEl.hidden = true;
  cartPreviewEl.hidden = false;
  cartPreviewEl.innerHTML = "";

  items.slice(0, 3).forEach((item) => {
    const row = document.createElement("div");
    row.className = "cart-preview-item";
    const sizeLabel = item.size ? ` (${item.size})` : "";
    row.textContent = `${item.name}${sizeLabel} x${item.quantity}`;
    cartPreviewEl.appendChild(row);
  });

  if (items.length > 3) {
    const more = document.createElement("p");
    more.className = "footer-note";
    more.textContent = `+${items.length - 3} more item(s)`;
    cartPreviewEl.appendChild(more);
  }
};

const parsePrice = (value) => {
  if (Number.isFinite(value)) {
    return value;
  }
  const cleaned = String(value || "").replace(/[^0-9.]/g, "");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
};

const renderItemList = (items) => {
  if (!listEl) {
    return;
  }
  listEl.innerHTML = "";
  if (!items.length) {
    setMessage(emptyEl, "No shop items yet.");
    return;
  }

  setMessage(emptyEl, "");

  items.forEach((entry) => {
    const data = entry.data;
    const status = (data.status || "available").toLowerCase();
    const sizes = Array.isArray(data.sizes)
      ? data.sizes.map((size) =>
          typeof size === "string"
            ? { size, quantity: 0 }
            : { size: size.size || "", quantity: Number(size.quantity) || 0 }
        )
      : [];
    const hasSizes = sizes.length > 0;
    const quantity = Number.isFinite(data.quantity) ? data.quantity : 0;
    if (status === "hidden") {
      return;
    }

    const card = document.createElement("div");
    card.className = "product-card";

    const images = Array.isArray(data.images) && data.images.length
      ? data.images
      : data.imageUrl
      ? [data.imageUrl]
      : [];
    const coverImage = images[0];

    const media = document.createElement("div");
    media.className = "product-media";
    if (coverImage) {
      const img = document.createElement("img");
      img.src = coverImage;
      img.alt = data.name ? `${data.name} photo` : "Shop item";
      img.loading = "lazy";
      media.appendChild(img);
    } else {
      const placeholder = document.createElement("span");
      placeholder.className = "footer-note";
      placeholder.textContent = "Image coming soon.";
      media.appendChild(placeholder);
    }

    const content = document.createElement("div");
    content.className = "product-content";

    const title = document.createElement("h4");
    title.textContent = data.name || "Untitled item";

    const price = document.createElement("p");
    price.className = "product-price";
    price.textContent = formatCurrency(data.price);

    const desc = document.createElement("p");
    desc.className = "footer-note";
    desc.textContent = data.description || "More details coming soon.";

    let sizeSelect = null;
    if (hasSizes) {
      sizeSelect = document.createElement("select");
      sizeSelect.className = "product-size";

      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = entry.type === "event" ? "Select ticket" : "Select size";
      placeholder.disabled = true;
      placeholder.selected = true;
      sizeSelect.appendChild(placeholder);

      sizes.forEach((entry) => {
        const option = document.createElement("option");
        option.value = entry.size;
        option.textContent = entry.quantity > 0 ? entry.size : `${entry.size} (sold out)`;
        if (entry.quantity <= 0) {
          option.disabled = true;
        }
        sizeSelect.appendChild(option);
      });
    }

    let gallery;
    if (images.length > 1) {
      gallery = document.createElement("div");
      gallery.className = "product-gallery";
      images.slice(1).forEach((thumbSrc, idx) => {
        const thumb = document.createElement("img");
        thumb.src = thumbSrc;
        thumb.alt = `${data.name || "Item"} image ${idx + 2}`;
        thumb.loading = "lazy";
        gallery.appendChild(thumb);
      });
    }

    const actions = document.createElement("div");
    actions.className = "product-actions";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn btn-secondary";
    button.textContent = "Add to cart";

    const hasAvailableSizes = hasSizes
      ? sizes.some((entry) => entry.quantity > 0)
      : quantity > 0;
    const isSoldOut = status !== "available" || !hasAvailableSizes;
    if (isSoldOut) {
      button.disabled = true;
      button.textContent = "Sold out";
      const pill = document.createElement("span");
      pill.className = "pill";
      pill.textContent = "Sold out";
      content.appendChild(pill);
    } else {
      if (sizeSelect) {
        button.disabled = true;
        sizeSelect.addEventListener("change", () => {
          const selected = sizes.find((entry) => entry.size === sizeSelect.value);
          button.disabled = !selected || selected.quantity <= 0;
        });
      }
      button.addEventListener("click", () => {
        addToCart({
          id: entry.id,
          type: entry.type,
          name: data.name,
          price: data.price,
          imageUrl: coverImage,
          images,
          size: sizeSelect?.value || "",
        });
        updateCartPreview();
      });
    }

    actions.appendChild(button);
    content.append(title, price, desc);
    if (sizeSelect) {
      content.appendChild(sizeSelect);
    }
    if (gallery) {
      content.appendChild(gallery);
    }
    content.appendChild(actions);
    card.append(media, content);
    listEl.appendChild(card);
  });
};

const renderAllItems = () => {
  const combined = [...eventItems, ...shopItems];
  renderItemList(combined);
};

updateCartPreview();

if (!window.firebaseConfig || window.firebaseConfig.apiKey === "REPLACE_ME") {
  setMessage(errorEl, "Missing Firebase config. Update firebase-config.js.");
} else if (listEl) {
  const app = initializeApp(window.firebaseConfig);
  const db = getFirestore(app);
  const settingsRef = doc(db, "settings", "shop");
  getDoc(settingsRef)
    .then((snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        taxRate = Number.isFinite(data.taxRate) ? data.taxRate / 100 : 0;
        updateCartPreview();
      }
    })
    .catch(() => {});
  const itemsQuery = query(
    collection(db, "shopItems"),
    orderBy("createdAt", "desc")
  );
  const eventsQuery = query(
    collection(db, "events"),
    orderBy("date", "asc")
  );

  onSnapshot(itemsQuery, (snapshot) => {
    shopItems = snapshot.docs.map((docRef) => {
      const data = docRef.data() || {};
      const images = Array.isArray(data.images) && data.images.length
        ? data.images
        : data.imageUrl
        ? [data.imageUrl]
        : [];
      return {
        id: docRef.id,
        type: "shop",
        data: {
          ...data,
          price: parsePrice(data.price),
          images,
          imageUrl: images[0] || "",
        },
      };
    });
    renderAllItems();
  }, (error) => {
    setMessage(errorEl, error.message);
  });

  onSnapshot(eventsQuery, (snapshot) => {
    eventItems = snapshot.docs.map((docRef) => {
      const data = docRef.data() || {};
      const timePart = data.time ? ` at ${data.time}` : "";
      const location = data.location ? data.location : "Location TBD";
      const desc = `${data.date || "TBD"}${timePart} • ${location}`;
      const maleTickets = Number(data.maleTickets) || 0;
      const femaleTickets = Number(data.femaleTickets) || 0;
      const hasTickets = maleTickets > 0 || femaleTickets > 0;
      const statusRaw = String(data.status || "scheduled").toLowerCase();
      const status = statusRaw === "cancelled" ||
        statusRaw === "canceled" ||
        statusRaw === "ended"
        ? "hidden"
        : statusRaw === "sold-out" || !hasTickets
        ? "sold-out"
        : "available";
      const sizes = [
        { size: "Male", quantity: maleTickets },
        { size: "Female", quantity: femaleTickets },
      ];
      return {
        id: docRef.id,
        type: "event",
        data: {
          name: data.title || "Event ticket",
          description: data.notes || desc,
          price: parsePrice(
            data.ticketPrice !== undefined ? data.ticketPrice : data.price
          ),
          status,
          sizes,
          quantity: 0,
          images: data.imageUrl ? [data.imageUrl] : [],
          imageUrl: data.imageUrl || "",
        },
      };
    });
    renderAllItems();
  }, (error) => {
    setMessage(errorEl, error.message);
  });
}
