
import { taobaoProvider } from "./src/lib/foreign-orders/providers/taobao.server";

async function test() {
  const url = "https://item.taobao.com/item.htm?id=726053303644"; 
  const productId = "726053303644";
  
  console.log("Testing Taobao provider for product ID:", productId);
  try {
    const result = await taobaoProvider.getProduct({ url, productId });
    console.log("Status:", result.status);
    console.log("Title:", result.title);
    console.log("Gallery count:", result.gallery.length);
    console.log("Variants count:", result.variants.length);
    console.log("Warnings:", result.warnings);
    console.log("Extraction Method:", result.extractionMethod);
    
    if (result.status === "MANUAL_REVIEW_REQUIRED") {
       console.log("Diagnostics:", JSON.stringify(result.diagnostics, null, 2));
    }
  } catch (e) {
    console.error("Test failed:", e);
  }
}

test();

