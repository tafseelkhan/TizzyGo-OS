import { IPaymentGateway } from "../interfaces/seller/IPaymentGateway";
import { PaymentGatewayType } from "../enums/PaymentGatewayType";
import { ZeptPayGateway } from "../gateways/ZeptPayGateway";
import { RazorpayGateway } from "../gateways/RazorpayGateway";

export class PaymentGatewayFactory {
  private static gateways: Map<PaymentGatewayType, IPaymentGateway> = new Map();
  private static activeGatewayType: PaymentGatewayType;

  static initialize(): void {
    // Register all gateways
    this.gateways.set(
      PaymentGatewayType.ZEPTPAY,
      new ZeptPayGateway() as unknown as IPaymentGateway,
    );
    this.gateways.set(PaymentGatewayType.RAZORPAY, new RazorpayGateway());

    // Set active gateway from environment
    const gatewayEnv = process.env.PAYMENT_GATEWAY || "zeptpay";
    this.activeGatewayType = gatewayEnv as PaymentGatewayType;

    // Validate gateway is registered
    if (!this.gateways.has(this.activeGatewayType)) {
      throw new Error(`Payment gateway "${gatewayEnv}" is not registered`);
    }

  }

  // CRITICAL: Returns COMMON interface, not union type
  static getGateway(): IPaymentGateway {
    const gateway = this.gateways.get(this.activeGatewayType);
    if (!gateway) {
      throw new Error(`Gateway "${this.activeGatewayType}" not found`);
    }
    return gateway;
  }

  // Use this ONLY when you need gateway-specific features
  static getGatewayByType<T extends IPaymentGateway>(
    type: PaymentGatewayType,
  ): T {
    const gateway = this.gateways.get(type);
    if (!gateway) {
      throw new Error(`Gateway "${type}" not found`);
    }
    return gateway as T;
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
