export function generateOrderId(): string {
  const part1 = Math.random().toString(36).substring(2, 10).toUpperCase();
  const part3 = Math.random().toString(36).substring(2, 11).toUpperCase();
  return `ORD-${part1}-COD-${part3}`;
}

export const extractBuyerAddress = (
  checkoutSession: any,
  cartSnapshot: any,
) => {
  let buyerAddressData: any = {
    address: "Address not specified",
    latitude: 0,
    longitude: 0,
    googlePlaceId: "",
    placeId: "",
  };

  // Priority 1: Checkout session address
  if (checkoutSession.address && checkoutSession.address.address) {
    buyerAddressData = {
      address: checkoutSession.address.address,
      latitude: checkoutSession.address.latitude || 0,
      longitude: checkoutSession.address.longitude || 0,
      googlePlaceId: checkoutSession.address.googlePlaceId || "",
      placeId:
        checkoutSession.address.placeId ||
        checkoutSession.address.googlePlaceId ||
        "",
    };
  }

  // Priority 2: Cart snapshot buyerLocation (backup)
  if (cartSnapshot.buyerLocation && cartSnapshot.buyerLocation.address) {
    if (
      !buyerAddressData.googlePlaceId &&
      cartSnapshot.buyerLocation.googlePlaceId
    ) {
      buyerAddressData.googlePlaceId = cartSnapshot.buyerLocation.googlePlaceId;
    }
    if (!buyerAddressData.placeId && cartSnapshot.buyerLocation.placeId) {
      buyerAddressData.placeId = cartSnapshot.buyerLocation.placeId;
    }
    if (
      buyerAddressData.address === "Address not specified" &&
      cartSnapshot.buyerLocation.address
    ) {
      buyerAddressData.address = cartSnapshot.buyerLocation.address;
    }
    if (!buyerAddressData.latitude && cartSnapshot.buyerLocation.latitude) {
      buyerAddressData.latitude = cartSnapshot.buyerLocation.latitude;
    }
    if (!buyerAddressData.longitude && cartSnapshot.buyerLocation.longitude) {
      buyerAddressData.longitude = cartSnapshot.buyerLocation.longitude;
    }
  }

  return buyerAddressData;
};

export const extractSellerAddress = (cartSnapshot: any, firstItem: any) => {
  let sellerAddressData: any = {
    address: "Default Seller Address",
    latitude: 0,
    longitude: 0,
    googlePlaceId: "",
    placeId: "",
  };

  // Priority 1: Cart snapshot sellerLocation
  if (cartSnapshot.sellerLocation && cartSnapshot.sellerLocation.address) {
    sellerAddressData = {
      address: cartSnapshot.sellerLocation.address,
      latitude: cartSnapshot.sellerLocation.latitude || 0,
      longitude: cartSnapshot.sellerLocation.longitude || 0,
      googlePlaceId: cartSnapshot.sellerLocation.googlePlaceId || "",
      placeId:
        cartSnapshot.sellerLocation.placeId ||
        cartSnapshot.sellerLocation.googlePlaceId ||
        "",
    };
  }

  // Priority 2: Product data mein sellerLocation
  if (
    (!sellerAddressData.address ||
      sellerAddressData.address === "Default Seller Address") &&
    firstItem.productData?.sellerLocation &&
    firstItem.productData.sellerLocation.address
  ) {
    sellerAddressData = {
      address: firstItem.productData.sellerLocation.address,
      latitude: firstItem.productData.sellerLocation.latitude || 0,
      longitude: firstItem.productData.sellerLocation.longitude || 0,
      googlePlaceId: firstItem.productData.sellerLocation.googlePlaceId || "",
      placeId:
        firstItem.productData.sellerLocation.placeId ||
        firstItem.productData.sellerLocation.googlePlaceId ||
        "",
    };
  }

  // Priority 3: Old format (backward compatibility)
  if (
    (!sellerAddressData.address ||
      sellerAddressData.address === "Default Seller Address") &&
    firstItem.productData?.sellerAddress
  ) {
    sellerAddressData = {
      address: firstItem.productData.sellerAddress,
      latitude: firstItem.productData.sellerLatitude || 0,
      longitude: firstItem.productData.sellerLongitude || 0,
      googlePlaceId: firstItem.productData.sellerGooglePlaceId || "",
      placeId:
        firstItem.productData.sellerPlaceId ||
        firstItem.productData.sellerGooglePlaceId ||
        "",
    };
  }

  return sellerAddressData;
};

export const formatAddress = (addressData: any) => {
  return {
    address: addressData.address || "Address not specified",
    googlePlaceId: addressData.googlePlaceId || addressData.placeId || "",
    latitude: addressData.latitude || addressData.lat || 0,
    longitude: addressData.longitude || addressData.lng || 0,
  };
};

export const generateTempGooglePlaceId = (address: string): string => {
  if (
    address &&
    address !== "Address not specified" &&
    address !== "Default Seller Address"
  ) {
    return `TEMP_${Buffer.from(address).toString("base64").substring(0, 20)}`;
  }
  return "";
};

export const serializeCouponData = (couponData: any): any => {
  if (!couponData) return null;

  if (
    couponData.constructor.name === "model" ||
    couponData._doc !== undefined
  ) {
    return couponData.toObject ? couponData.toObject() : couponData;
  }
  return couponData;
};
