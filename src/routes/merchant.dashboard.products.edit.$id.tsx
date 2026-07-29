// Dedicated edit page for a single product. Loads the product by id and hands
// it to the shared ProductEditForm. Save/cancel navigates back to the list.
import { createFileRoute, useNavigate, useParams, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { ProductEditForm, type ProductFormValue, blankProduct } from "@/components/merchant/ProductEditForm";

export const Route = createFileRoute("/merchant/dashboard/products/edit/$id")({
  component: ProductEditPage,
});

function ProductEditPage() {
  const { id } = useParams({ from: "/merchant/dashboard/products/edit/$id" });
  const navigate = useNavigate();
  const { primaryMerchantId } = useAuth();
  const merchantId = primaryMerchantId!;

  const { data: product, isLoading, error } = useQuery({
    queryKey: ["product-edit", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const goBack = () => navigate({ to: "/merchant/dashboard/products" });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/merchant/dashboard/products">
            <ArrowLeft className="mr-1 h-4 w-4" /> Буцах
          </Link>
        </Button>
        <h1 className="text-2xl font-bold truncate">{product?.name ?? "Бүтээгдэхүүн засварлах"}</h1>
      </div>

      {isLoading ? (
        <p className="py-10 text-center text-muted-foreground">Уншиж байна…</p>
      ) : error || !product ? (
        <p className="py-10 text-center text-destructive">Бүтээгдэхүүн олдсонгүй</p>
      ) : merchantId && product.merchant_id !== merchantId ? (
        <p className="py-10 text-center text-destructive">Энэ бүтээгдэхүүнд хандах эрхгүй байна</p>
      ) : (
        <ProductEditForm
          merchantId={merchantId}
          editId={id}
          initial={{ ...blankProduct, ...(product as unknown as ProductFormValue) }}
          onSaved={goBack}
          onCancel={goBack}
        />
      )}
    </div>
  );
}
