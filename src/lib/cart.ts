import { useSyncExternalStore } from "react";

export type CartItem = {
  productId: string;
  name: string;
  price: number;
  image?: string | null;
  color?: string | null;
  size?: string | null;
  quantity: number;
};

const KEY = (merchantSlug: string) => `only:cart:${merchantSlug}`;
const listeners = new Set<() => void>();
const cache = new Map<string, CartItem[]>();

function read(merchantSlug: string): CartItem[] {
  if (cache.has(merchantSlug)) return cache.get(merchantSlug)!;
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY(merchantSlug));
    const parsed = raw ? (JSON.parse(raw) as CartItem[]) : [];
    cache.set(merchantSlug, parsed);
    return parsed;
  } catch {
    return [];
  }
}

function write(merchantSlug: string, items: CartItem[]) {
  cache.set(merchantSlug, items);
  if (typeof window !== "undefined") {
    localStorage.setItem(KEY(merchantSlug), JSON.stringify(items));
  }
  listeners.forEach((l) => l());
}

function keyOf(i: Pick<CartItem, "productId" | "color" | "size">) {
  return `${i.productId}|${i.color ?? ""}|${i.size ?? ""}`;
}

export const cart = {
  get: read,
  add(merchantSlug: string, item: CartItem) {
    const items = [...read(merchantSlug)];
    const k = keyOf(item);
    const idx = items.findIndex((i) => keyOf(i) === k);
    if (idx >= 0) items[idx] = { ...items[idx], quantity: items[idx].quantity + item.quantity };
    else items.push(item);
    write(merchantSlug, items);
  },
  setQty(merchantSlug: string, k: string, qty: number) {
    const items = read(merchantSlug)
      .map((i) => (keyOf(i) === k ? { ...i, quantity: qty } : i))
      .filter((i) => i.quantity > 0);
    write(merchantSlug, items);
  },
  remove(merchantSlug: string, k: string) {
    write(merchantSlug, read(merchantSlug).filter((i) => keyOf(i) !== k));
  },
  clear(merchantSlug: string) {
    write(merchantSlug, []);
  },
  keyOf,
};

export function useCart(merchantSlug: string) {
  const subscribe = (cb: () => void) => {
    listeners.add(cb);
    return () => listeners.delete(cb);
  };
  return useSyncExternalStore(
    subscribe,
    () => read(merchantSlug),
    () => [] as CartItem[],
  );
}
