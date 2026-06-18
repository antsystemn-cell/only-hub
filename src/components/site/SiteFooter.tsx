import { Link } from "@tanstack/react-router";
import { Facebook, Instagram, Mail, MapPin, Phone, ShoppingBag } from "lucide-react";

export function SiteFooter() {
  return (
    <footer className="mt-12 border-t border-border bg-[#0f1115] text-slate-300">
      <div className="container mx-auto grid grid-cols-2 gap-6 px-4 py-10 sm:grid-cols-3 lg:grid-cols-5">
        <div className="col-span-2 sm:col-span-3 lg:col-span-2">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-500 text-white">
              <ShoppingBag className="h-4 w-4" />
            </div>
            <div className="leading-none">
              <div className="text-base font-extrabold text-white">ONLY</div>
              <div className="text-[9px] font-semibold tracking-wider text-orange-400">MERCHANTS HUB</div>
            </div>
          </div>
          <p className="mt-3 max-w-sm text-xs text-slate-400 sm:text-sm">
            Монголын хамгийн том мерчантуудын нэгдсэн платформ.
          </p>
          <div className="mt-4 flex items-center gap-2">
            <a href="#" aria-label="Facebook" className="flex h-8 w-8 items-center justify-center rounded-full bg-white/5 hover:bg-orange-500 hover:text-white"><Facebook className="h-4 w-4" /></a>
            <a href="#" aria-label="Instagram" className="flex h-8 w-8 items-center justify-center rounded-full bg-white/5 hover:bg-orange-500 hover:text-white"><Instagram className="h-4 w-4" /></a>
          </div>
        </div>

        <div>
          <h4 className="mb-3 text-sm font-semibold text-white">Хэрэгтэй холбоос</h4>
          <ul className="space-y-2 text-xs text-slate-400 sm:text-sm">
            <li><Link to="/stores" className="hover:text-orange-400">Дэлгүүрүүд</Link></li>
            <li><Link to="/blog" className="hover:text-orange-400">Блог</Link></li>
            <li><Link to="/account" className="hover:text-orange-400">Миний бүртгэл</Link></li>
          </ul>
        </div>

        <div>
          <h4 className="mb-3 text-sm font-semibold text-white">Мерчантад</h4>
          <ul className="space-y-2 text-xs text-slate-400 sm:text-sm">
            <li><Link to="/merchant/register" className="hover:text-orange-400">Бүртгүүлэх</Link></li>
            <li><Link to="/merchant/login" className="hover:text-orange-400">Нэвтрэх</Link></li>
          </ul>
        </div>

        <div>
          <h4 className="mb-3 text-sm font-semibold text-white">Холбоо барих</h4>
          <ul className="space-y-2 text-xs text-slate-400 sm:text-sm">
            <li className="flex items-center gap-2"><Phone className="h-3.5 w-3.5" /> +976 7711 1234</li>
            <li className="flex items-center gap-2"><Mail className="h-3.5 w-3.5" /> info@onlyhub.mn</li>
            <li className="flex items-center gap-2"><MapPin className="h-3.5 w-3.5" /> Улаанбаатар, Монгол</li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10 py-4 text-center text-[11px] text-slate-500 sm:text-xs">
        © {new Date().getFullYear()} Only Merchants Hub. Бүх эрх хуулиар хамгаалагдсан.
      </div>
    </footer>
  );
}
