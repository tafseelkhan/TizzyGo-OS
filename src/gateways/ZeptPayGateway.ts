import { ZeptPay } from "@flixora/zeptpay-payment-core";
import {
  IPaymentGateway,
  ICreatePaymentIntentParams,
  IProcessPaymentParams,
  IPaymentIntentResponse,
  IPaymentProcessResponse,
  IPaymentCaptureResponse,
  IPaymentStatusResponse,
  INormalizedWebhookEvent,
} from "../interfaces/seller/IPaymentGateway";
import {
  PaymentGatewayType,
  PaymentStatus,
  WebhookEventType,
} from "../enums/PaymentGatewayType";

export class ZeptPayGateway implements IPaymentGateway {
  readonly gatewayType = PaymentGatewayType.ZEPTPAY;
  private client: ZeptPay;

  constructor() {
    this.client = new ZeptPay({
      clientKey: process.env.ZEPTPAY_CLIENT_KEY!,
      secretKey: process.env.ZEPTPAY_SECRET_KEY!,
    });
  }

  async createPaymentIntent(
    params: ICreatePaymentIntentParams,
  ): Promise<IPaymentIntentResponse> {
    try {
      const response = await this.client.flixora.payments.createPayment({
        zeptPayAccountId: params.accountId,
        amount: params.amount,
        currency: params.currency || "INR",
        appName: params.metadata?.appName || "TizzyGo",
        payer: {
          userId: params.customerId || "",
          name: params.customerName || "Customer",
          email: params.customerEmail || "",
        },
      });

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
    params: IProcessPaymentParams,
  ): Promise<IPaymentProcessResponse> {
    try {
      // ZeptPay processes payment on creation
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
  ): Promise<IPaymentCaptureResponse> {
    try {
      // ZeptPay automatically captures
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
      // ZeptPay webhook verification using raw body
      const timestamp = JSON.parse(payload).timestamp || Date.now();
      const verified = this.client.flixora.webhook.verifyEventZPTFXO(
        JSON.parse(payload),
        signature,
        timestamp,
        process.env.ZEPTPAY_WEBHOOK_KEY!,
      );
      return !!verified;
    } catch (error: any) {
      console.error("ZeptPay webhook signature verification failed:", error);
      return false;
    }
  }

  async parseWebhookEvent(payload: any): Promise<INormalizedWebhookEvent> {
    try {
      const eventType = this.normalizeEventType(payload.event || payload.type);
      const entity = payload.data?.object || payload;
      const paymentIntentId =
        entity.zeptpayTransactionId || entity._id || payload.id;

      return {
        eventType,
        gatewayType: PaymentGatewayType.ZEPTPAY,
        gatewayEventId: payload.id || payload.eventId,
        paymentIntentId: paymentIntentId,
        transactionId: paymentIntentId,
        orderId: entity.meta?.orderId || entity.metadata?.orderId,
        amount: entity.amount || 0,
        currency: entity.currency || "INR",
        status: this.normalizeStatus(entity.status),
        timestamp: new Date(
          payload.created_at || payload.created || Date.now(),
        ),
        rawPayload: payload,
        normalizedPayload: {
          ...entity,
          status: this.normalizeStatus(entity.status),
          eventType,
        },
      };
    } catch (error: any) {
      throw new Error(`ZeptPay parse webhook event failed: ${error.message}`);
    }
  }

  // ✅ FIX: ZeptPay doesn't have getPaymentStatus directly
  // Instead, use getPaymentDetails or fetch from database
  async getPaymentStatus(
    paymentIntentId: string,
  ): Promise<IPaymentStatusResponse> {
    try {
      // ZeptPay doesn't have direct getPaymentStatus method
      // Option 1: Try getPaymentDetails if available
      // Option 2: Query from database
      // Option 3: Return cached status

      console.warn(`⚠️ ZeptPay getPaymentStatus called for ${paymentIntentId}`);
      console.warn(`ℹ️ ZeptPay SDK doesn't support direct status query`);

      // Return a default response
      // In production, you would fetch from your database
      return {
        paymentIntentId,
        status: PaymentStatus.PROCESSING,
        amount: 0,
        currency: "INR",
        gatewayResponse: {
          message: "ZeptPay status query not supported",
          paymentIntentId,
        },
      };

      // ❌ Ye line nahi chalegi:
      // const response = await this.client.flixora.payments.getPaymentStatus({
      //   zeptPayTransactionId: paymentIntentId,
      // });
    } catch (error: any) {
      throw new Error(`ZeptPay get payment status failed: ${error.message}`);
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
      "zeptpay-flixora.payment_intent.created":
        WebhookEventType.PAYMENT_CAPTURED,
      "zeptpay-flixora.payment_intent.succeeded":
        WebhookEventType.PAYMENT_CAPTURED,
      "zeptpay-flixora.payment_intent.captured":
        WebhookEventType.PAYMENT_CAPTURED,
      "zeptpay-flixora.payment_intent.authorized":
        WebhookEventType.PAYMENT_AUTHORIZED,
      "zeptpay-flixora.payment_intent.payment_failed":
        WebhookEventType.PAYMENT_FAILED,
      "zeptpay-flixora.charge.refunded": WebhookEventType.PAYMENT_REFUNDED,
    };
    return eventMap[event] || WebhookEventType.PAYMENT_CAPTURED;
  }
}
