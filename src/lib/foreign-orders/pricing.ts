// Foreign-order pricing engine — isomorphic (no server-only deps).
// Used by both merchant importer UI (preview) and server-side persist.

export type ProfitBase = "SOURCE_ONLY" | "TOTAL_COST";

export type ForeignPricingSettings = {
  defaultProfitPercent: number;
  minimumProfitMnt: number;
  defaultCargoCostMnt: number;
  defaultLocalDeliveryCostMnt: number;
  defaultKoreaDomesticShippingKrw?: number;
  defaultKoreaDomesticShippingMnt?: number;
  paymentFeeReservePercent: number;
  paymentFeeReserveFixedMnt: number;
  riskBufferPercent: number;
  riskBufferFixedMnt: number;
  roundingRule: number; // nearest N MNT (100/500/1000/5000)
  profitBase: ProfitBase;
  exchangeRate: number; // KRW -> MNT
};

export type VariantPricingInput = {
  sourcePrice: number; // in source currency (KRW)
  sourceCurrency?: string;
  // optional overrides (per variant)
  cargoCostMnt?: number;
  localDeliveryCostMnt?: number;
  koreaDomesticShippingMnt?: number;
  profitPercent?: number;
  minimumProfitMnt?: number;
};

export type VariantPricingResult = {
  sourcePrice: number;
  sourceCurrency: string;
  exchangeRate: number;
  sourcePriceMnt: number;
  koreaDomesticShippingMnt: number;
  cargoCostMnt: number;
  localDeliveryCostMnt: number;
  paymentFeeReserveMnt: number;
  riskBufferMnt: number;
  profitPercent: number;
  minimumProfitMnt: number;
  profitAmountMnt: number;
  finalCustomerPriceMnt: number;
  roundedCustomerPriceMnt: number;
  baseCostMnt: number;
};

export function applyRounding(value: number, step: number): number {
  if (!step || step <= 0) return Math.round(value);
  return Math.round(value / step) * step;
}

export function calculateVariantPricing(
  input: VariantPricingInput,
  settings: ForeignPricingSettings,
): VariantPricingResult {
  const exchangeRate = settings.exchangeRate || 0;
  const sourcePrice = input.sourcePrice || 0;
  const sourcePriceMnt = sourcePrice * exchangeRate;

  const koreaDomesticShippingMnt =
    input.koreaDomesticShippingMnt ??
    (settings.defaultKoreaDomesticShippingMnt ||
      (settings.defaultKoreaDomesticShippingKrw || 0) * exchangeRate);
  const cargoCostMnt = input.cargoCostMnt ?? settings.defaultCargoCostMnt;
  const localDeliveryCostMnt = input.localDeliveryCostMnt ?? settings.defaultLocalDeliveryCostMnt;

  const preFeeBase =
    sourcePriceMnt + koreaDomesticShippingMnt + cargoCostMnt + localDeliveryCostMnt;

  const paymentFeeReserveMnt =
    settings.paymentFeeReserveFixedMnt +
    (preFeeBase * (settings.paymentFeeReservePercent || 0)) / 100;
  const riskBufferMnt =
    settings.riskBufferFixedMnt + (preFeeBase * (settings.riskBufferPercent || 0)) / 100;

  const baseCostMnt = preFeeBase + paymentFeeReserveMnt + riskBufferMnt;

  const profitPercent = input.profitPercent ?? settings.defaultProfitPercent;
  const minimumProfitMnt = input.minimumProfitMnt ?? settings.minimumProfitMnt;
  const profitBaseValue = settings.profitBase === "SOURCE_ONLY" ? sourcePriceMnt : baseCostMnt;
  const calcProfit = (profitBaseValue * profitPercent) / 100;
  const profitAmountMnt = Math.max(calcProfit, minimumProfitMnt);

  const finalCustomerPriceMnt = baseCostMnt + profitAmountMnt;
  const roundedCustomerPriceMnt = applyRounding(finalCustomerPriceMnt, settings.roundingRule);

  return {
    sourcePrice,
    sourceCurrency: input.sourceCurrency ?? "KRW",
    exchangeRate,
    sourcePriceMnt: round2(sourcePriceMnt),
    koreaDomesticShippingMnt: round2(koreaDomesticShippingMnt),
    cargoCostMnt: round2(cargoCostMnt),
    localDeliveryCostMnt: round2(localDeliveryCostMnt),
    paymentFeeReserveMnt: round2(paymentFeeReserveMnt),
    riskBufferMnt: round2(riskBufferMnt),
    profitPercent,
    minimumProfitMnt,
    profitAmountMnt: round2(profitAmountMnt),
    finalCustomerPriceMnt: round2(finalCustomerPriceMnt),
    roundedCustomerPriceMnt: roundedCustomerPriceMnt,
    baseCostMnt: round2(baseCostMnt),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export const DEFAULT_POIZON_KR_SETTINGS: Partial<ForeignPricingSettings> = {
  defaultProfitPercent: 25,
  minimumProfitMnt: 0,
  defaultCargoCostMnt: 0,
  defaultLocalDeliveryCostMnt: 0,
  defaultKoreaDomesticShippingKrw: 0,
  paymentFeeReservePercent: 0,
  paymentFeeReserveFixedMnt: 0,
  riskBufferPercent: 0,
  riskBufferFixedMnt: 0,
  roundingRule: 1000,
  profitBase: "TOTAL_COST",
};
