export type PaymentStatus =
  | "created"
  | "processing"
  | "authorized"
  | "captured"
  | "failed"
  | "cancelled"
  | "refunded";

export function normalizePaymentIntentId(response: any): string | null {
  const paymentId =
    response?.zeptpayTransactionId ||
    response?.paymentIntentId ||
    response?.transactionId ||
    response?.id ||
    response?.txnId ||
    null;

  if (!paymentId) {
    console.error(
      "❌ FAILED TO EXTRACT PAYMENT ID:",
      JSON.stringify(response, null, 2),
    );
  }

  return paymentId;
}

export function getPaymentStatus(response: any): PaymentStatus {
  const status = String(response?.status || "").toLowerCase();

  if (status === "success" || status === "succeeded" || status === "captured") {
    return "captured";
  }
  if (status === "authorized") return "authorized";
  if (status === "failed" || status === "failure") return "failed";
  if (status === "cancelled" || status === "canceled") return "cancelled";
  if (status === "created") return "created";

  return "processing";
}

export function createPaymentAttempt(
  paymentIntentId: string | null,
  method: string,
  status: PaymentStatus,
  rawResponse: any,
) {
  return {
    paymentIntentId,
    method,
    status,
    rawResponse,
    createdAt: new Date(),
  };
}

export const extractPaymentAmount = (calculatedData: any): number => {
  return Number(
    calculatedData?.grandTotal ||
      calculatedData?.totalBeforeCoupon ||
      calculatedData?.subtotal ||
      calculatedData?.finalAmount ||
      0,
  );
};

export const validatePaymentRequest = (
  userId: string | undefined,
  checkoutSessionId: string,
  paymentType: string,
): string | null => {
  if (!userId) return "Unauthorized";
  if (!checkoutSessionId) return "checkoutSessionId required";

  const allowedPaymentTypes = ["normal", "qr", "autopay"];
  if (!allowedPaymentTypes.includes(paymentType)) {
    return "Invalid payment type";
  }

  return null;
};
