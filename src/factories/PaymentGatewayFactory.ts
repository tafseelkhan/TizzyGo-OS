import { RazorpayPaymentGateway } from "../interfaces/seller/PaymentGateway";
import { PaymentGatewayType } from "../enums/PaymentGatewayType";
import { ZeptPayGateway } from "../gateways/ZeptPayGateway";
import { RazorpayGateway } from "../gateways/RazorpayGateway";

export class PaymentGatewayFactory {
  private static gateways: Map<PaymentGatewayType, RazorpayPaymentGateway | ZeptPayGateway> = new Map();
  private static activeGatewayType: PaymentGatewayType;

  static initialize(): void {
    // Register all gateways
    this.gateways.set(PaymentGatewayType.ZEPTPAY, new ZeptPayGateway());
    this.gateways.set(PaymentGatewayType.RAZORPAY, new RazorpayGateway());

    // Set active gateway from environment
    const gatewayEnv = process.env.PAYMENT_GATEWAY || "zeptpay";
    this.activeGatewayType = gatewayEnv as PaymentGatewayType;

    // Validate gateway is registered
    if (!this.gateways.has(this.activeGatewayType)) {
      throw new Error(`Payment gateway "${gatewayEnv}" is not registered`);
    }

    console.log(`✅ Payment gateway initialized: ${this.activeGatewayType}`);
  }

  static getGateway(): RazorpayPaymentGateway | ZeptPayGateway {
    const gateway = this.gateways.get(this.activeGatewayType);
    if (!gateway) {
      throw new Error(`Gateway "${this.activeGatewayType}" not found`);
    }
    return gateway;
  }

  static getGatewayByType(type: PaymentGatewayType): RazorpayPaymentGateway | ZeptPayGateway {
    const gateway = this.gateways.get(type);
    if (!gateway) {
      throw new Error(`Gateway "${type}" not found`);
    }
    return gateway;
  }

  static setActiveGateway(type: PaymentGatewayType): void {
    if (!this.gateways.has(type)) {
      throw new Error(`Gateway "${type}" is not registered`);
    }
    this.activeGatewayType = type;
    console.log(`🔄 Payment gateway switched to: ${type}`);
  }

  static getActiveGatewayType(): PaymentGatewayType {
    return this.activeGatewayType;
  }

  static getRegisteredGateways(): PaymentGatewayType[] {
    return Array.from(this.gateways.keys());
  }

  static isGatewayRegistered(type: PaymentGatewayType): boolean {
    return this.gateways.has(type);
  }
}

// Auto-initialize on import
PaymentGatewayFactory.initialize();
