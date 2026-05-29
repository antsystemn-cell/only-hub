import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import TextAlign from "@tiptap/extension-text-align";
import Underline from "@tiptap/extension-underline";
import Table from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Youtube from "@tiptap/extension-youtube";
import TextStyle from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { uploadOptimized } from "@/lib/image";
import { toast } from "sonner";
import {
  Bold, Italic, Strikethrough, Underline as UnderlineIcon, Heading1, Heading2, Heading3,
  List, ListOrdered, Quote, Code, Link as LinkIcon, Image as ImageIcon, Minus,
  Table as TableIcon, CheckSquare, FileVideo, Upload, AlignLeft, AlignCenter,
  AlignRight, Undo, Redo, Highlighter, Eraser,
} from "lucide-react";

type Props = {
  value: string;
  onChange: (html: string) => void;
  minHeight?: number;
  placeholder?: string;
};

function ToolbarBtn({
  onClick, active, disabled, title, children,
}: { onClick: () => void; active?: boolean; disabled?: boolean; title: string; children: React.ReactNode }) {
  return (
    <Button
      type="button" variant={active ? "secondary" : "ghost"} size="icon"
      className="h-8 w-8" onMouseDown={(e) => e.preventDefault()}
      onClick={onClick} disabled={disabled} title={title}
    >
      {children}
    </Button>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function onPickImage(file: File) {
    try {
      setUploading(true);
      const { url } = await uploadOptimized(file, "banners", "blog/inline");
      editor.chain().focus().setImage({ src: url, alt: file.name }).run();
    } catch (e: any) {
      toast.error(e.message ?? "Зураг оруулахад алдаа гарлаа");
    } finally {
      setUploading(false);
    }
  }

  function addLink() {
    const prev = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Холбоосын URL", prev ?? "https://");
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url, target: "_blank" }).run();
  }

  function addYoutube() {
    const url = window.prompt("YouTube URL");
    if (!url) return;
    editor.chain().focus().setYoutubeVideo({ src: url, width: 640, height: 360 }).run();
  }

  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-center gap-0.5 rounded-t-xl border-b bg-card/95 p-2 backdrop-blur">
      <ToolbarBtn title="Буцаах" onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()}>
        <Undo className="h-4 w-4" />
      </ToolbarBtn>
      <ToolbarBtn title="Дахин" onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()}>
        <Redo className="h-4 w-4" />
      </ToolbarBtn>
      <Separator orientation="vertical" className="mx-1 h-6" />

      <ToolbarBtn title="Гарчиг 1" active={editor.isActive("heading", { level: 1 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>
        <Heading1 className="h-4 w-4" />
      </ToolbarBtn>
      <ToolbarBtn title="Гарчиг 2" active={editor.isActive("heading", { level: 2 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
        <Heading2 className="h-4 w-4" />
      </ToolbarBtn>
      <ToolbarBtn title="Гарчиг 3" active={editor.isActive("heading", { level: 3 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
        <Heading3 className="h-4 w-4" />
      </ToolbarBtn>
      <Separator orientation="vertical" className="mx-1 h-6" />

      <ToolbarBtn title="Bold" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
        <Bold className="h-4 w-4" />
      </ToolbarBtn>
      <ToolbarBtn title="Italic" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}>
        <Italic className="h-4 w-4" />
      </ToolbarBtn>
      <ToolbarBtn title="Underline" active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()}>
        <UnderlineIcon className="h-4 w-4" />
      </ToolbarBtn>
      <ToolbarBtn title="Strike" active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()}>
        <Strikethrough className="h-4 w-4" />
      </ToolbarBtn>
      <ToolbarBtn title="Highlight" active={editor.isActive("highlight")} onClick={() => editor.chain().focus().toggleHighlight().run()}>
        <Highlighter className="h-4 w-4" />
      </ToolbarBtn>
      <label className="ml-1 inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md hover:bg-accent" title="Текстийн өнгө">
        <input
          type="color" className="h-5 w-5 cursor-pointer border-0 bg-transparent p-0"
          onChange={(e) => editor.chain().focus().setColor(e.target.value).run()}
        />
      </label>
      <ToolbarBtn title="Формат арилгах" onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}>
        <Eraser className="h-4 w-4" />
      </ToolbarBtn>
      <Separator orientation="vertical" className="mx-1 h-6" />

      <ToolbarBtn title="Зүүн" active={editor.isActive({ textAlign: "left" })}
        onClick={() => editor.chain().focus().setTextAlign("left").run()}>
        <AlignLeft className="h-4 w-4" />
      </ToolbarBtn>
      <ToolbarBtn title="Төв" active={editor.isActive({ textAlign: "center" })}
        onClick={() => editor.chain().focus().setTextAlign("center").run()}>
        <AlignCenter className="h-4 w-4" />
      </ToolbarBtn>
      <ToolbarBtn title="Баруун" active={editor.isActive({ textAlign: "right" })}
        onClick={() => editor.chain().focus().setTextAlign("right").run()}>
        <AlignRight className="h-4 w-4" />
      </ToolbarBtn>
      <Separator orientation="vertical" className="mx-1 h-6" />

      <ToolbarBtn title="Цэгтэй жагсаалт" active={editor.isActive("bulletList")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}>
        <List className="h-4 w-4" />
      </ToolbarBtn>
      <ToolbarBtn title="Дугаарласан жагсаалт" active={editor.isActive("orderedList")}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}>
        <ListOrdered className="h-4 w-4" />
      </ToolbarBtn>
      <ToolbarBtn title="Хийх зүйл" active={editor.isActive("taskList")}
        onClick={() => editor.chain().focus().toggleTaskList().run()}>
        <CheckSquare className="h-4 w-4" />
      </ToolbarBtn>
      <ToolbarBtn title="Иш татах" active={editor.isActive("blockquote")}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}>
        <Quote className="h-4 w-4" />
      </ToolbarBtn>
      <ToolbarBtn title="Код блок" active={editor.isActive("codeBlock")}
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}>
        <Code className="h-4 w-4" />
      </ToolbarBtn>
      <ToolbarBtn title="Хэвтээ зураас" onClick={() => editor.chain().focus().setHorizontalRule().run()}>
        <Minus className="h-4 w-4" />
      </ToolbarBtn>
      <Separator orientation="vertical" className="mx-1 h-6" />

      <ToolbarBtn title="Холбоос" active={editor.isActive("link")} onClick={addLink}>
        <LinkIcon className="h-4 w-4" />
      </ToolbarBtn>
      <ToolbarBtn title="Зураг оруулах" onClick={() => fileRef.current?.click()} disabled={uploading}>
        {uploading ? <Upload className="h-4 w-4 animate-pulse" /> : <ImageIcon className="h-4 w-4" />}
      </ToolbarBtn>
      <input
        ref={fileRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onPickImage(f); e.target.value = ""; }}
      />
      <ToolbarBtn title="YouTube" onClick={addYoutube}>
        <FileVideo className="h-4 w-4" />
      </ToolbarBtn>
      <ToolbarBtn title="Хүснэгт"
        onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>
        <TableIcon className="h-4 w-4" />
      </ToolbarBtn>
    </div>
  );
}

export function TiptapEditor({ value, onChange, minHeight = 480, placeholder }: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Underline,
      TextStyle,
      Color,
      Highlight.configure({ multicolor: false }),
      Placeholder.configure({ placeholder: placeholder ?? "Энд бичээрэй..." }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Link.configure({ openOnClick: false, autolink: true, HTMLAttributes: { class: "text-primary underline" } }),
      Image.configure({ HTMLAttributes: { class: "rounded-xl my-4" } }),
      Table.configure({ resizable: true }),
      TableRow, TableHeader, TableCell,
      TaskList,
      TaskItem.configure({ nested: true }),
      Youtube.configure({ controls: true, nocookie: true, HTMLAttributes: { class: "rounded-xl my-4 w-full aspect-video" } }),
    ],
    content: value || "",
    editorProps: {
      attributes: {
        class: "tiptap md-body focus:outline-none px-5 py-4",
        style: `min-height:${minHeight}px`,
      },
    },
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    immediatelyRender: false,
  });

  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    if (value && value !== current) editor.commands.setContent(value, { emitUpdate: false });
  }, [value, editor]);

  if (!editor) return <div className="h-[480px] animate-pulse rounded-xl bg-muted/40" />;

  return (
    <div className="overflow-hidden rounded-xl border bg-background">
      <Toolbar editor={editor} />
      <EditorContent editor={editor} />
    </div>
  );
}

export function TiptapViewer({ html }: { html: string }) {
  return <div className="md-body tiptap" dangerouslySetInnerHTML={{ __html: html || "" }} />;
}
