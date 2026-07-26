import {
  PaymentGatewayType,
  PaymentStatus,
  TransactionType,
  WebhookEventType,
} from "../../enums/PaymentGatewayType";

export interface RazorpayPaymentGateway {
  readonly gatewayType: PaymentGatewayType;

  // Core payment operations
  createPaymentIntent(
    params: CreatePaymentIntentParams,
  ): Promise<PaymentIntentResponse>;
  processPayment(params: ProcessPaymentParams): Promise<PaymentProcessResponse>;
  capturePayment(paymentIntentId: string): Promise<PaymentCaptureResponse>;
  refundPayment(params: RefundPaymentParams): Promise<RefundResponse>;
  voidPayment(paymentIntentId: string): Promise<PaymentVoidResponse>;

  // Query operations
  getPaymentStatus(paymentIntentId: string): Promise<PaymentStatusResponse>;
  getPaymentDetails(paymentIntentId: string): Promise<PaymentDetailsResponse>;

  // Webhook operations
  verifyWebhookSignature(payload: string, signature: string): Promise<boolean>;
  parseWebhookEvent(payload: any): Promise<NormalizedWebhookEvent>;

  // Customer operations
  createCustomer(params: CreateCustomerParams): Promise<CustomerResponse>;
  getCustomer(customerId: string): Promise<CustomerResponse>;

  // Account operations
  getAccountDetails(accountId: string): Promise<AccountResponse>;
  getBalance(accountId: string): Promise<BalanceResponse>;
}

export interface ZeptPayPaymentGateway {
  readonly gatewayType: PaymentGatewayType;

  // Core payment operations
  createPaymentIntent(
    params: CreatePaymentIntentParams,
  ): Promise<PaymentIntentResponse>;
  processPayment(params: ProcessPaymentParams): Promise<PaymentProcessResponse>;
  capturePayment(paymentIntentId: string): Promise<PaymentCaptureResponse>;

  // Webhook operations
  verifyWebhookSignature(payload: string, signature: string): Promise<boolean>;
  parseWebhookEvent(payload: any): Promise<NormalizedWebhookEvent>;

  // Customer operations
  createCustomer(params: CreateCustomerParams): Promise<CustomerResponse>;
}

// Parameter Types
export interface CreatePaymentIntentParams {
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

export interface ProcessPaymentParams {
  paymentIntentId: string;
  paymentMethod?: string;
  customerId?: string;
  metadata?: Record<string, any>;
}

export interface RefundPaymentParams {
  paymentIntentId: string;
  amount?: number;
  reason?: string;
  metadata?: Record<string, any>;
}

export interface CreateCustomerParams {
  name: string;
  email?: string;
  phone?: string;
  metadata?: Record<string, any>;
}

// Response Types
export interface PaymentIntentResponse {
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

export interface PaymentProcessResponse {
  paymentIntentId: string;
  transactionId: string;
  status: PaymentStatus;
  amount: number;
  currency: string;
  gatewayResponse: any;
  paidAt?: Date;
  source?: string;
}

export interface PaymentCaptureResponse {
  paymentIntentId: string;
  status: PaymentStatus;
  capturedAmount: number;
  gatewayResponse: any;
}

export interface RefundResponse {
  refundId: string;
  paymentIntentId: string;
  amount: number;
  status: PaymentStatus;
  gatewayResponse: any;
}

export interface PaymentVoidResponse {
  paymentIntentId: string;
  status: PaymentStatus;
  gatewayResponse: any;
}

export interface PaymentStatusResponse {
  paymentIntentId: string;
  status: PaymentStatus;
  amount: number;
  currency: string;
  gatewayResponse: any;
}

export interface PaymentDetailsResponse {
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

export interface NormalizedWebhookEvent {
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

export interface CustomerResponse {
  customerId: string;
  name: string;
  email?: string;
  phone?: string;
  gatewayResponse: any;
}

export interface AccountResponse {
  accountId: string;
  name: string;
  email?: string;
  status: string;
  gatewayResponse: any;
}

export interface BalanceResponse {
  accountId: string;
  balance: number;
  currency: string;
  gatewayResponse: any;
}
