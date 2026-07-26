export enum PaymentGatewayType {
  ZEPTPAY = "zeptpay",
  RAZORPAY = "razorpay",
  STRIPE = "stripe",
  HDFC = "hdfc",
  SBI = "sbi",
  AXIS = "axis",
  ICICI = "icici",
  FLIXORA = "flixora",
}

export enum PaymentStatus {
  CREATED = "created",
  PROCESSING = "processing",
  AUTHORIZED = "authorized",
  CAPTURED = "captured",
  FAILED = "failed",
  CANCELLED = "cancelled",
  REFUNDED = "refunded",
  PENDING = "pending",
  COMPLETED = "completed",
  EXPIRED = "expired",
}

export enum TransactionType {
  PAYMENT = "payment",
  REFUND = "refund",
  PARTIAL_REFUND = "partial_refund",
  SETTLEMENT = "settlement",
  WALLET_CREDIT = "wallet_credit",
  WALLET_DEBIT = "wallet_debit",
  CHARGEBACK = "chargeback",
  REVERSAL = "reversal",
  ADJUSTMENT = "adjustment",
  COMMISSION = "commission",
  GST = "gst",
  FEES = "fees",
}

export enum WebhookEventType {
  PAYMENT_CAPTURED = "payment.captured",
  PAYMENT_AUTHORIZED = "payment.authorized",
  PAYMENT_FAILED = "payment.failed",
  PAYMENT_REFUNDED = "payment.refunded",
  PAYMENT_PARTIAL_REFUNDED = "payment.partial_refunded",
  PAYMENT_SETTLED = "payment.settled",
  PAYMENT_CHARGEBACK = "payment.chargeback",
  PAYMENT_REVERSED = "payment.reversed",
}
