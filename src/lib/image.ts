// Client-side image optimization → WebP, uploaded to Lovable Cloud Storage.
import { supabase } from "@/integrations/supabase/client";

async function loadImage(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

function resize(img: HTMLImageElement, maxW: number): HTMLCanvasElement {
  const ratio = Math.min(1, maxW / img.width);
  const w = Math.round(img.width * ratio);
  const h = Math.round(img.height * ratio);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0, w, h);
  return canvas;
}

function canvasToBlob(canvas: HTMLCanvasElement, type = "image/webp", quality = 0.85): Promise<Blob> {
  return new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("blob fail"))), type, quality));
}

export async function uploadOptimized(
  file: File,
  bucket: "product-images" | "merchant-logos" | "banners" | "brand-logos",
  pathPrefix: string,
): Promise<{ url: string; thumbnailUrl: string }> {
  if (file.size > 5 * 1024 * 1024) throw new Error("Файлын хэмжээ 5MB-аас бага байх ёстой");
  const img = await loadImage(file);
  const mainBlob = await canvasToBlob(resize(img, 1200));
  const thumbBlob = await canvasToBlob(resize(img, 200));
  const stamp = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  const mainPath = `${pathPrefix}/${stamp}-${rand}.webp`;
  const thumbPath = `${pathPrefix}/${stamp}-${rand}-thumb.webp`;
  const up1 = await supabase.storage.from(bucket).upload(mainPath, mainBlob, { contentType: "image/webp", upsert: true });
  if (up1.error) throw up1.error;
  const up2 = await supabase.storage.from(bucket).upload(thumbPath, thumbBlob, { contentType: "image/webp", upsert: true });
  if (up2.error) throw up2.error;
  const { data: u1 } = supabase.storage.from(bucket).getPublicUrl(mainPath);
  const { data: u2 } = supabase.storage.from(bucket).getPublicUrl(thumbPath);
  return { url: u1.publicUrl, thumbnailUrl: u2.publicUrl };
}
