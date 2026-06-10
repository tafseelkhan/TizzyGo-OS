// File: controllers/tizzyos/seller/pricingCalculation.ts

import { Request, Response } from "express";
import { GST_RATES } from "../../../../config/tizzygo/gstRates";

// ================= GST HELPER =================
const getGSTRate = (category: string, subcategory: string): number => {
  console.log(
    `🔍 Getting GST rate for Category: ${category}, Subcategory: ${subcategory}`,
  );

  const cat = GST_RATES.find((c) => c.category === category);
  if (!cat) {
    console.log(
      `⚠️ Category "${category}" not found, using default GST rate: 18%`,
    );
    return 18;
  }

  const gstRate = cat.subcategories?.[subcategory] ?? cat.defaultRate ?? 18;
  console.log(
    `✅ GST Rate calculated: ${gstRate}% for ${category} -> ${subcategory}`,
  );

  return gstRate;
};

// ================= PRICE CALCULATION =================
const calculatePriceDetails = (mrp: number, price: number) => {
  console.log(`💰 Calculating price details - MRP: ${mrp}, Price: ${price}`);

  if (!mrp || !price) {
    console.log(`⚠️ Invalid MRP or Price, using defaults`);
    return {
      savedAmount: 0,
      discount: 0,
      finalPrice: price || 0,
    };
  }

  const savedAmount = mrp - price;
  const discount = (savedAmount / mrp) * 100;

  const result = {
    savedAmount: Number(savedAmount.toFixed(2)),
    discount: Number(discount.toFixed(2)),
    finalPrice: Number(price.toFixed(2)),
  };

  console.log(
    `✅ Price calculation complete - Saved: ${result.savedAmount}, Discount: ${result.discount}%, Final: ${result.finalPrice}`,
  );

  return result;
};

// ================= SINGLE PRODUCT PRICING API =================
export const calculatePricing = async (req: Request, res: Response) => {
  try {
    console.log("\n🚀 ========== PRICING CALCULATION API START ==========");
    console.log(`📅 Time: ${new Date().toISOString()}`);
    console.log(`📥 Request Body:`, JSON.stringify(req.body, null, 2));

    const { mrp, price, category, subcategory, gstType } = req.body;

    console.log(`\n📋 Input Parameters:`);
    console.log(`   - MRP: ₹${mrp}`);
    console.log(`   - Price: ₹${price}`);
    console.log(`   - Category: ${category}`);
    console.log(`   - Subcategory: ${subcategory}`);
    console.log(`   - GST Type: ${gstType}`);

    // Validation
    if (!mrp || !price) {
      console.log(`❌ Validation Failed: MRP or Price missing`);
      return res.status(400).json({
        success: false,
        message: "MRP and Price are required",
      });
    }

    if (!category || !subcategory) {
      console.log(`❌ Validation Failed: Category or Subcategory missing`);
      return res.status(400).json({
        success: false,
        message: "Category and subcategory are required",
      });
    }

    if (!gstType || !["INCLUSIVE", "EXCLUSIVE"].includes(gstType)) {
      console.log(`❌ Validation Failed: Invalid GST Type - ${gstType}`);
      return res.status(400).json({
        success: false,
        message: "Valid gstType (INCLUSIVE/EXCLUSIVE) is required",
      });
    }

    console.log(`✅ Validation passed`);

    // Get GST rate
    console.log(`\n🔍 Fetching GST Rate...`);
    const gstRate = getGSTRate(category, subcategory);

    // Calculate base pricing
    console.log(`\n💰 Calculating Price Details...`);
    const pricing = calculatePriceDetails(mrp, price);

    // Prepare response based on GST type
    let responseData: any = {
      success: true,
      data: {
        mrp: Number(mrp),
        price: Number(price),
        savedAmount: pricing.savedAmount,
        discountPercentage: pricing.discount,
        finalPrice: pricing.finalPrice,
        gstRate: gstRate,
        gstType: gstType,
      },
    };

    console.log(`\n📊 Base Response Data:`, responseData.data);

    // GST calculation based on type
    if (gstType === "INCLUSIVE") {
      console.log(`\n🧮 Calculating INCLUSIVE GST...`);
      const gstAmount = Number(
        ((price * gstRate) / (100 + gstRate)).toFixed(2),
      );
      const basePrice = Number((price - gstAmount).toFixed(2));

      responseData.data.gstAmount = gstAmount;
      responseData.data.basePrice = basePrice;
      responseData.data.customerPays = price;

      console.log(`✅ INCLUSIVE GST Results:`);
      console.log(`   - GST Amount: ₹${gstAmount}`);
      console.log(`   - Base Price: ₹${basePrice}`);
      console.log(`   - Customer Pays: ₹${price}`);
    } else {
      // EXCLUSIVE - No GST calculation, just return basic info
      console.log(`\n⚠️ EXCLUSIVE GST Mode - No GST added`);
      console.log(`   Customer pays: ₹${price} (No GST included)`);

      // Don't add any GST fields for exclusive
      // responseData.data remains with only base fields (mrp, price, discount, gstRate, gstType)
    }

    console.log(`\n📤 Final Response:`, JSON.stringify(responseData, null, 2));
    console.log("✅ ========== PRICING CALCULATION API END ==========\n");

    return res.status(200).json(responseData);
  } catch (error: any) {
    console.error(`\n❌ ========== PRICING CALCULATION API ERROR ==========`);
    console.error(`❌ Error Time: ${new Date().toISOString()}`);
    console.error(`❌ Error Message: ${error?.message}`);
    console.error(`❌ Error Stack: ${error?.stack}`);
    console.error(`❌ ========== ERROR END ==========\n`);

    return res.status(500).json({
      success: false,
      message: error?.message || "Failed to calculate pricing",
    });
  }
};
