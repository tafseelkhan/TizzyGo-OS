import QRCode from "qrcode";

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
  return `ORDTOKEN-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
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

export async function generateQrCodeUrl(
  orderId: string,
  buyerId: string,
  sellerId: string,
): Promise<string> {
  try {
    const qrData = JSON.stringify({
      orderId,
      buyerId,
      sellerId,
      timestamp: Date.now(),
      type: "SHIPPING_LABEL",
    });

    // Generate QR code as data URL
    const qrCodeDataUrl = await QRCode.toDataURL(qrData, {
      errorCorrectionLevel: "H",
      margin: 2,
      width: 300,
    });

    return qrCodeDataUrl;
  } catch (error) {
    console.error("QR Code generation failed:", error);
    return ""; // Return empty string if QR generation fails
  }
}
