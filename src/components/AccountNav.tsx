import { Link } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LayoutDashboard, LogOut, ShieldCheck, User as UserIcon } from "lucide-react";

interface Props {
  variant?: "horizontal" | "vertical";
  onNavigate?: () => void;
}

/**
 * Shared user/account nav for public site headers.
 * - Logged out → Нэвтрэх / Бүртгүүлэх
 * - Logged in → user dropdown; "Мерчант хэсэг" / "Админ" links shown only if user has merchant or admin roles.
 */
export function AccountNav({ variant = "horizontal", onNavigate }: Props) {
  const { user, loading, isPlatformAdmin, primaryMerchantId, signOut } = useAuth();

  if (loading) return null;

  if (!user) {
    if (variant === "vertical") {
      return (
        <>
          <Link to="/login" onClick={onNavigate}>
            <Button variant="ghost" className="w-full justify-start">Нэвтрэх</Button>
          </Link>
          <Link to="/register" onClick={onNavigate}>
            <Button className="w-full">Бүртгүүлэх</Button>
          </Link>
        </>
      );
    }
    return (
      <>
        <Link to="/login"><Button variant="ghost" size="sm">Нэвтрэх</Button></Link>
        <Link to="/register"><Button size="sm">Бүртгүүлэх</Button></Link>
      </>
    );
  }

  const initials = (user.email ?? "?").slice(0, 1).toUpperCase();
  const hasMerchant = !!primaryMerchantId;

  if (variant === "vertical") {
    return (
      <>
        <div className="px-3 py-2 text-xs text-muted-foreground truncate">{user.email}</div>
        {hasMerchant && (
          <Link to="/merchant/dashboard" onClick={onNavigate}>
            <Button variant="ghost" className="w-full justify-start">
              <LayoutDashboard className="mr-2 h-4 w-4" /> Мерчант хэсэг
            </Button>
          </Link>
        )}
        {isPlatformAdmin && (
          <Link to="/admin" onClick={onNavigate}>
            <Button variant="ghost" className="w-full justify-start">
              <ShieldCheck className="mr-2 h-4 w-4" /> Админ
            </Button>
          </Link>
        )}
        <Button
          variant="ghost"
          className="w-full justify-start"
          onClick={async () => { await signOut(); onNavigate?.(); window.location.href = "/"; }}
        >
          <LogOut className="mr-2 h-4 w-4" /> Гарах
        </Button>
      </>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
            {initials}
          </span>
          <span className="hidden max-w-[120px] truncate sm:inline">{user.email}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="truncate">{user.email}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <Link to="/account">
          <DropdownMenuItem><UserIcon className="mr-2 h-4 w-4" /> Миний бүртгэл</DropdownMenuItem>
        </Link>
        {hasMerchant && (
          <Link to="/merchant/dashboard">
            <DropdownMenuItem><LayoutDashboard className="mr-2 h-4 w-4" /> Мерчант хэсэг</DropdownMenuItem>
          </Link>
        )}
        {isPlatformAdmin && (
          <Link to="/admin">
            <DropdownMenuItem><ShieldCheck className="mr-2 h-4 w-4" /> Админ</DropdownMenuItem>
          </Link>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={async () => { await signOut(); window.location.href = "/"; }}
        >
          <LogOut className="mr-2 h-4 w-4" /> Гарах
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
