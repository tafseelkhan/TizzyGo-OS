import {
  PaymentGatewayType,
  PaymentStatus,
  WebhookEventType,
} from "../../enums/PaymentGatewayType";

// ============================================================
// COMMON BASE INTERFACE - ALL GATEWAYS MUST IMPLEMENT THIS
// ============================================================

export interface IPaymentGateway {
  readonly gatewayType: PaymentGatewayType;

  // Core payment operations
  createPaymentIntent(
    params: ICreatePaymentIntentParams,
  ): Promise<IPaymentIntentResponse>;

  processPayment(
    params: IProcessPaymentParams,
  ): Promise<IPaymentProcessResponse>;

  capturePayment(paymentIntentId: string): Promise<IPaymentCaptureResponse>;

  // Webhook operations
  verifyWebhookSignature(payload: string, signature: string): Promise<boolean>;

  parseWebhookEvent(payload: any): Promise<INormalizedWebhookEvent>;

  // Query operations
  getPaymentStatus(paymentIntentId: string): Promise<IPaymentStatusResponse>;
}

// ============================================================
// COMMON PARAMETER TYPES
// ============================================================

export interface ICreatePaymentIntentParams {
  amount: number;
  currency: string;
  accountId: string;
  customerId?: string;
  customerName?: string;
  customerEmail?: string;
  description?: string;
  metadata?: Record<string, any>;
  timeout?: number;
  idempotencyKey?: string;
}

export interface IProcessPaymentParams {
  paymentIntentId: string;
  paymentMethod?: string;
  customerId?: string;
  metadata?: Record<string, any>;
}

// ============================================================
// COMMON RESPONSE TYPES
// ============================================================

export interface IPaymentIntentResponse {
  paymentIntentId: string;
  transactionId?: string;
  orderId?: string;
  status: PaymentStatus;
  amount: number;
  currency: string;
  gatewayResponse: any;
  paymentLink?: string;
  qrCodeId?: string;
}

export interface IPaymentProcessResponse {
  paymentIntentId: string;
  transactionId: string;
  status: PaymentStatus;
  amount: number;
  currency: string;
  gatewayResponse: any;
  paidAt?: Date;
  source?: string;
}

export interface IPaymentCaptureResponse {
  paymentIntentId: string;
  status: PaymentStatus;
  capturedAmount: number;
  gatewayResponse: any;
}

export interface IPaymentStatusResponse {
  paymentIntentId: string;
  status: PaymentStatus;
  amount: number;
  currency: string;
  gatewayResponse: any;
}

export interface INormalizedWebhookEvent {
  eventType: WebhookEventType;
  gatewayType: PaymentGatewayType;
  gatewayEventId: string;
  paymentIntentId: string;
  transactionId?: string;
  orderId?: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  timestamp: Date;
  rawPayload: any;
  normalizedPayload: any;
}

// ============================================================
// EXTENDED INTERFACES FOR GATEWAY-SPECIFIC FEATURES
// ============================================================

// Razorpay-specific interface
export interface IRazorpayGateway extends IPaymentGateway {
  // Razorpay-specific operations
  refundPayment(params: IRefundPaymentParams): Promise<IRefundResponse>;
  voidPayment(paymentIntentId: string): Promise<IPaymentVoidResponse>;
  getPaymentDetails(paymentIntentId: string): Promise<IPaymentDetailsResponse>;
  createCustomer(params: ICreateCustomerParams): Promise<ICustomerResponse>;
  getCustomer(customerId: string): Promise<ICustomerResponse>;
  getAccountDetails(accountId: string): Promise<IAccountResponse>;
  getBalance(accountId: string): Promise<IBalanceResponse>;
}

// ZeptPay-specific interface
export interface IZeptPayGateway extends IPaymentGateway {
  // ZeptPay-specific operations if any
  // Currently, ZeptPay only supports the base interface
}

// Future Stripe-specific interface
export interface IStripeGateway extends IPaymentGateway {
  createSetupIntent(params: any): Promise<any>;
  createPaymentMethod(params: any): Promise<any>;
  createSubscription(params: any): Promise<any>;
}

// ============================================================
// EXTENDED PARAMETER TYPES
// ============================================================

export interface IRefundPaymentParams {
  paymentIntentId: string;
  amount?: number;
  reason?: string;
  metadata?: Record<string, any>;
}

export interface ICreateCustomerParams {
  name: string;
  email?: string;
  phone?: string;
  metadata?: Record<string, any>;
}

// ============================================================
// EXTENDED RESPONSE TYPES
// ============================================================

export interface IRefundResponse {
  refundId: string;
  paymentIntentId: string;
  amount: number;
  status: PaymentStatus;
  gatewayResponse: any;
}

export interface IPaymentVoidResponse {
  paymentIntentId: string;
  status: PaymentStatus;
  gatewayResponse: any;
}

export interface IPaymentDetailsResponse {
  paymentIntentId: string;
  transactionId: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  customerName?: string;
  customerEmail?: string;
  paymentMethod?: string;
  gatewayResponse: any;
  metadata: Record<string, any>;
}

export interface ICustomerResponse {
  customerId: string;
  name: string;
  email?: string;
  phone?: string;
  gatewayResponse: any;
}

export interface IAccountResponse {
  accountId: string;
  name: string;
  email?: string;
  status: string;
  gatewayResponse: any;
}

export interface IBalanceResponse {
  accountId: string;
  balance: number;
  currency: string;
  gatewayResponse: any;
}
