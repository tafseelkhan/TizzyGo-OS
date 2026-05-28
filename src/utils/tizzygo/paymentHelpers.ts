export function generateCheckoutSessionId(): string {
  return `CHK-${Date.now()}-${Math.random()
    .toString(36)
    .substring(2, 10)
    .toUpperCase()}`;
}

export function generateOrderId(): string {
  const p1 = Math.random().toString(36).substring(2, 10).toUpperCase();
  const p2 = Math.random().toString(36).substring(2, 5).toUpperCase();
  const p3 = Math.random().toString(36).substring(2, 11).toUpperCase();
  return `ORD-${p1}-${p2}-${p3}`;
}

export function generateToken(): string {
  return `ORDTOKEN-${Date.now()}`;
}

export function getProductId(cartItem: any, productData: any): string | null {
  return (
    productData?._id ||
    productData?.productId ||
    productData?.id ||
    productData?.sku ||
    productData?.code ||
    cartItem?.productId ||
    cartItem?._id ||
    null
  );
}

export function getFinalAmount(calculated: any): number {
  return (
    Number(calculated?.totalFinalPrice) ||
    Number(calculated?.finalAmount) ||
    Number(calculated?.finalPrice) ||
    0
  );
}

export const createCartSnapshot = (
  cartItem: any,
  calculatedData: any,
  finalAmount: number,
) => {
  const productData = cartItem?.productData || {};
  const selectedVariant = cartItem?.selectedVariant || {};

  return {
    items: [
      {
        productId: getProductId(cartItem, productData),
        quantity: Number(cartItem?.quantity || 1),
        selectedVariant,
        productData,
      },
    ],
    calculatedData: {
      totalBeforeCoupon:
        Number(calculatedData?.totalBeforeCoupon) ||
        Number(calculatedData?.finalPrice) ||
        finalAmount,
      discountApplied: Number(calculatedData?.discountApplied) || 0,
      deliveryCharge: Number(calculatedData?.deliveryCharge) || 0,
      productGst: Number(calculatedData?.productGst) || 0,
      productGstRate: Number(calculatedData?.productGstRate) || 0,
      platformFee: Number(calculatedData?.platformFee) || 0,
      finalAmount,
      distanceKm: Number(calculatedData?.distanceKm) || 0,
      couponUsed: calculatedData?.couponUsed || null,
      couponData: calculatedData?.couponData || null,
      coFundApplied: calculatedData?.coFundApplied || false,
      fundSplit: calculatedData?.fundSplit || { bank: 0, merchant: 0 },
    },
  };
};
