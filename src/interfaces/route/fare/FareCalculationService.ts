// services/fare/FareCalculationService.ts

import {
  IFareComponents,
  IFareParams,
  IFareConfig,
} from "../../IFareCalculation";

// =====================================================
// ✅ VEHICLE TYPE CONFIGURATION - Single Source of Truth
// =====================================================
interface IVehicleConfig {
  perKm: number;
  perMinute: number;
  platformFee: number;
  gstPercentage: number;
  fareMultiplier: number; // Reserved for future use - NOT used in calculations
}

const VEHICLE_CONFIGS: Record<string, IVehicleConfig> = {
  Bike: {
    perKm: 1.1,
    perMinute: 0.7,
    platformFee: 4,
    gstPercentage: 5,
    fareMultiplier: 1.2, // Reserved for future use
  },
  Scooter: {
    perKm: 1.1,
    perMinute: 0.6,
    platformFee: 4,
    gstPercentage: 5,
    fareMultiplier: 1.1, // Reserved for future use
  },
  Auto: {
    perKm: 8,
    perMinute: 0.9,
    platformFee: 5,
    gstPercentage: 5,
    fareMultiplier: 1.5, // Reserved for future use
  },
  Hatchback: {
    perKm: 20,
    perMinute: 1.0,
    platformFee: 6,
    gstPercentage: 5,
    fareMultiplier: 1.6, // Reserved for future use
  },
  Sedan: {
    perKm: 12,
    perMinute: 1.2,
    platformFee: 7,
    gstPercentage: 5,
    fareMultiplier: 1.8, // Reserved for future use
  },
  SUV: {
    perKm: 14,
    perMinute: 1.4,
    platformFee: 8,
    gstPercentage: 5,
    fareMultiplier: 2.0, // Reserved for future use
  },
  MPV: {
    perKm: 13,
    perMinute: 1.3,
    platformFee: 8,
    gstPercentage: 5,
    fareMultiplier: 2.2, // Reserved for future use
  },
  "Luxury Sedan": {
    perKm: 18,
    perMinute: 1.8,
    platformFee: 10,
    gstPercentage: 18,
    fareMultiplier: 2.5, // Reserved for future use
  },
  "Luxury SUV": {
    perKm: 22,
    perMinute: 2.0,
    platformFee: 12,
    gstPercentage: 18,
    fareMultiplier: 3.0, // Reserved for future use
  },
};

// ✅ Fallback config if vehicle type not found
const FALLBACK_CONFIG: IVehicleConfig = {
  perKm: 10,
  perMinute: 1.0,
  platformFee: 6,
  gstPercentage: 18,
  fareMultiplier: 1.5, // Reserved for future use
};

export class FareCalculationService {
  private readonly config: IFareConfig;

  constructor() {
    // ✅ Environment variables ONLY as fallback
    this.config = {
      platformFees: parseFloat(process.env.PLATFORM_FEES || "4"),
      gstPercentage: parseFloat(process.env.GST_PERCENTAGE || "18"),
      perKmRate: parseFloat(process.env.PER_KM_RATE || "5"),
      perMinuteRate: parseFloat(process.env.PER_MINUTE_RATE || "0.6"),
    };
  }

  // ✅ Get vehicle config - Vehicle type driven
  private getVehicleConfig(vehicleType: string, vehicleClass: string): IVehicleConfig {
    // ✅ Try exact match first
    if (VEHICLE_CONFIGS[vehicleType]) {
      console.log(`🚗 [Vehicle Config] Exact match found for: ${vehicleType}`);
      return VEHICLE_CONFIGS[vehicleType];
    }

    // ✅ Try matching by class
    const classMatch = Object.keys(VEHICLE_CONFIGS).find(
      (key) =>
        vehicleClass?.toLowerCase().includes(key.toLowerCase()) ||
        vehicleType?.toLowerCase().includes(key.toLowerCase())
    );

    if (classMatch) {
      console.log(`🚗 [Vehicle Config] Class match found: ${classMatch}`);
      return VEHICLE_CONFIGS[classMatch];
    }

    // ✅ Try matching by partial keyword
    const keywordMatch = Object.keys(VEHICLE_CONFIGS).find((key) => {
      const searchStr = vehicleType.toLowerCase();
      const keyLower = key.toLowerCase();
      return searchStr.includes(keyLower) || keyLower.includes(searchStr);
    });

    if (keywordMatch) {
      console.log(`🚗 [Vehicle Config] Keyword match found: ${keywordMatch}`);
      return VEHICLE_CONFIGS[keywordMatch];
    }

    console.log(`⚠️ [Vehicle Config] No match found for: ${vehicleType}, using fallback`);
    return FALLBACK_CONFIG;
  }

  calculateFare(params: IFareParams): IFareComponents {
    console.log("=================================================");
    console.log("💰 FARE CALCULATION STARTED");
    console.log("=================================================");
    console.log("");

    const {
      vehicle,
      roadDistanceKm,
      trafficDurationMinutes,
      platformFees: paramPlatformFees,
      gstPercentage: paramGstPercentage,
    } = params;

    // ✅ 1. Get vehicle type and class
    const vehicleType = vehicle.vehicleType || "Sedan";
    const vehicleClass = vehicle.vehicleClass || "Standard";

    console.log("📋 INPUT PARAMETERS:");
    console.log(`   Vehicle Type: ${vehicleType}`);
    console.log(`   Vehicle Class: ${vehicleClass}`);
    console.log(`   Driver Base Fare: ₹${vehicle.baseFare || 0}`);
    console.log(`   Driver Class Fare: ₹${vehicle.classFare || 0}`);
    console.log(`   Road Distance: ${roadDistanceKm} km`);
    console.log(`   Traffic Duration: ${trafficDurationMinutes} minutes`);
    console.log("");

    // ✅ 2. Get vehicle configuration (Vehicle type driven)
    const vehicleConfig = this.getVehicleConfig(vehicleType, vehicleClass);

    console.log("=================================================");
    console.log("📊 VEHICLE CONFIGURATION");
    console.log("=================================================");
    console.log("");
    console.log(`   Vehicle Type: ${vehicleType}`);
    console.log(`   Per KM Rate: ₹${vehicleConfig.perKm}`);
    console.log(`   Per Minute Rate: ₹${vehicleConfig.perMinute}`);
    console.log(`   Platform Fee: ₹${vehicleConfig.platformFee}`);
    console.log(`   GST Percentage: ${vehicleConfig.gstPercentage}%`);
    console.log(`   Fare Multiplier: ${vehicleConfig.fareMultiplier}x (Reserved - NOT used in calculations)`);
    console.log("");

    // ✅ 3. Use vehicle config values (Priority 1) or fallback to params (Priority 2) or env (Priority 3)
    const platformFee = paramPlatformFees ?? vehicleConfig.platformFee ?? this.config.platformFees;
    const gstPercentage = paramGstPercentage ?? vehicleConfig.gstPercentage ?? this.config.gstPercentage;

    console.log("=================================================");
    console.log("📊 RATE BREAKDOWN");
    console.log("=================================================");
    console.log("");
    console.log(`   Environment Per KM Rate (Fallback): ₹${this.config.perKmRate}`);
    console.log(`   Environment Per Minute Rate (Fallback): ₹${this.config.perMinuteRate}`);
    console.log(`   Vehicle Per KM Rate: ₹${vehicleConfig.perKm} (Priority 1)`);
    console.log(`   Vehicle Per Minute Rate: ₹${vehicleConfig.perMinute} (Priority 1)`);
    console.log(`   ✅ FINAL Per KM Rate: ₹${vehicleConfig.perKm}`);
    console.log(`   ✅ FINAL Per Minute Rate: ₹${vehicleConfig.perMinute}`);
    console.log(`   ℹ️  Fare Multiplier ${vehicleConfig.fareMultiplier}x is NOT applied to any calculation`);
    console.log(`   ✅ FINAL Platform Fee: ₹${platformFee}`);
    console.log(`   ✅ FINAL GST Percentage: ${gstPercentage}%`);
    console.log("");

    console.log("=================================================");
    console.log("📊 CALCULATION BREAKDOWN");
    console.log("=================================================");
    console.log("");

    // ✅ 4. Base Fare - Use AS-IS from controller, NO multiplier
    const baseDriverFare = vehicle.baseFare || 0;
    const baseFare = baseDriverFare;
    console.log(`🏷️ Base Fare:`);
    console.log(`   Driver Base Fare: ₹${baseDriverFare}`);
    console.log(`   ✅ Base Fare = ₹${baseDriverFare} (Using controller value AS-IS)`);
    console.log(`   ℹ️  Fare Multiplier NOT applied to Base Fare`);
    console.log("");

    // ✅ 5. Class Fare - Use AS-IS from controller, NO multiplier
    const classDriverFare = vehicle.classFare || 0;
    const classFare = classDriverFare;
    console.log(`🏷️ Class Fare:`);
    console.log(`   Driver Class Fare: ₹${classDriverFare}`);
    console.log(`   ✅ Class Fare = ₹${classDriverFare} (Using controller value AS-IS)`);
    console.log(`   ℹ️  Fare Multiplier NOT applied to Class Fare`);
    console.log("");

    // ✅ 6. Distance Fare - NO multiplier applied
    console.log(`📏 Distance Fare:`);
    console.log(`   Road Distance: ${roadDistanceKm} km`);
    console.log(`   Per KM Rate: ₹${vehicleConfig.perKm}`);
    const distanceFare = roadDistanceKm * vehicleConfig.perKm;
    console.log(`   ✅ Distance Fare = ${roadDistanceKm} × ${vehicleConfig.perKm} = ₹${distanceFare.toFixed(2)}`);
    console.log(`   ℹ️  Fare Multiplier NOT applied to Distance Fare`);
    console.log("");

    // ✅ 7. Time Fare - NO multiplier applied
    console.log(`⏱️ Time Fare:`);
    console.log(`   Traffic Duration: ${trafficDurationMinutes} min`);
    console.log(`   Per Minute Rate: ₹${vehicleConfig.perMinute}`);
    const timeFare = trafficDurationMinutes * vehicleConfig.perMinute;
    console.log(`   ✅ Time Fare = ${trafficDurationMinutes} × ${vehicleConfig.perMinute} = ₹${timeFare.toFixed(2)}`);
    console.log(`   ℹ️  Fare Multiplier NOT applied to Time Fare`);
    console.log("");

    // ✅ 8. Platform Fee - NO multiplier applied
    console.log(`🏢 Platform Fee:`);
    console.log(`   Platform Fee: ₹${platformFee}`);
    const platformFeeFinal = platformFee;
    console.log(`   ✅ Platform Fee = ₹${platformFeeFinal.toFixed(2)}`);
    console.log(`   ℹ️  Fare Multiplier NOT applied to Platform Fee`);
    console.log("");

    // ✅ 9. Subtotal
    console.log("-----------------------------------------");
    console.log("💰 SUBTOTAL CALCULATION");
    console.log("-----------------------------------------");
    console.log("");

    console.log("   Individual Components:");
    console.log(`   Base Fare:      ₹${baseFare.toFixed(2)} (Controller value AS-IS)`);
    console.log(`   Class Fare:     ₹${classFare.toFixed(2)} (Controller value AS-IS)`);
    console.log(`   Distance Fare:  ₹${distanceFare.toFixed(2)}`);
    console.log(`   Time Fare:      ₹${timeFare.toFixed(2)}`);
    console.log(`   Platform Fee:   ₹${platformFeeFinal.toFixed(2)}`);
    console.log("");

    const subTotal = baseFare + classFare + distanceFare + timeFare + platformFeeFinal;

    console.log(`   Calculation:`);
    console.log(`   ${baseFare.toFixed(2)} (Base Fare)`);
    console.log(`   +${classFare.toFixed(2)} (Class Fare)`);
    console.log(`   +${distanceFare.toFixed(2)} (Distance Fare)`);
    console.log(`   +${timeFare.toFixed(2)} (Time Fare)`);
    console.log(`   +${platformFeeFinal.toFixed(2)} (Platform Fee)`);
    console.log(`   -----------------`);
    console.log(`   ✅ Subtotal = ₹${subTotal.toFixed(2)}`);
    console.log("");

    // ✅ 10. GST Calculation
    console.log("-----------------------------------------");
    console.log("🧾 GST CALCULATION");
    console.log("-----------------------------------------");
    console.log("");

    const gstFare = subTotal * (gstPercentage / 100);
    console.log(`   GST Percentage: ${gstPercentage}%`);
    console.log(`   Calculation: ${subTotal.toFixed(2)} × ${gstPercentage} / 100`);
    console.log(`   ✅ GST = ₹${gstFare.toFixed(3)}`);
    console.log("");

    // ✅ 11. Total Fare
    console.log("-----------------------------------------");
    console.log("🎯 FINAL FARE");
    console.log("-----------------------------------------");
    console.log("");

    const totalFare = subTotal + gstFare;
    const roundedTotalFare = Math.round(totalFare);

    console.log(`   Calculation:`);
    console.log(`   ${subTotal.toFixed(2)}`);
    console.log(`   +${gstFare.toFixed(3)}`);
    console.log(`   -----------------`);
    console.log(`   Total Fare = ₹${totalFare.toFixed(3)}`);
    console.log(`   ✅ Rounded Total Fare = ₹${roundedTotalFare}`);
    console.log("");

    console.log("=================================================");
    console.log("✅ FARE CALCULATION COMPLETED");
    console.log("=================================================");

    return {
      baseFare,
      classFare,
      distanceFare,
      timeFare,
      platformFees: platformFeeFinal,
      subTotal,
      gstFare,
      totalFare: roundedTotalFare,
      gstPercentage,
      perKmRate: vehicleConfig.perKm,
      perMinuteRate: vehicleConfig.perMinute,
    };
  }

  getFareBreakdown(fareComponents: IFareComponents): Record<string, any> {
    console.log("=================================================");
    console.log("📋 FARE BREAKDOWN REQUESTED");
    console.log("=================================================");
    console.log("");

    const breakdown = {
      baseFare: fareComponents.baseFare,
      classFare: fareComponents.classFare,
      distanceFare: fareComponents.distanceFare,
      timeFare: fareComponents.timeFare,
      platformFees: fareComponents.platformFees,
      subTotal: fareComponents.subTotal,
      gstFare: fareComponents.gstFare,
      totalFare: fareComponents.totalFare,
      gstPercentage: fareComponents.gstPercentage,
      perKmRate: fareComponents.perKmRate,
      perMinuteRate: fareComponents.perMinuteRate,
    };

    console.log("📊 Fare Breakdown:");
    console.log(`   Base Fare:      ₹${breakdown.baseFare.toFixed(2)}`);
    console.log(`   Class Fare:     ₹${breakdown.classFare.toFixed(2)}`);
    console.log(`   Distance Fare:  ₹${breakdown.distanceFare.toFixed(2)}`);
    console.log(`   Time Fare:      ₹${breakdown.timeFare.toFixed(2)}`);
    console.log(`   Platform Fees:  ₹${breakdown.platformFees.toFixed(2)}`);
    console.log(`   Subtotal:       ₹${breakdown.subTotal.toFixed(2)}`);
    console.log(`   GST (${breakdown.gstPercentage}%): ₹${breakdown.gstFare.toFixed(2)}`);
    console.log(`   Total Fare:     ₹${breakdown.totalFare.toFixed(2)}`);
    console.log("");

    console.log("=================================================");
    console.log("✅ FARE BREAKDOWN COMPLETED");
    console.log("=================================================");

    return breakdown;
  }
}