// Unit tests for foreign-order pricing engine.
import { describe, it, expect } from "vitest";
import { calculateVariantPricing, applyRounding } from "./pricing";
import type { ForeignPricingSettings } from "./pricing";

const settings: ForeignPricingSettings = {
  defaultProfitPercent: 25,
  minimumProfitMnt: 10000,
  defaultCargoCostMnt: 15000,
  defaultLocalDeliveryCostMnt: 5000,
  defaultKoreaDomesticShippingKrw: 3000,
  paymentFeeReservePercent: 2,
  paymentFeeReserveFixedMnt: 0,
  riskBufferPercent: 3,
  riskBufferFixedMnt: 0,
  roundingRule: 1000,
  profitBase: "TOTAL_COST",
  exchangeRate: 2.5, // 1 KRW = 2.5 MNT
};

describe("applyRounding", () => {
  it("rounds to nearest step", () => {
    expect(applyRounding(12345, 1000)).toBe(12000);
    expect(applyRounding(12567, 1000)).toBe(13000);
    expect(applyRounding(12345, 500)).toBe(12500);
  });
});

describe("calculateVariantPricing", () => {
  it("computes full breakdown with TOTAL_COST profit base", () => {
    const result = calculateVariantPricing({ sourcePrice: 100000 }, settings);
    // source: 100000 * 2.5 = 250,000
    expect(result.sourcePriceMnt).toBe(250000);
    expect(result.koreaDomesticShippingMnt).toBe(7500); // 3000 * 2.5
    expect(result.cargoCostMnt).toBe(15000);
    expect(result.localDeliveryCostMnt).toBe(5000);
    expect(result.finalCustomerPriceMnt).toBeGreaterThan(result.baseCostMnt);
    expect(result.roundedCustomerPriceMnt % 1000).toBe(0);
  });

  it("enforces minimum profit", () => {
    const cheap = calculateVariantPricing(
      { sourcePrice: 1000 }, // 2500 MNT source price
      { ...settings, defaultProfitPercent: 1, minimumProfitMnt: 50000 },
    );
    expect(cheap.profitAmountMnt).toBe(50000);
  });

  it("SOURCE_ONLY profit base ignores costs in profit calc", () => {
    const r = calculateVariantPricing(
      { sourcePrice: 100000 },
      { ...settings, profitBase: "SOURCE_ONLY", minimumProfitMnt: 0 },
    );
    // profit = 250,000 * 0.25 = 62,500
    expect(r.profitAmountMnt).toBe(62500);
  });
});
