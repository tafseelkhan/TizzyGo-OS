export interface IFareComponents {
  baseFare: number;
  classFare: number;
  distanceFare: number;
  timeFare: number;
  platformFees: number;
  serviceFare: number;
  subTotal: number;
  gstFare: number;
  totalFare: number;
  gstPercentage: number;
  perKmRate: number;
  perMinuteRate: number;
}

export interface IFareParams {
  vehicle: {
    categoryCode: string;
    companyCode: string;
    modelCode: string;
    vehicleType: string;
    class: string;
    baseFare: number;
    classFare: number;
    maxPassengers: number;
  };
  roadDistanceKm: number;
  trafficDurationMinutes: number;
  platformFees?: number;
  serviceFare?: number;
  gstPercentage?: number;
  perKmRate?: number;
  perMinuteRate?: number;
}

export interface IFareConfig {
  platformFees: number;
  serviceFare: number;
  gstPercentage: number;
  perKmRate: number;
  perMinuteRate: number;
}
