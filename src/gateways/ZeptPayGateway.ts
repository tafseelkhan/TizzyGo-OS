import { ZeptPay } from "@flixora/zeptpay-payment-core";
import {
  ZeptPayPaymentGateway,
  CreatePaymentIntentParams,
  ProcessPaymentParams,
  RefundPaymentParams,
  PaymentIntentResponse,
  PaymentProcessResponse,
  PaymentCaptureResponse,
  RefundResponse,
  PaymentVoidResponse,
  PaymentStatusResponse,
  PaymentDetailsResponse,
  NormalizedWebhookEvent,
  CreateCustomerParams,
  CustomerResponse,
  AccountResponse,
  BalanceResponse,
} from "../interfaces/seller/PaymentGateway";
import {
  PaymentGatewayType,
  PaymentStatus,
  WebhookEventType,
} from "../enums/PaymentGatewayType";

export class ZeptPayGateway implements ZeptPayPaymentGateway {
  readonly gatewayType = PaymentGatewayType.ZEPTPAY;
  private client: ZeptPay;

  constructor() {
    this.client = new ZeptPay({
      clientKey: process.env.ZEPTPAY_CLIENT_KEY!,
      secretKey: process.env.ZEPTPAY_SECRET_KEY!,
    });
  }

  async createPaymentIntent(
    params: CreatePaymentIntentParams,
  ): Promise<PaymentIntentResponse> {
    try {
      const createPaymentRequest: any = {
        zeptPayAccountId: params.accountId,
        amount: params.amount,
        currency: params.currency || "INR",
        appName: params.metadata?.appName || "TizzyGo",
        payer: {
          userId: params.customerId || "",
          name: params.customerName || "Customer",
          email: params.customerEmail || "",
        },
        meta: {
          ...params.metadata,
          idempotencyKey: params.idempotencyKey,
        },
      };

      const response =
        await this.client.flixora.payments.createPayment(createPaymentRequest);

      return {
        paymentIntentId: response.zeptpayTransactionId || response._id,
        transactionId: response.zeptpayTransactionId || response._id,
        status: this.normalizeStatus(response.status),
        amount: params.amount,
        currency: params.currency || "INR",
        gatewayResponse: response,
      };
    } catch (error: any) {
      throw new Error(`ZeptPay create payment intent failed: ${error.message}`);
    }
  }

  async processPayment(
    params: ProcessPaymentParams,
  ): Promise<PaymentProcessResponse> {
    try {
      // ZeptPay processes payment on creation, no separate process call needed
      // This is a no-op for ZeptPay as payment is already processed
      return {
        paymentIntentId: params.paymentIntentId,
        transactionId: params.paymentIntentId,
        status: PaymentStatus.PROCESSING,
        amount: 0,
        currency: "INR",
        gatewayResponse: {},
      };
    } catch (error: any) {
      throw new Error(`ZeptPay process payment failed: ${error.message}`);
    }
  }

  async capturePayment(
    paymentIntentId: string,
  ): Promise<PaymentCaptureResponse> {
    try {
      // ZeptPay automatically captures, implement if needed
      return {
        paymentIntentId,
        status: PaymentStatus.CAPTURED,
        capturedAmount: 0,
        gatewayResponse: {},
      };
    } catch (error: any) {
      throw new Error(`ZeptPay capture payment failed: ${error.message}`);
    }
  }

  async verifyWebhookSignature(
    payload: string,
    signature: string,
  ): Promise<boolean> {
    try {
      // ZeptPay webhook verification
      return true; // Implement actual verification if needed
    } catch (error: any) {
      console.error("ZeptPay webhook signature verification failed:", error);
      return false;
    }
  }

  async parseWebhookEvent(payload: any): Promise<NormalizedWebhookEvent> {
    try {
      const eventType = this.normalizeEventType(payload.event || payload.type);
      const paymentIntentId = payload.zeptpayTransactionId || payload._id;

      return {
        eventType,
        gatewayType: PaymentGatewayType.ZEPTPAY,
        gatewayEventId: payload._id || payload.eventId,
        paymentIntentId: paymentIntentId,
        transactionId: paymentIntentId,
        orderId: payload.meta?.orderId,
        amount: payload.amount || 0,
        currency: payload.currency || "INR",
        status: this.normalizeStatus(payload.status),
        timestamp: new Date(
          payload.timestamp || payload.createdAt || Date.now(),
        ),
        rawPayload: payload,
        normalizedPayload: {
          ...payload,
          status: this.normalizeStatus(payload.status),
          eventType,
        },
      };
    } catch (error: any) {
      throw new Error(`ZeptPay parse webhook event failed: ${error.message}`);
    }
  }

  async createCustomer(
    params: CreateCustomerParams,
  ): Promise<CustomerResponse> {
    try {
      // ZeptPay doesn't have explicit customer creation
      return {
        customerId: params.email || params.name,
        name: params.name,
        email: params.email,
        phone: params.phone,
        gatewayResponse: {},
      };
    } catch (error: any) {
      throw new Error(`ZeptPay create customer failed: ${error.message}`);
    }
  }

  async getCustomer(customerId: string): Promise<CustomerResponse> {
    try {
      // ZeptPay doesn't support customer retrieval
      return {
        customerId,
        name: "",
        gatewayResponse: {},
      };
    } catch (error: any) {
      throw new Error(`ZeptPay get customer failed: ${error.message}`);
    }
  }

  async getAccountDetails(accountId: string): Promise<AccountResponse> {
    try {
      // ZeptPay account details
      return {
        accountId,
        name: "",
        status: "active",
        gatewayResponse: {},
      };
    } catch (error: any) {
      throw new Error(`ZeptPay get account details failed: ${error.message}`);
    }
  }

  // Helper methods
  private normalizeStatus(status: string): PaymentStatus {
    const statusMap: Record<string, PaymentStatus> = {
      success: PaymentStatus.CAPTURED,
      succeeded: PaymentStatus.CAPTURED,
      captured: PaymentStatus.CAPTURED,
      authorized: PaymentStatus.AUTHORIZED,
      failed: PaymentStatus.FAILED,
      failure: PaymentStatus.FAILED,
      cancelled: PaymentStatus.CANCELLED,
      canceled: PaymentStatus.CANCELLED,
      created: PaymentStatus.CREATED,
      processing: PaymentStatus.PROCESSING,
      pending: PaymentStatus.PENDING,
      refunded: PaymentStatus.REFUNDED,
    };
    return statusMap[status?.toLowerCase()] || PaymentStatus.PROCESSING;
  }

  private normalizeEventType(event: string): WebhookEventType {
    const eventMap: Record<string, WebhookEventType> = {
      "payment.created": WebhookEventType.PAYMENT_CAPTURED,
      "payment.succeeded": WebhookEventType.PAYMENT_CAPTURED,
      "payment.captured": WebhookEventType.PAYMENT_CAPTURED,
      "payment.authorized": WebhookEventType.PAYMENT_AUTHORIZED,
      "payment.failed": WebhookEventType.PAYMENT_FAILED,
      "payment.refunded": WebhookEventType.PAYMENT_REFUNDED,
    };
    return eventMap[event] || WebhookEventType.PAYMENT_CAPTURED;
  }
}
