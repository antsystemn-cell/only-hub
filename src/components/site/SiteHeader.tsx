import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { AccountNav } from "@/components/AccountNav";
import {
  Heart, Menu, Search, ShoppingBag, ShoppingCart, X,
} from "lucide-react";

type Props = {
  /** Show the search bar (default: true). Disable on dense pages. */
  showSearch?: boolean;
  /** Inline trailing slot (breadcrumb-style label next to logo). */
  rightOfLogo?: React.ReactNode;
  /** Override cart link target — defaults to /stores. */
  cartHref?: string;
  /** Optional extra trailing controls before AccountNav. */
  trailing?: React.ReactNode;
};

/**
 * Marketplace-style sticky header — orange ONLY logo, search, cart, AccountNav.
 * Visual layer only; no business logic.
 */
export function SiteHeader({ showSearch = true, rightOfLogo, cartHref = "/stores", trailing }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [q, setQ] = useState("");

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
      <div className="container mx-auto flex h-14 items-center gap-2 px-3 sm:h-16 sm:gap-4 sm:px-4">
        <Link to="/" className="flex shrink-0 items-center gap-1.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-500 text-white">
            <ShoppingBag className="h-4 w-4" />
          </div>
          <div className="hidden flex-col leading-none sm:flex">
            <span className="text-base font-extrabold tracking-tight">ONLY</span>
            <span className="text-[9px] font-semibold tracking-wider text-orange-600">MERCHANTS HUB</span>
          </div>
        </Link>

        {rightOfLogo && (
          <div className="hidden min-w-0 items-center gap-2 text-sm text-muted-foreground sm:flex">
            <span className="text-muted-foreground/60">/</span>
            <div className="min-w-0 truncate">{rightOfLogo}</div>
          </div>
        )}

        {showSearch ? (
          <form action="/stores" method="get" className="flex min-w-0 flex-1 items-center gap-2">
            <div className="relative flex min-w-0 flex-1 items-center">
              <Search className="pointer-events-none absolute left-3 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                name="q"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Бараа, дэлгүүр хайх..."
                className="h-9 w-full rounded-full border border-border bg-background pl-9 pr-20 text-sm outline-none transition focus:border-orange-400 focus:ring-2 focus:ring-orange-200 sm:h-10"
              />
              <button
                type="submit"
                className="absolute right-1 inline-flex h-7 items-center rounded-full bg-orange-500 px-3 text-xs font-semibold text-white hover:bg-orange-600 sm:h-8 sm:px-4 sm:text-sm"
              >
                Хайх
              </button>
            </div>
          </form>
        ) : (
          <div className="flex-1" />
        )}

        <nav className="hidden items-center gap-1 sm:flex">
          {trailing}
          <Link to="/account" aria-label="Хүссэн">
            <Button variant="ghost" size="icon" className="rounded-full">
              <Heart className="h-5 w-5" />
            </Button>
          </Link>
          <a href={cartHref} aria-label="Сагс">
            <Button variant="ghost" size="icon" className="rounded-full">
              <ShoppingCart className="h-5 w-5" />
            </Button>
          </a>
          <AccountNav />
        </nav>

        <button
          className="inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-accent sm:hidden"
          aria-label={menuOpen ? "Цэс хаах" : "Цэс нээх"}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}
        >
          {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {menuOpen && (
        <div className="border-t border-border bg-background sm:hidden">
          <div className="container mx-auto flex flex-col gap-1 p-3">
            {trailing}
            <Link to="/stores" onClick={() => setMenuOpen(false)}>
              <Button variant="ghost" className="w-full justify-start">
                <ShoppingBag className="mr-2 h-4 w-4" /> Дэлгүүрүүд
              </Button>
            </Link>
            <Link to="/account" onClick={() => setMenuOpen(false)}>
              <Button variant="ghost" className="w-full justify-start">
                <Heart className="mr-2 h-4 w-4" /> Хүссэн
              </Button>
            </Link>
            <AccountNav variant="vertical" onNavigate={() => setMenuOpen(false)} />
          </div>
        </div>
      )}
    </header>
  );
}
