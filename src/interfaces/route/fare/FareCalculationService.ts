import {
  IFareComponents,
  IFareParams,
  IFareConfig,
} from "../../IFareCalculation";

export class FareCalculationService {
  private readonly config: IFareConfig;

  constructor() {
    this.config = {
      platformFees: parseFloat(process.env.PLATFORM_FEES || "10"),
      serviceFare: parseFloat(process.env.SERVICE_FARE || "5"),
      gstPercentage: parseFloat(process.env.GST_PERCENTAGE || "18"),
      perKmRate: parseFloat(process.env.PER_KM_RATE || "15"),
      perMinuteRate: parseFloat(process.env.PER_MINUTE_RATE || "2"),
    };
  }

  calculateFare(params: IFareParams): IFareComponents {
    const {
      vehicle,
      roadDistanceKm,
      trafficDurationMinutes,
      platformFees = this.config.platformFees,
      serviceFare = this.config.serviceFare,
      gstPercentage = this.config.gstPercentage,
      perKmRate = this.config.perKmRate,
      perMinuteRate = this.config.perMinuteRate,
    } = params;

    const baseFare = vehicle.baseFare;
    const classFare = vehicle.classFare;
    const distanceFare = roadDistanceKm * perKmRate;
    const timeFare = trafficDurationMinutes * perMinuteRate;

    const subTotal =
      baseFare +
      classFare +
      distanceFare +
      timeFare +
      platformFees +
      serviceFare;
    const gstFare = subTotal * (gstPercentage / 100);
    const totalFare = subTotal + gstFare;

    return {
      baseFare,
      classFare,
      distanceFare,
      timeFare,
      platformFees,
      serviceFare,
      subTotal,
      gstFare,
      totalFare,
      gstPercentage,
      perKmRate,
      perMinuteRate,
    };
  }

  getFareBreakdown(fareComponents: IFareComponents): Record<string, any> {
    return {
      baseFare: fareComponents.baseFare,
      classFare: fareComponents.classFare,
      distanceFare: fareComponents.distanceFare,
      timeFare: fareComponents.timeFare,
      platformFees: fareComponents.platformFees,
      serviceFare: fareComponents.serviceFare,
      subTotal: fareComponents.subTotal,
      gstFare: fareComponents.gstFare,
      totalFare: fareComponents.totalFare,
      gstPercentage: fareComponents.gstPercentage,
      perKmRate: fareComponents.perKmRate,
      perMinuteRate: fareComponents.perMinuteRate,
    };
  }
}
