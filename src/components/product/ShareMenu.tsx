import { useState } from "react";
import { toast } from "sonner";
import { Share2, Link as LinkIcon, Facebook, MessageCircle, Send, Twitter } from "lucide-react";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

type Props = {
  url: string;
  title: string;
  text?: string;
  className?: string;
  iconOnly?: boolean;
};

export function ShareMenu({ url, title, text, className, iconOnly }: Props) {
  const [open, setOpen] = useState(false);

  const tryWebShare = async () => {
    if (typeof navigator !== "undefined" && (navigator as any).share) {
      try {
        await (navigator as any).share({ title, text, url });
        return true;
      } catch {
        // user cancelled or failed → fall through to menu
        return false;
      }
    }
    return false;
  };

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    const shared = await tryWebShare();
    if (!shared) setOpen(true);
  };

  const enc = encodeURIComponent;
  const links = {
    fb: `https://www.facebook.com/sharer/sharer.php?u=${enc(url)}`,
    messenger: `fb-messenger://share/?link=${enc(url)}`,
    telegram: `https://t.me/share/url?url=${enc(url)}&text=${enc(title)}`,
    x: `https://twitter.com/intent/tweet?url=${enc(url)}&text=${enc(title)}`,
  };

  const openWin = (href: string) => {
    if (typeof window !== "undefined") {
      window.open(href, "_blank", "noopener,noreferrer,width=600,height=500");
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Холбоос хуулагдлаа");
    } catch {
      toast.error("Хуулж чадсангүй");
    }
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          onClick={handleClick}
          aria-label="Хуваалцах"
          className={
            className ??
            "inline-flex items-center gap-1.5 text-muted-foreground transition hover:text-foreground"
          }
        >
          <Share2 className="h-4 w-4" />
          {!iconOnly && <span className="text-sm">Хуваалцах</span>}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onClick={() => openWin(links.fb)}>
          <Facebook className="mr-2 h-4 w-4 text-blue-600" /> Facebook
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => openWin(links.messenger)}>
          <MessageCircle className="mr-2 h-4 w-4 text-blue-500" /> Messenger
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => openWin(links.telegram)}>
          <Send className="mr-2 h-4 w-4 text-sky-500" /> Telegram
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => openWin(links.x)}>
          <Twitter className="mr-2 h-4 w-4" /> X (Twitter)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={copy}>
          <LinkIcon className="mr-2 h-4 w-4" /> Холбоос хуулах
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
