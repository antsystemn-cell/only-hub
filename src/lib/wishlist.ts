import { useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";

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
let currentUserId: string | null = null;
let synced = false;

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

// UUID check — only product ids that are valid UUIDs can sync to DB.
const isUuid = (s: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

async function pushToDb(productId: string) {
  if (!currentUserId || !isUuid(productId)) return;
  try {
    await supabase
      .from("wishlist_items")
      .upsert({ user_id: currentUserId, product_id: productId }, { onConflict: "user_id,product_id" });
  } catch (e) {
    console.warn("[wishlist] push failed", e);
  }
}

async function removeFromDb(productId: string) {
  if (!currentUserId || !isUuid(productId)) return;
  try {
    await supabase
      .from("wishlist_items")
      .delete()
      .eq("user_id", currentUserId)
      .eq("product_id", productId);
  } catch (e) {
    console.warn("[wishlist] remove failed", e);
  }
}

async function fullSync(userId: string) {
  currentUserId = userId;
  const local = read();
  // 1) push every local item to DB (upsert dedupes)
  const localUuid = local.filter((i) => isUuid(i.productId));
  if (localUuid.length > 0) {
    try {
      await supabase
        .from("wishlist_items")
        .upsert(localUuid.map((i) => ({ user_id: userId, product_id: i.productId })), {
          onConflict: "user_id,product_id",
        });
    } catch (e) {
      console.warn("[wishlist] merge push failed", e);
    }
  }
  // 2) pull DB list; enrich any missing items via products table
  try {
    const { data: rows } = await supabase
      .from("wishlist_items")
      .select("product_id, created_at")
      .order("created_at", { ascending: false });
    const dbIds = (rows ?? []).map((r: any) => r.product_id as string);
    const knownById = new Map(local.map((i) => [i.productId, i] as const));
    const missing = dbIds.filter((id) => !knownById.has(id));
    let extras: WishlistItem[] = [];
    if (missing.length > 0) {
      const { data: prods } = await supabase
        .from("products")
        .select("id, name, price, thumbnail_url, image_url, slug, merchant_id, merchants!inner(slug)")
        .in("id", missing);
      extras = (prods ?? []).map((p: any) => ({
        productId: p.id,
        name: p.name,
        price: Number(p.price),
        image: p.thumbnail_url ?? p.image_url ?? null,
        productSlug: p.slug ?? p.id,
        merchantSlug: p.merchants?.slug ?? null,
        addedAt: Date.now(),
      }));
    }
    // Final list = DB order; merge enrichment with local known items
    const merged: WishlistItem[] = dbIds.map((id) => knownById.get(id) ?? extras.find((e) => e.productId === id)!).filter(Boolean) as WishlistItem[];
    // also keep local items not yet in DB (non-uuid entries shouldn't normally exist)
    for (const item of local) {
      if (!merged.some((m) => m.productId === item.productId)) merged.push(item);
    }
    write(merged);
  } catch (e) {
    console.warn("[wishlist] pull failed", e);
  }
  synced = true;
}

// Initialize auth listener (browser only)
if (typeof window !== "undefined") {
  supabase.auth.getSession().then(({ data }) => {
    if (data.session?.user?.id) {
      void fullSync(data.session.user.id);
    } else {
      read();
    }
  });
  supabase.auth.onAuthStateChange((event, sess) => {
    if (event === "SIGNED_IN" && sess?.user?.id) {
      void fullSync(sess.user.id);
    } else if (event === "SIGNED_OUT") {
      currentUserId = null;
      synced = false;
      write([]);
    }
  });
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
    void pushToDb(item.productId);
  },
  remove(productId: string) {
    write(read().filter((i) => i.productId !== productId));
    void removeFromDb(productId);
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
  isSynced: () => synced,
};

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
};

export function useWishlist() {
  return useSyncExternalStore(subscribe, read, () => [] as WishlistItem[]);
}

export function useIsWishlisted(productId: string | undefined | null) {
  const items = useWishlist();
  return !!productId && items.some((i) => i.productId === productId);
}
