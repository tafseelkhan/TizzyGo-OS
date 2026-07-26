import {
  IFareComponents,
  IFareParams,
  IFareConfig,
} from "../../IFareCalculation";

export class FareCalculationService {
  private readonly config: IFareConfig;

  constructor() {
    this.config = {
      platformFees: parseFloat(process.env.PLATFORM_FEES || "4"),
      // REMOVED: serviceFare completely
      gstPercentage: parseFloat(process.env.GST_PERCENTAGE || "18"),
      perKmRate: parseFloat(process.env.PER_KM_RATE || "5"),
      perMinuteRate: parseFloat(process.env.PER_MINUTE_RATE || "0.6"),
    };
  }

  calculateFare(params: IFareParams): IFareComponents {
    console.log("=================================================");
    console.log("💰 FARE CALCULATION STARTED");
    console.log("=================================================");
    console.log("");

    // Destructure params with defaults (removed serviceFare)
    const {
      vehicle,
      roadDistanceKm,
      trafficDurationMinutes,
      platformFees = this.config.platformFees,
      gstPercentage = this.config.gstPercentage,
      perKmRate = this.config.perKmRate,
      perMinuteRate = this.config.perMinuteRate,
    } = params;

    console.log("📋 INPUT PARAMETERS:");
    console.log(
      `   Vehicle: ${vehicle.vehicleType || "N/A"} (${vehicle.vehicleClass || "N/A"})`,
    );
    console.log(`   Road Distance: ${roadDistanceKm} km`);
    console.log(`   Traffic Duration: ${trafficDurationMinutes} minutes`);
    console.log(`   Platform Fees: ₹${platformFees}`);
    console.log(`   GST Percentage: ${gstPercentage}%`);
    console.log(`   Per KM Rate: ₹${perKmRate}`);
    console.log(`   Per Minute Rate: ₹${perMinuteRate}`);
    console.log("");
    console.log("=================================================");
    console.log("📊 CALCULATION BREAKDOWN");
    console.log("=================================================");
    console.log("");

    // Base Fare
    const baseFare = vehicle.baseFare || 0;
    console.log(`🏷️ Base Fare:`);
    console.log(`   Base Fare = ₹${baseFare}`);
    console.log("");

    // Class Fare
    const classFare = vehicle.classFare || 0;
    console.log(`🏷️ Class Fare:`);
    console.log(`   Class Fare = ₹${classFare}`);
    console.log("");

    // Distance Fare
    console.log(`📏 Distance Fare:`);
    console.log(`   Road Distance = ${roadDistanceKm} km`);
    console.log(`   Per KM Rate = ₹${perKmRate}`);
    const distanceFare = roadDistanceKm * perKmRate;
    console.log(
      `   Calculation: ${roadDistanceKm} × ${perKmRate} = ₹${distanceFare.toFixed(2)}`,
    );
    console.log("");

    // Time Fare
    console.log(`⏱️ Time Fare:`);
    console.log(`   Traffic Duration = ${trafficDurationMinutes} min`);
    console.log(`   Per Minute Rate = ₹${perMinuteRate}`);
    const timeFare = trafficDurationMinutes * perMinuteRate;
    console.log(
      `   Calculation: ${trafficDurationMinutes} × ${perMinuteRate} = ₹${timeFare.toFixed(2)}`,
    );
    console.log("");

    // Platform Fee
    console.log(`🏢 Platform Fee:`);
    console.log(`   Platform Fee = ₹${platformFees}`);
    console.log("");

    // REMOVED: Service Fee section

    // Subtotal Calculation
    console.log("-----------------------------------------");
    console.log("💰 SUBTOTAL CALCULATION");
    console.log("-----------------------------------------");
    console.log("");

    console.log("   Individual Components:");
    console.log(`   Base Fare:      ₹${baseFare.toFixed(2)}`);
    console.log(`   Class Fare:     ₹${classFare.toFixed(2)}`);
    console.log(`   Distance Fare:  ₹${distanceFare.toFixed(2)}`);
    console.log(`   Time Fare:      ₹${timeFare.toFixed(2)}`);
    console.log(`   Platform Fee:   ₹${platformFees.toFixed(2)}`);
    // REMOVED: Service Fare from display
    console.log("");

    const subTotal =
      baseFare + classFare + distanceFare + timeFare + platformFees;
    // REMOVED: + serviceFare from subtotal

    console.log(`   Calculation:`);
    console.log(`   ${baseFare.toFixed(2)}`);
    console.log(`   +${classFare.toFixed(2)}`);
    console.log(`   +${distanceFare.toFixed(2)}`);
    console.log(`   +${timeFare.toFixed(2)}`);
    console.log(`   +${platformFees.toFixed(2)}`);
    console.log(`   -----------------`);
    console.log(`   Subtotal = ₹${subTotal.toFixed(2)}`);
    console.log("");

    // GST Calculation
    console.log("-----------------------------------------");
    console.log("🧾 GST CALCULATION");
    console.log("-----------------------------------------");
    console.log("");

    const gstFare = subTotal * (gstPercentage / 100);
    console.log(`   GST Percentage = ${gstPercentage}%`);
    console.log(
      `   Calculation: ${subTotal.toFixed(2)} × ${gstPercentage} / 100`,
    );
    console.log(
      `   = ${subTotal.toFixed(2)} × ${(gstPercentage / 100).toFixed(2)}`,
    );
    console.log(`   = ₹${gstFare.toFixed(3)}`);
    console.log("");

    // Total Fare
    console.log("-----------------------------------------");
    console.log("🎯 FINAL FARE");
    console.log("-----------------------------------------");
    console.log("");

    const totalFare = subTotal + gstFare;

    console.log(`   Calculation:`);
    console.log(`   ${subTotal.toFixed(2)}`);
    console.log(`   +${gstFare.toFixed(3)}`);
    console.log(`   -----------------`);
    console.log(`   Total Fare = ₹${totalFare.toFixed(3)}`);
    console.log("");

    const roundedTotalFare = Math.round(totalFare);
    console.log(`   Rounded Total Fare = ₹${roundedTotalFare}`);
    console.log("");

    console.log("=================================================");
    console.log("✅ FARE CALCULATION COMPLETED");
    console.log("=================================================");

    // REMOVED: serviceFare from return object
    return {
      baseFare,
      classFare,
      distanceFare,
      timeFare,
      platformFees,
      subTotal,
      gstFare,
      totalFare,
      gstPercentage,
      perKmRate,
      perMinuteRate,
    };
  }

  getFareBreakdown(fareComponents: IFareComponents): Record<string, any> {
    console.log("=================================================");
    console.log("📋 FARE BREAKDOWN REQUESTED");
    console.log("=================================================");
    console.log("");

    // REMOVED: serviceFare from breakdown
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
    console.log(
      `   GST (${breakdown.gstPercentage}%): ₹${breakdown.gstFare.toFixed(2)}`,
    );
    console.log(`   Total Fare:     ₹${breakdown.totalFare.toFixed(2)}`);
    console.log("");

    console.log("=================================================");
    console.log("✅ FARE BREAKDOWN COMPLETED");
    console.log("=================================================");

    return breakdown;
  }
}
