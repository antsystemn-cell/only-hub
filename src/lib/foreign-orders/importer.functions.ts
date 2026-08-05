import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getProvider } from "./providers/index.server";

export const previewForeignImport = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z
      .object({
        merchantId: z.string(),
        source: z.enum(["POIZON_KR", "TAOBAO"]),
        url: z.string().url(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    try {
      const provider = getProvider(data.source);
      const link = provider.resolveLink(data.url);
      if (!link.ok) {
        return {
          status: "ERROR",
          warnings: [link.reason || "Буруу линк байна."],
          parsed: null,
        };
      }

      const product = await provider.getProduct({
        url: data.url,
        productId: link.productId!,
        merchantId: data.merchantId,
      });

      return {
        status: product.status,
        warnings: product.warnings,
        parsed: product,
      };
    } catch (error: any) {
      console.error("[previewForeignImport] error:", error);
      return {
        status: "ERROR",
        warnings: [error.message || "Мэдээлэл татахад алдаа гарлаа."],
        parsed: null,
      };
    }
  });

export const createForeignProduct = createServerFn({ method: "POST" })
  .inputValidator((data) => z.any().parse(data))
  .handler(async ({ data }) => {
    const { createForeignProductInternal } = await import("./importer.server");
    return createForeignProductInternal(data);
  });

export const findExistingForeignProduct = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z
      .object({
        merchantId: z.string(),
        source: z.string(),
        sourceProductId: z.string().nullable(),
        sourceUrl: z.string().nullable(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { findExistingForeignProductInternal } = await import("./importer.server");
    return findExistingForeignProductInternal(data);
  });
