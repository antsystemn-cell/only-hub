import { useSyncExternalStore } from "react";

export type WishlistItem = {
  productId: string;
  name: string;
  price: number;
  image?: string | null;
  merchantSlug?: string | null;
  productSlug?: string | null;
  addedAt: number;
};

const KEY = "only:wishlist";
const listeners = new Set<() => void>();
let cache: WishlistItem[] | null = null;

function read(): WishlistItem[] {
  if (cache) return cache;
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    cache = raw ? (JSON.parse(raw) as WishlistItem[]) : [];
  } catch {
    cache = [];
  }
  return cache!;
}

function write(items: WishlistItem[]) {
  cache = items;
  if (typeof window !== "undefined") {
    localStorage.setItem(KEY, JSON.stringify(items));
  }
  listeners.forEach((l) => l());
}

export const wishlist = {
  get: read,
  has(productId: string) {
    return read().some((i) => i.productId === productId);
  },
  add(item: Omit<WishlistItem, "addedAt">) {
    const items = read();
    if (items.some((i) => i.productId === item.productId)) return;
    write([{ ...item, addedAt: Date.now() }, ...items]);
  },
  remove(productId: string) {
    write(read().filter((i) => i.productId !== productId));
  },
  toggle(item: Omit<WishlistItem, "addedAt">) {
    const present = read().some((i) => i.productId === item.productId);
    if (present) {
      wishlist.remove(item.productId);
      return false;
    }
    wishlist.add(item);
    return true;
  },
  clear() {
    write([]);
  },
};

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};

export function useWishlist() {
  return useSyncExternalStore(subscribe, read, () => [] as WishlistItem[]);
}

export function useIsWishlisted(productId: string | undefined | null) {
  const items = useWishlist();
  return !!productId && items.some((i) => i.productId === productId);
}
