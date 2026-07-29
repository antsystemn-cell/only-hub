import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import {
  deleteProductVariantService,
  listProductVariantsService,
  revertVariantToSourcePriceService,
  upsertProductVariantService,
} from "./variants.server";

export const listProductVariants = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ productId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => listProductVariantsService(context, data.productId));

export const upsertProductVariant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        productId: z.string().uuid(),
        variantId: z.string().uuid().optional().nullable(),
        sizeLabel: z.string().max(200).nullable().optional(),
        colorLabel: z.string().max(200).nullable().optional(),
        sourcePrice: z.number().nonnegative().nullable().optional(),
        manualPriceOverride: z.boolean().default(false),
        manualCustomerPriceMnt: z.number().nonnegative().nullable().optional(),
        isPurchasable: z.boolean().default(true),
        isVisible: z.boolean().default(true),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => upsertProductVariantService(context, data));

export const revertVariantToSourcePrice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ variantId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => revertVariantToSourcePriceService(context, data.variantId));

export const deleteProductVariant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ variantId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => deleteProductVariantService(context, data.variantId));
