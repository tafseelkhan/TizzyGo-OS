// src/modules/tracking/tracking.validation.ts

import Joi from "joi";

export const validateProximityRequest = (params: any) => {
  const schema = Joi.object({
    orderId: Joi.string().required().pattern(/^ORD/).messages({
      "string.pattern.base": "Order ID must start with ORD",
      "any.required": "Order ID is required",
    }),
  });

  return schema.validate(params);
};

export const validateLiveTrackingRequest = (params: any) => {
  const schema = Joi.object({
    orderId: Joi.string().required().pattern(/^ORD/).messages({
      "string.pattern.base": "Order ID must start with ORD",
      "any.required": "Order ID is required",
    }),
  });

  return schema.validate(params);
};
