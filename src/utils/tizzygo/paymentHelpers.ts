import QRCode from "qrcode";
import jwt from "jsonwebtoken";

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

// ✅ NEW FUNCTION: Generate shipping token only
export function generateShippingToken(
  orderId: string,
  buyerId: string,
  sellerId: string,
): string {
  return jwt.sign(
    {
      orderId,
      buyerId,
      sellerId,
    },
    process.env.QR_SECRET as string,
    // No expiry added as requested
  );
}

// ✅ MODIFIED FUNCTION: Returns QR data URL but also provides token separately
export async function generateQrCodeDataUrl(
  orderId: string,
  buyerId: string,
  sellerId: string,
): Promise<{ qrCodeUrl: string; token: string }> {
  try {
    const token = generateShippingToken(orderId, buyerId, sellerId);

    const qrCodeDataUrl = await QRCode.toDataURL(JSON.stringify({ token }), {
      errorCorrectionLevel: "H",
      margin: 2,
      width: 300,
    });

    return { qrCodeUrl: qrCodeDataUrl, token };
  } catch (error) {
    console.error("QR Code generation failed:", error);
    return { qrCodeUrl: "", token: "" };
  }
}
