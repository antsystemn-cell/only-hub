import { useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { uploadOptimized } from "@/lib/image";
import { toast } from "sonner";
import {
  Bold, Italic, Strikethrough, Heading1, Heading2, Heading3, List, ListOrdered,
  Quote, Code, Link as LinkIcon, Image as ImageIcon, Minus, Table as TableIcon,
  CheckSquare, FileVideo, Upload,
} from "lucide-react";

type Props = {
  value: string;
  onChange: (v: string) => void;
  minHeight?: number;
};

export function RichMarkdownEditor({ value, onChange, minHeight = 480 }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  function wrap(before: string, after = before, placeholder = "") {
    const ta = ref.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = value.slice(start, end) || placeholder;
    const next = value.slice(0, start) + before + selected + after + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      ta.focus();
      const pos = start + before.length;
      ta.setSelectionRange(pos, pos + selected.length);
    });
  }

  function linePrefix(prefix: string) {
    const ta = ref.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const lineStart = value.lastIndexOf("\n", start - 1) + 1;
    const block = value.slice(lineStart, end);
    const replaced = block
      .split("\n")
      .map((l) => (l.startsWith(prefix) ? l : prefix + l))
      .join("\n");
    const next = value.slice(0, lineStart) + replaced + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => ta.focus());
  }

  function insert(text: string) {
    const ta = ref.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const next = value.slice(0, start) + text + value.slice(ta.selectionEnd);
    onChange(next);
    requestAnimationFrame(() => {
      ta.focus();
      const pos = start + text.length;
      ta.setSelectionRange(pos, pos);
    });
  }

  function insertLink() {
    const url = prompt("Холбоосын URL:");
    if (!url) return;
    wrap("[", `](${url})`, "холбоос текст");
  }

  function insertImageUrl() {
    const url = prompt("Зургийн URL:");
    if (!url) return;
    insert(`\n![](${url})\n`);
  }

  function insertVideo() {
    const url = prompt("YouTube/видео embed URL:");
    if (!url) return;
    insert(`\n<iframe src="${url}" width="100%" height="420" frameborder="0" allowfullscreen></iframe>\n`);
  }

  async function uploadImage(file: File) {
    try {
      setUploading(true);
      const { url } = await uploadOptimized(file, "banners", "blog");
      insert(`\n![](${url})\n`);
      toast.success("Зураг орууллаа");
    } catch (e: any) {
      toast.error(e.message ?? "Зураг ачаалж чадсангүй");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const tools = [
    { icon: Heading1, title: "Гарчиг 1", action: () => linePrefix("# ") },
    { icon: Heading2, title: "Гарчиг 2", action: () => linePrefix("## ") },
    { icon: Heading3, title: "Гарчиг 3", action: () => linePrefix("### ") },
    { icon: Bold, title: "Бүдүүн", action: () => wrap("**", "**", "текст") },
    { icon: Italic, title: "Налуу", action: () => wrap("*", "*", "текст") },
    { icon: Strikethrough, title: "Зураас", action: () => wrap("~~", "~~", "текст") },
    { icon: List, title: "Жагсаалт", action: () => linePrefix("- ") },
    { icon: ListOrdered, title: "Дугаарласан жагсаалт", action: () => linePrefix("1. ") },
    { icon: CheckSquare, title: "Шалгах жагсаалт", action: () => linePrefix("- [ ] ") },
    { icon: Quote, title: "Иш татах", action: () => linePrefix("> ") },
    { icon: Code, title: "Код", action: () => insert("\n```\nкод\n```\n") },
    { icon: LinkIcon, title: "Холбоос", action: insertLink },
    { icon: ImageIcon, title: "Зураг URL-ээр", action: insertImageUrl },
    { icon: FileVideo, title: "Видео embed", action: insertVideo },
    { icon: TableIcon, title: "Хүснэгт", action: () => insert("\n| Багана 1 | Багана 2 |\n|---|---|\n| A | B |\n") },
    { icon: Minus, title: "Зураас", action: () => insert("\n---\n") },
  ];

  return (
    <div className="rounded-xl border bg-card">
      <div className="flex flex-wrap items-center gap-1 border-b p-2">
        {tools.map((t, i) => (
          <Button key={i} type="button" size="icon" variant="ghost" className="h-8 w-8" title={t.title} onClick={t.action}>
            <t.icon className="h-4 w-4" />
          </Button>
        ))}
        <div className="mx-1 h-6 w-px bg-border" />
        <Button
          type="button" size="sm" variant="ghost"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
        >
          <Upload className="mr-1 h-4 w-4" /> {uploading ? "Ачааллаж..." : "Зураг хуулах"}
        </Button>
        <input
          ref={fileRef} type="file" accept="image/*" className="hidden"
          onChange={(e) => e.target.files?.[0] && uploadImage(e.target.files[0])}
        />
      </div>

      <Tabs defaultValue="write" className="w-full">
        <div className="border-b px-2">
          <TabsList className="h-9 bg-transparent">
            <TabsTrigger value="write">Бичих</TabsTrigger>
            <TabsTrigger value="preview">Урьдчилан харах</TabsTrigger>
            <TabsTrigger value="split">Хуваасан</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="write" className="m-0">
          <Textarea
            ref={ref}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Markdown форматаар бичнэ үү... # Гарчиг, **бүдүүн**, *налуу*, [холбоос](url), ![](зураг-url)"
            style={{ minHeight }}
            className="resize-y rounded-none border-0 font-mono text-sm leading-relaxed focus-visible:ring-0"
          />
        </TabsContent>

        <TabsContent value="preview" className="m-0 p-6" style={{ minHeight }}>
          <MarkdownPreview value={value} />
        </TabsContent>

        <TabsContent value="split" className="m-0 grid grid-cols-1 gap-0 md:grid-cols-2">
          <Textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            style={{ minHeight }}
            className="resize-y rounded-none border-0 border-r font-mono text-sm leading-relaxed focus-visible:ring-0"
          />
          <div className="overflow-auto p-6" style={{ minHeight, maxHeight: minHeight + 200 }}>
            <MarkdownPreview value={value} />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export function MarkdownPreview({ value }: { value: string }) {
  if (!value.trim()) return <p className="text-sm text-muted-foreground">Хоосон...</p>;
  return (
    <div className="prose prose-sm max-w-none dark:prose-invert prose-headings:font-bold prose-img:rounded-xl prose-a:text-primary">
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>{value}</ReactMarkdown>
    </div>
  );
}
