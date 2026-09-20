import "dotenv/config";

const imports = [
  "./src/routes/tizzygo/auths/authRoutes",
  "./src/routes/tizzygo/auths/colorRoutes",
  "./src/routes/tizzygo/cart/addToCartRoutes",
  "./src/routes/tizzygo/shop/buynowRoutes",
  "./src/routes/tizzygo/social/commentRoutes",
  "./src/routes/tizzygo/social/likeRoutes",
  "./src/routes/tizzygo/social/ratingRoutes",
  "./src/routes/tizzygo/profile/profileRoutes",
  "./src/routes/tizzygo/social/shareRoutes",
  "./src/routes/tizzygo/buynow/buynowRoutes",
  "./src/routes/tizzygo/buynow/paymentRoutes",
  "./src/routes/tizzygo/cart/cartCheckoutRoutes",
  "./src/routes/tizzygo/buynow/process-paymentRoutes",
  "./src/routes/tizzygo/search/searchRoutes",
  "./src/routes/tizzygo/buynow/confirm-codRoutes",
  "./src/routes/tizzygo/theme/theme",
  "./src/routes/tizzygo/orders/deliveryRoutes",
  "./src/routes/tizzygo/orders/deliveryTrackingRoutes",
  "./src/routes/tizzygo/locations/locationsRoutes",

  "./src/routes/tizzyos/user/meRoutes",
  "./src/routes/tizzyos/seller/sellerRoutes",
  "./src/routes/tizzyos/seller/statusRoutes",
  "./src/routes/tizzyos/rider/riderRoutes",
  "./src/routes/tizzyos/rider/adminRoutes",
  "./src/routes/tizzyos/story/storyRoutes",
  "./src/routes/tizzyos/seller/AddProducts/pricingCalculationRoutes",
  "./src/routes/tizzyos/seller/AddProducts/ProductRoutes",
  "./src/routes/tizzyos/category",
  "./src/routes/tizzyos/seller/AddProducts/uploadRoutes",
  "./src/routes/tizzyos/Products/ProductRoutes",
  "./src/routes/tizzyos/theme/theme",
  "./src/routes/tizzyos/shipping/orders/orderRoutes",
  "./src/routes/tizzyos/shipping/fws/fwsRegisterRoutes",
  "./src/routes/tizzyos/shipping/fws/fwsRiderOnlineRoutes",
  "./src/routes/tizzyos/shipping/fws/fwsSearchRiderIdRoutes",
  "./src/routes/tizzyos/shipping/fws/fwsRiderLocationRoutes",
  "./src/routes/tizzyos/shipping/orders/deliveryTrackingRoutes",
  "./src/routes/tizzyos/seller/PayOut/walletSetupRoutes",
  "./src/routes/tizzyos/seller/locations/locationsRoutes",
  "./src/routes/tizzyos/shipping/orders/trackingStatus",
  "./src/routes/tizzyos/shipping/orders/trackOrderRoutes",
  "./src/routes/tizzyos/fws/fwsApplicationRoutes",
  "./src/routes/tizzyos/fws/employeeRoutes",
  "./src/routes/tizzyos/shipping/orders/deliverdWithOTPRoutes",

  "./src/routes/tizzyos/cab/rideVehicleCatigory",
  "./src/routes/tizzyos/cab/registerRideDriver",
  "./src/routes/tizzyos/cab/rideOnlineDriver",
  "./src/routes/tizzyos/cab/rideLocationRoutes",
  "./src/routes/tizzyos/cab/rideBookingRoutes",
  "./src/routes/tizzyos/cab/rideTypeRoutes",
  "./src/routes/tizzyos/cab/rideTrackingRoutes",
  "./src/routes/tizzyos/cab/rideRequestRoutes",
  "./src/routes/tizzyos/cab/rideLiveTrackingRoutes",
];

for (const modulePath of imports) {
  console.log(`\n========== ${modulePath} ==========`);

  try {
    require(modulePath);
    console.log("✅ CLEAN");
  } catch (error) {
    console.log("❌ ERROR");
    console.error(error);
  }
}