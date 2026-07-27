import Razorpay from "razorpay";
import crypto from "crypto";
import {
  IPaymentGateway,
  IRazorpayGateway,
  ICreatePaymentIntentParams,
  IProcessPaymentParams,
  IRefundPaymentParams,
  IPaymentIntentResponse,
  IPaymentProcessResponse,
  IPaymentCaptureResponse,
  IRefundResponse,
  IPaymentVoidResponse,
  IPaymentStatusResponse,
  IPaymentDetailsResponse,
  INormalizedWebhookEvent,
  ICreateCustomerParams,
  ICustomerResponse,
  IAccountResponse,
  IBalanceResponse,
} from "../interfaces/seller/IPaymentGateway";
import {
  PaymentGatewayType,
  PaymentStatus,
  WebhookEventType,
} from "../enums/PaymentGatewayType";

export class RazorpayGateway implements IPaymentGateway, IRazorpayGateway {
  readonly gatewayType = PaymentGatewayType.RAZORPAY;
  private client: any;

  constructor() {
    this.client = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID!,
      key_secret: process.env.RAZORPAY_KEY_SECRET!,
    });
  }

  // ============================================================
  // COMMON INTERFACE METHODS
  // ============================================================

  async createPaymentIntent(
    params: ICreatePaymentIntentParams,
  ): Promise<IPaymentIntentResponse> {
    try {
      const order = await this.client.orders.create({
        amount: Math.round(params.amount * 100),
        currency: params.currency || "INR",
        receipt: params.idempotencyKey || `order_${Date.now()}`,
        notes: {
          ...params.metadata,
          accountId: params.accountId,
          customerId: params.customerId,
        },
      });

      return {
        paymentIntentId: order.id,
        transactionId: order.id,
        orderId: order.id,
        status: PaymentStatus.CREATED,
        amount: params.amount,
        currency: params.currency || "INR",
        gatewayResponse: order,
        paymentLink: this.generatePaymentLink(order.id),
      };
    } catch (error: any) {
      throw new Error(`Razorpay create order failed: ${error.message}`);
    }
  }

  async processPayment(
    params: IProcessPaymentParams,
  ): Promise<IPaymentProcessResponse> {
    try {
      const payment = await this.client.payments.capture(
        params.paymentIntentId,
        { amount: 0, currency: "INR" },
      );

      return {
        paymentIntentId: params.paymentIntentId,
        transactionId: payment.id,
        status: PaymentStatus.CAPTURED,
        amount: payment.amount / 100,
        currency: payment.currency,
        gatewayResponse: payment,
        paidAt: new Date(),
        source: "razorpay",
      };
    } catch (error: any) {
      throw new Error(`Razorpay process payment failed: ${error.message}`);
    }
  }

  async capturePayment(
    paymentIntentId: string,
  ): Promise<IPaymentCaptureResponse> {
    try {
      const payment = await this.client.payments.capture(paymentIntentId, {
        amount: 0,
        currency: "INR",
      });

      return {
        paymentIntentId,
        status: PaymentStatus.CAPTURED,
        capturedAmount: payment.amount / 100,
        gatewayResponse: payment,
      };
    } catch (error: any) {
      throw new Error(`Razorpay capture payment failed: ${error.message}`);
    }
  }

  async verifyWebhookSignature(
    payload: string,
    signature: string,
  ): Promise<boolean> {
    try {
      const expectedSignature = crypto
        .createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET!)
        .update(payload)
        .digest("hex");

      return expectedSignature === signature;
    } catch (error: any) {
      console.error("Razorpay webhook signature verification failed:", error);
      return false;
    }
  }

  async parseWebhookEvent(payload: any): Promise<INormalizedWebhookEvent> {
    try {
      const eventType = this.normalizeEventType(payload.event);
      const entity =
        payload.payload?.payment?.entity ||
        payload.payload?.order?.entity ||
        {};

      return {
        eventType,
        gatewayType: PaymentGatewayType.RAZORPAY,
        gatewayEventId: payload.id,
        paymentIntentId: entity.id,
        transactionId: entity.id,
        orderId: entity.order_id,
        amount: entity.amount ? entity.amount / 100 : 0,
        currency: entity.currency || "INR",
        status: this.normalizeStatus(entity.status),
        timestamp: new Date(payload.created_at * 1000),
        rawPayload: payload,
        normalizedPayload: {
          ...entity,
          status: this.normalizeStatus(entity.status),
          eventType,
        },
      };
    } catch (error: any) {
      throw new Error(`Razorpay parse webhook event failed: ${error.message}`);
    }
  }

  async getPaymentStatus(
    paymentIntentId: string,
  ): Promise<IPaymentStatusResponse> {
    try {
      const payment = await this.client.payments.fetch(paymentIntentId);

      return {
        paymentIntentId,
        status: this.normalizeStatus(payment.status),
        amount: payment.amount / 100,
        currency: payment.currency,
        gatewayResponse: payment,
      };
    } catch (error: any) {
      throw new Error(`Razorpay get payment status failed: ${error.message}`);
    }
  }

  // ============================================================
  // RAZORPAY-SPECIFIC EXTENDED METHODS
  // ============================================================

  async refundPayment(params: IRefundPaymentParams): Promise<IRefundResponse> {
    try {
      const refund = await this.client.payments.refund(params.paymentIntentId, {
        amount: params.amount ? Math.round(params.amount * 100) : undefined,
        notes: {
          reason: params.reason,
          ...params.metadata,
        },
      });

      return {
        refundId: refund.id,
        paymentIntentId: params.paymentIntentId,
        amount: params.amount || 0,
        status: PaymentStatus.REFUNDED,
        gatewayResponse: refund,
      };
    } catch (error: any) {
      throw new Error(`Razorpay refund payment failed: ${error.message}`);
    }
  }

  async voidPayment(paymentIntentId: string): Promise<IPaymentVoidResponse> {
    try {
      await this.client.payments.cancel(paymentIntentId);
      return {
        paymentIntentId,
        status: PaymentStatus.CANCELLED,
        gatewayResponse: {},
      };
    } catch (error: any) {
      throw new Error(`Razorpay void payment failed: ${error.message}`);
    }
  }

  async getPaymentDetails(
    paymentIntentId: string,
  ): Promise<IPaymentDetailsResponse> {
    try {
      const payment = await this.client.payments.fetch(paymentIntentId);

      return {
        paymentIntentId,
        transactionId: payment.id,
        amount: payment.amount / 100,
        currency: payment.currency,
        status: this.normalizeStatus(payment.status),
        paymentMethod: payment.method,
        gatewayResponse: payment,
        metadata: payment.notes || {},
      };
    } catch (error: any) {
      throw new Error(`Razorpay get payment details failed: ${error.message}`);
    }
  }

  async createCustomer(
    params: ICreateCustomerParams,
  ): Promise<ICustomerResponse> {
    try {
      const customer = await this.client.customers.create({
        name: params.name,
        email: params.email,
        contact: params.phone,
        notes: params.metadata,
      });

      return {
        customerId: customer.id,
        name: customer.name,
        email: customer.email,
        phone: customer.contact,
        gatewayResponse: customer,
      };
    } catch (error: any) {
      throw new Error(`Razorpay create customer failed: ${error.message}`);
    }
  }

  async getCustomer(customerId: string): Promise<ICustomerResponse> {
    try {
      const customer = await this.client.customers.fetch(customerId);

      return {
        customerId: customer.id,
        name: customer.name,
        email: customer.email,
        phone: customer.contact,
        gatewayResponse: customer,
      };
    } catch (error: any) {
      throw new Error(`Razorpay get customer failed: ${error.message}`);
    }
  }

  async getAccountDetails(accountId: string): Promise<IAccountResponse> {
    try {
      return {
        accountId,
        name: "",
        status: "active",
        gatewayResponse: {},
      };
    } catch (error: any) {
      throw new Error(`Razorpay get account details failed: ${error.message}`);
    }
  }

  async getBalance(accountId: string): Promise<IBalanceResponse> {
    try {
      const balance = await this.client.settlements.get();

      return {
        accountId,
        balance: 0,
        currency: "INR",
        gatewayResponse: balance,
      };
    } catch (error: any) {
      throw new Error(`Razorpay get balance failed: ${error.message}`);
    }
  }

  // ============================================================
  // HELPER METHODS
  // ============================================================

  private generatePaymentLink(orderId: string): string {
    const keyId = process.env.RAZORPAY_KEY_ID;
    return `https://api.razorpay.com/v1/checkout/${keyId}/${orderId}`;
  }

  private normalizeStatus(status: string): PaymentStatus {
    const statusMap: Record<string, PaymentStatus> = {
      created: PaymentStatus.CREATED,
      authorized: PaymentStatus.AUTHORIZED,
      captured: PaymentStatus.CAPTURED,
      refunded: PaymentStatus.REFUNDED,
      failed: PaymentStatus.FAILED,
      cancelled: PaymentStatus.CANCELLED,
      pending: PaymentStatus.PENDING,
    };
    return statusMap[status] || PaymentStatus.PROCESSING;
  }

  private normalizeEventType(event: string): WebhookEventType {
    const eventMap: Record<string, WebhookEventType> = {
      "payment.captured": WebhookEventType.PAYMENT_CAPTURED,
      "payment.authorized": WebhookEventType.PAYMENT_AUTHORIZED,
      "payment.failed": WebhookEventType.PAYMENT_FAILED,
      "payment.refunded": WebhookEventType.PAYMENT_REFUNDED,
      "payment.partially_refunded": WebhookEventType.PAYMENT_PARTIAL_REFUNDED,
    };
    return eventMap[event] || WebhookEventType.PAYMENT_CAPTURED;
  }
}
