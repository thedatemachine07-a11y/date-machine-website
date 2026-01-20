const CART_KEY = "dm_cart_v1";

const readCart = () => {
  if (!window.localStorage) {
    return [];
  }
  try {
    const stored = JSON.parse(window.localStorage.getItem(CART_KEY) || "[]");
    return Array.isArray(stored) ? stored : [];
  } catch (error) {
    return [];
  }
};

const writeCart = (items) => {
  if (!window.localStorage) {
    return;
  }
  window.localStorage.setItem(CART_KEY, JSON.stringify(items));
};

const normalizeItem = (item) => {
  const images =
    Array.isArray(item.images) && item.images.length
      ? item.images
      : item.imageUrl
      ? [item.imageUrl]
      : [];
  const size = item.size || "";
  const type = item.type || "shop";
  const key = `${type}::${item.id || "item"}::${size}`;
  return {
    id: item.id,
    key,
    type,
    name: item.name || "Item",
    price: Number(item.price) || 0,
    imageUrl: images[0] || "",
    images,
    size,
    quantity: Number(item.quantity) || 1,
  };
};

export const getCart = () => readCart();

export const addToCart = (item, quantity = 1) => {
  if (!item?.id) {
    return readCart();
  }
  const items = readCart();
  const normalized = normalizeItem({ ...item, quantity });
  const existing = items.find((entry) => entry.key === normalized.key);
  if (existing) {
    existing.quantity += quantity;
  } else {
    items.push(normalized);
  }
  writeCart(items);
  return items;
};

export const updateCartQuantity = (key, quantity) => {
  const items = readCart();
  const next = items
    .map((entry) =>
      (entry.key || entry.id) === key
        ? { ...entry, quantity: Math.max(1, Number(quantity) || 1) }
        : entry
    )
    .filter((entry) => entry.quantity > 0);
  writeCart(next);
  return next;
};

export const removeFromCart = (key) => {
  const items = readCart().filter((entry) => (entry.key || entry.id) !== key);
  writeCart(items);
  return items;
};

export const clearCart = () => {
  writeCart([]);
};

export const getCartSummary = () => {
  const items = readCart();
  const count = items.reduce((sum, entry) => sum + entry.quantity, 0);
  const total = items.reduce(
    (sum, entry) => sum + entry.quantity * (Number(entry.price) || 0),
    0
  );
  return { items, count, total };
};

export const formatCurrency = (value) => {
  const amount = Number(value);
  if (!Number.isFinite(amount)) {
    return "$0.00";
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
};
