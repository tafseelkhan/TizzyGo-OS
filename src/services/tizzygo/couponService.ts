import axios from "axios";
import { COUPON_SERVICE_URL } from "../../utils/tizzygo/calculations";

export const validateCoupon = async (
  couponCode: string,
  userId: string,
  price: number,
  skipRevalidation: boolean = false,
): Promise<any> => {
  const payload = {
    couponCode: couponCode.trim().toUpperCase(),
    userId,
    price,
    skipRevalidation,
  };

  try {
    const response = await axios.post(
      `${COUPON_SERVICE_URL}/api/admin/apply`,
      payload,
      { timeout: 5000 },
    );

    const data = response.data;
    if (typeof data === "object" && data !== null) {
      return {
        success: data.success === true,
        calculation: data.calculation,
        message: data.message,
        isAlreadyApplied: data.isAlreadyApplied || false,
      };
    }
    return { success: false, message: "Invalid response from coupon service" };
  } catch (err: any) {
    return {
      success: false,
      message: err?.response?.data?.message || "Coupon service error",
    };
  }
};

export const getCouponDetails = async (couponCode: string): Promise<any> => {
  try {
    const response = await axios.get(
      `${COUPON_SERVICE_URL}/api/admin/coupon-details/${couponCode.trim().toUpperCase()}`,
      { timeout: 5000 },
    );

    const data = response.data;
    if (typeof data === "object" && data !== null) {
      const couponData: any = {};
      if (data.minAmount !== undefined)
        couponData.minAmount = Number(data.minAmount);
      if (data.maxAmount !== undefined)
        couponData.maxAmount = Number(data.maxAmount);
      if (data.discount !== undefined)
        couponData.discount = Number(data.discount);
      if (data.expireAt !== undefined)
        couponData.expireAt = String(data.expireAt);
      if (data.code !== undefined) couponData.code = String(data.code);
      return { success: true, couponData };
    }
    return { success: false, message: "Invalid coupon details response" };
  } catch (err: any) {
    return {
      success: false,
      message: err?.response?.data?.message || "Coupon not found",
    };
  }
};

export const applyCoupon = async (
  couponCode: string | undefined,
  userId: string,
  totalBeforeCoupon: number,
  isLocationUpdate: boolean,
  existingDiscount?: number,
  existingCoupon?: string,
): Promise<{
  discountAmount: number;
  usedCoupon: string | null;
  couponData: any;
  message: string | null;
}> => {
  if (!couponCode) {
    return {
      discountAmount: 0,
      usedCoupon: null,
      couponData: null,
      message: null,
    };
  }

  const couponCodeStr = String(couponCode).trim().toUpperCase();

  if (
    existingCoupon === couponCodeStr &&
    existingDiscount &&
    existingDiscount > 0
  ) {
    return {
      discountAmount: existingDiscount,
      usedCoupon: couponCodeStr,
      couponData: null,
      message: `Coupon "${couponCodeStr}" is already applied`,
    };
  }

  const couponDetails = await getCouponDetails(couponCodeStr);
  if (!couponDetails.success || !couponDetails.couponData) {
    return {
      discountAmount: 0,
      usedCoupon: null,
      couponData: null,
      message: couponDetails.message || "Invalid coupon code",
    };
  }

  const couponInfo = couponDetails.couponData;
  const { minAmount, maxAmount, expireAt } = couponInfo;

  if (expireAt && new Date(expireAt) < new Date()) {
    return {
      discountAmount: 0,
      usedCoupon: null,
      couponData: null,
      message: "This coupon has expired",
    };
  }
  if (maxAmount && totalBeforeCoupon > maxAmount) {
    return {
      discountAmount: 0,
      usedCoupon: null,
      couponData: null,
      message: `Maximum applicable amount is ₹${maxAmount}`,
    };
  }
  if (minAmount && totalBeforeCoupon < minAmount) {
    return {
      discountAmount: 0,
      usedCoupon: null,
      couponData: null,
      message: `Minimum order amount is ₹${minAmount}`,
    };
  }

  const result = await validateCoupon(
    couponCodeStr,
    userId,
    totalBeforeCoupon,
    isLocationUpdate,
  );

  if (result.success && result.calculation?.discountApplied > 0) {
    return {
      discountAmount: result.calculation.discountApplied,
      usedCoupon: couponCodeStr,
      couponData: {
        discount: result.calculation.discountApplied,
        originalPrice: totalBeforeCoupon,
        finalPrice: totalBeforeCoupon - result.calculation.discountApplied,
        message: result.message,
        couponDetails: couponInfo,
      },
      message: result.message || "Coupon applied successfully",
    };
  }

  return {
    discountAmount: 0,
    usedCoupon: null,
    couponData: null,
    message: result.message || "Coupon validation failed",
  };
};
