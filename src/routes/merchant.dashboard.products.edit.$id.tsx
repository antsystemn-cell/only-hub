// src/routes/merchant.dashboard.products.edit.$id.tsx
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
  const { primaryMerchantId, loading: authLoading } = useAuth();
  
  // We need to wait for auth to load to get the primaryMerchantId
  const merchantId = primaryMerchantId;

  const { data: product, isLoading: productLoading, error } = useQuery({
    queryKey: ["product-edit", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const goBack = () => navigate({ to: "/merchant/dashboard/products" });

  if (authLoading || productLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center text-muted-foreground">
        Уншиж байна…
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="flex min-h-[400px] flex-col items-center justify-center gap-4">
        <p className="text-destructive font-medium">Бүтээгдэхүүн олдсонгүй эсвэл алдаа гарлаа</p>
        <Button variant="outline" asChild>
          <Link to="/merchant/dashboard/products">Буцах</Link>
        </Button>
      </div>
    );
  }

  // Check if current user is admin of this merchant
  if (merchantId && product.merchant_id !== merchantId) {
    return (
      <div className="flex min-h-[400px] flex-col items-center justify-center gap-4">
        <p className="text-destructive font-medium">Энэ бүтээгдэхүүнд хандах эрхгүй байна</p>
        <Button variant="outline" asChild>
          <Link to="/merchant/dashboard/products">Буцах</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/merchant/dashboard/products">
            <ArrowLeft className="mr-1 h-4 w-4" /> Буцах
          </Link>
        </Button>
        <h1 className="text-2xl font-bold truncate">"{product.name}" засварлах</h1>
      </div>

      <ProductEditForm
        merchantId={product.merchant_id}
        editId={id}
        initial={{ ...blankProduct, ...(product as unknown as ProductFormValue) }}
        onSaved={goBack}
        onCancel={goBack}
      />
    </div>
  );
}
