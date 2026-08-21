// services/fare/AirportFareCalculationService.ts

import {
  IFareComponents,
  IFareParams,
} from "../../IFareCalculation";

// =====================================================
// ✅ AIRPORT VEHICLE TYPE CONFIGURATION
// =====================================================
interface IAirportVehicleConfig {
  perKm: number;
  perMinute: number;
  platformFee: number;
  gstPercentage: number;
  airportMultiplier: number; // Airport premium multiplier
}

const AIRPORT_VEHICLE_CONFIGS: Record<string, IAirportVehicleConfig> = {
  Bike: {
    perKm: 1.5,        // 36% higher than local (1.1)
    perMinute: 1.0,    // 43% higher than local (0.7)
    platformFee: 6,    // 50% higher than local (4)
    gstPercentage: 5,
    airportMultiplier: 1.4, // Airport premium
  },
  Scooter: {
    perKm: 1.5,        // 36% higher than local (1.1)
    perMinute: 0.9,    // 50% higher than local (0.6)
    platformFee: 6,    // 50% higher than local (4)
    gstPercentage: 5,
    airportMultiplier: 1.3, // Airport premium
  },
  Auto: {
    perKm: 12,         // 50% higher than local (8)
    perMinute: 1.4,    // 56% higher than local (0.9)
    platformFee: 8,    // 60% higher than local (5)
    gstPercentage: 5,
    airportMultiplier: 1.5, // Airport premium
  },
  Hatchback: {
    perKm: 28,         // 40% higher than local (20)
    perMinute: 1.5,    // 50% higher than local (1.0)
    platformFee: 9,    // 50% higher than local (6)
    gstPercentage: 5,
    airportMultiplier: 1.4, // Airport premium
  },
  Sedan: {
    perKm: 18,         // 50% higher than local (12)
    perMinute: 1.8,    // 50% higher than local (1.2)
    platformFee: 10,   // 43% higher than local (7)
    gstPercentage: 5,
    airportMultiplier: 1.5, // Airport premium
  },
  SUV: {
    perKm: 21,         // 50% higher than local (14)
    perMinute: 2.1,    // 50% higher than local (1.4)
    platformFee: 12,   // 50% higher than local (8)
    gstPercentage: 5,
    airportMultiplier: 1.5, // Airport premium
  },
  MPV: {
    perKm: 20,         // 54% higher than local (13)
    perMinute: 2.0,    // 54% higher than local (1.3)
    platformFee: 12,   // 50% higher than local (8)
    gstPercentage: 5,
    airportMultiplier: 1.5, // Airport premium
  },
  "Luxury Sedan": {
    perKm: 28,         // 56% higher than local (18)
    perMinute: 2.8,    // 56% higher than local (1.8)
    platformFee: 15,   // 50% higher than local (10)
    gstPercentage: 18,
    airportMultiplier: 1.6, // Airport premium
  },
  "Luxury SUV": {
    perKm: 35,         // 59% higher than local (22)
    perMinute: 3.2,    // 60% higher than local (2.0)
    platformFee: 18,   // 50% higher than local (12)
    gstPercentage: 18,
    airportMultiplier: 1.7, // Airport premium
  },
};

// ✅ Fallback config if vehicle type not found
const AIRPORT_FALLBACK_CONFIG: IAirportVehicleConfig = {
  perKm: 15,
  perMinute: 1.5,
  platformFee: 10,
  gstPercentage: 18,
  airportMultiplier: 1.5,
};

export class AirportFareCalculationService {
  private readonly config: {
    platformFees: number;
    gstPercentage: number;
    perKmRate: number;
    perMinuteRate: number;
  };

  constructor() {
    // ✅ Environment variables ONLY as fallback
    this.config = {
      platformFees: parseFloat(process.env.PLATFORM_FEES || "4"),
      gstPercentage: parseFloat(process.env.GST_PERCENTAGE || "18"),
      perKmRate: parseFloat(process.env.PER_KM_RATE || "5"),
      perMinuteRate: parseFloat(process.env.PER_MINUTE_RATE || "0.6"),
    };
  }

  // ✅ Get airport vehicle config
  private getAirportVehicleConfig(vehicleType: string, vehicleClass: string): IAirportVehicleConfig {
    // ✅ Try exact match first
    if (AIRPORT_VEHICLE_CONFIGS[vehicleType]) {
      console.log(`🛩️ [Airport Config] Exact match found for: ${vehicleType}`);
      return AIRPORT_VEHICLE_CONFIGS[vehicleType];
    }

    // ✅ Try matching by class
    const classMatch = Object.keys(AIRPORT_VEHICLE_CONFIGS).find(
      (key) =>
        vehicleClass?.toLowerCase().includes(key.toLowerCase()) ||
        vehicleType?.toLowerCase().includes(key.toLowerCase())
    );

    if (classMatch) {
      console.log(`🛩️ [Airport Config] Class match found: ${classMatch}`);
      return AIRPORT_VEHICLE_CONFIGS[classMatch];
    }

    // ✅ Try matching by partial keyword
    const keywordMatch = Object.keys(AIRPORT_VEHICLE_CONFIGS).find((key) => {
      const searchStr = vehicleType.toLowerCase();
      const keyLower = key.toLowerCase();
      return searchStr.includes(keyLower) || keyLower.includes(searchStr);
    });

    if (keywordMatch) {
      console.log(`🛩️ [Airport Config] Keyword match found: ${keywordMatch}`);
      return AIRPORT_VEHICLE_CONFIGS[keywordMatch];
    }

    console.log(`⚠️ [Airport Config] No match found for: ${vehicleType}, using fallback`);
    return AIRPORT_FALLBACK_CONFIG;
  }

  calculateAirportFare(params: IFareParams): IFareComponents {
    console.log("=================================================");
    console.log("✈️ AIRPORT FARE CALCULATION STARTED");
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

    // ✅ 2. Get airport vehicle configuration
    const vehicleConfig = this.getAirportVehicleConfig(vehicleType, vehicleClass);

    console.log("=================================================");
    console.log("📊 AIRPORT VEHICLE CONFIGURATION");
    console.log("=================================================");
    console.log("");
    console.log(`   Vehicle Type: ${vehicleType}`);
    console.log(`   Per KM Rate: ₹${vehicleConfig.perKm} (Airport Rate)`);
    console.log(`   Per Minute Rate: ₹${vehicleConfig.perMinute} (Airport Rate)`);
    console.log(`   Platform Fee: ₹${vehicleConfig.platformFee} (Airport Rate)`);
    console.log(`   GST Percentage: ${vehicleConfig.gstPercentage}%`);
    console.log(`   Airport Multiplier: ${vehicleConfig.airportMultiplier}x`);
    console.log("");

    // ✅ 3. Use vehicle config values (Priority 1) or fallback to params (Priority 2) or env (Priority 3)
    const platformFee = paramPlatformFees ?? vehicleConfig.platformFee ?? this.config.platformFees;
    const gstPercentage = paramGstPercentage ?? vehicleConfig.gstPercentage ?? this.config.gstPercentage;

    console.log("=================================================");
    console.log("📊 AIRPORT RATE BREAKDOWN");
    console.log("=================================================");
    console.log("");
    console.log(`   ✅ FINAL Per KM Rate: ₹${vehicleConfig.perKm} (Airport Rate)`);
    console.log(`   ✅ FINAL Per Minute Rate: ₹${vehicleConfig.perMinute} (Airport Rate)`);
    console.log(`   ✅ FINAL Platform Fee: ₹${platformFee} (Airport Rate)`);
    console.log(`   ✅ FINAL GST Percentage: ${gstPercentage}%`);
    console.log(`   ℹ️  Airport Multiplier ${vehicleConfig.airportMultiplier}x applied to total`);
    console.log("");

    console.log("=================================================");
    console.log("📊 AIRPORT CALCULATION BREAKDOWN");
    console.log("=================================================");
    console.log("");

    // ✅ 4. Base Fare - Use AS-IS from controller
    const baseDriverFare = vehicle.baseFare || 0;
    const baseFare = baseDriverFare;
    console.log(`🏷️ Base Fare:`);
    console.log(`   Driver Base Fare: ₹${baseDriverFare}`);
    console.log(`   ✅ Base Fare = ₹${baseDriverFare} (Using controller value AS-IS)`);
    console.log("");

    // ✅ 5. Class Fare - Use AS-IS from controller
    const classDriverFare = vehicle.classFare || 0;
    const classFare = classDriverFare;
    console.log(`🏷️ Class Fare:`);
    console.log(`   Driver Class Fare: ₹${classDriverFare}`);
    console.log(`   ✅ Class Fare = ₹${classDriverFare} (Using controller value AS-IS)`);
    console.log("");

    // ✅ 6. Distance Fare - Airport rate applied
    console.log(`📏 Distance Fare (Airport Rate):`);
    console.log(`   Road Distance: ${roadDistanceKm} km`);
    console.log(`   Per KM Rate (Airport): ₹${vehicleConfig.perKm}`);
    const distanceFare = roadDistanceKm * vehicleConfig.perKm;
    console.log(`   ✅ Distance Fare = ${roadDistanceKm} × ${vehicleConfig.perKm} = ₹${distanceFare.toFixed(2)}`);
    console.log("");

    // ✅ 7. Time Fare - Airport rate applied
    console.log(`⏱️ Time Fare (Airport Rate):`);
    console.log(`   Traffic Duration: ${trafficDurationMinutes} min`);
    console.log(`   Per Minute Rate (Airport): ₹${vehicleConfig.perMinute}`);
    const timeFare = trafficDurationMinutes * vehicleConfig.perMinute;
    console.log(`   ✅ Time Fare = ${trafficDurationMinutes} × ${vehicleConfig.perMinute} = ₹${timeFare.toFixed(2)}`);
    console.log("");

    // ✅ 8. Platform Fee - Airport rate applied
    console.log(`🏢 Platform Fee (Airport Rate):`);
    console.log(`   Platform Fee: ₹${platformFee}`);
    const platformFeeFinal = platformFee;
    console.log(`   ✅ Platform Fee = ₹${platformFeeFinal.toFixed(2)}`);
    console.log("");

    // ✅ 9. Subtotal
    console.log("-----------------------------------------");
    console.log("💰 SUBTOTAL CALCULATION");
    console.log("-----------------------------------------");
    console.log("");

    console.log("   Individual Components:");
    console.log(`   Base Fare:      ₹${baseFare.toFixed(2)} (Controller value AS-IS)`);
    console.log(`   Class Fare:     ₹${classFare.toFixed(2)} (Controller value AS-IS)`);
    console.log(`   Distance Fare:  ₹${distanceFare.toFixed(2)} (Airport Rate)`);
    console.log(`   Time Fare:      ₹${timeFare.toFixed(2)} (Airport Rate)`);
    console.log(`   Platform Fee:   ₹${platformFeeFinal.toFixed(2)} (Airport Rate)`);
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

    // ✅ 11. Apply Airport Multiplier to Total
    console.log("-----------------------------------------");
    console.log("🛩️ AIRPORT MULTIPLIER APPLICATION");
    console.log("-----------------------------------------");
    console.log("");

    const totalBeforeMultiplier = subTotal + gstFare;
    console.log(`   Total before multiplier: ₹${totalBeforeMultiplier.toFixed(3)}`);
    console.log(`   Airport Multiplier: ${vehicleConfig.airportMultiplier}x`);
    
    const totalAfterMultiplier = totalBeforeMultiplier * vehicleConfig.airportMultiplier;
    console.log(`   Calculation: ${totalBeforeMultiplier.toFixed(3)} × ${vehicleConfig.airportMultiplier}`);
    console.log(`   ✅ Total after multiplier: ₹${totalAfterMultiplier.toFixed(3)}`);
    console.log("");

    // ✅ 12. Final Total Fare with Rounding
    console.log("-----------------------------------------");
    console.log("🎯 FINAL AIRPORT FARE");
    console.log("-----------------------------------------");
    console.log("");

    const roundedTotalFare = Math.round(totalAfterMultiplier);

    console.log(`   Calculation:`);
    console.log(`   ${subTotal.toFixed(2)} (Subtotal)`);
    console.log(`   +${gstFare.toFixed(3)} (GST)`);
    console.log(`   =${totalBeforeMultiplier.toFixed(3)} (Before Multiplier)`);
    console.log(`   ×${vehicleConfig.airportMultiplier} (Airport Multiplier)`);
    console.log(`   =${totalAfterMultiplier.toFixed(3)} (After Multiplier)`);
    console.log(`   ✅ Rounded Total Airport Fare = ₹${roundedTotalFare}`);
    console.log("");

    console.log("=================================================");
    console.log("✅ AIRPORT FARE CALCULATION COMPLETED");
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

  getAirportFareBreakdown(fareComponents: IFareComponents): Record<string, any> {
    console.log("=================================================");
    console.log("📋 AIRPORT FARE BREAKDOWN REQUESTED");
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

    console.log("📊 Airport Fare Breakdown:");
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
    console.log("✅ AIRPORT FARE BREAKDOWN COMPLETED");
    console.log("=================================================");

    return breakdown;
  }
}