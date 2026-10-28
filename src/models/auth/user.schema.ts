import mongoose, { Document, Schema } from "mongoose";

export const APP_NAMES = ["TIZZYGO", "TIZZYOS"] as const;
export type AppName = (typeof APP_NAMES)[number];

export const APP_ROLES = {
  TIZZYGO: ["BUYER", "CUSTOMER"],
  TIZZYOS: ["SELLER", "FWS", "SHIPPING", "CAB", "RENT"],
} as const;

export type TizzyGoRole = (typeof APP_ROLES.TIZZYGO)[number];
export type TizzyOSRole = (typeof APP_ROLES.TIZZYOS)[number];

export type AppRole = TizzyGoRole | TizzyOSRole;

export interface IUserApp {
  app: AppName;
  roles: AppRole[];
}

export interface IUser extends Document {
  firstName: string;
  lastName?: string;

  username: string;
  connectAddress: string;

  displayName?: string;
  dateOfBirth?: Date;
  profilePhoto?: string;

  role: "super_admin" | "admin" | "team" | "business" | "user";
  status: "pending" | "active" | "suspended" | "disabled";

  // Optional app associations
  apps?: IUserApp[];

  connectVerified: boolean;
  connectVerifiedAt?: Date;

  phone?: string;
  phoneVerified: boolean;
  phoneVerifiedAt?: Date;

  recoveryConnect?: string;
  recoveryConnectVerified: boolean;
  recoveryConnectVerifiedAt?: Date;

  theme?: string;
  color?: string;

  termsAccepted: boolean;
  termsAcceptedAt?: Date;

  createdAt: Date;
  updatedAt: Date;
}

const appSchema = new Schema<IUserApp>(
  {
    app: {
      type: String,
      enum: APP_NAMES,
      required: true,
    },
    roles: {
      type: [String],
      default: [],
      validate: {
        validator: function (this: any, roles: string[]) {
          const appName = this.app;

          if (appName === "TIZZYGO") {
            return roles.every((role) =>
              (APP_ROLES.TIZZYGO as readonly string[]).includes(role),
            );
          }

          if (appName === "TIZZYOS") {
            return roles.every((role) =>
              (APP_ROLES.TIZZYOS as readonly string[]).includes(role),
            );
          }

          return false;
        },
        message: "Role is not valid for the selected app",
      },
    },
  },
  { _id: false },
);

export const userSchema = new Schema<IUser>(
  {
    firstName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },

    lastName: {
      type: String,
      trim: true,
      maxlength: 100,
    },

    username: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      minlength: 3,
      maxlength: 50,
    },

    connectAddress: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    displayName: {
      type: String,
      trim: true,
      maxlength: 200,
    },

    dateOfBirth: {
      type: Date,
    },

    profilePhoto: {
      type: String,
    },

    role: {
      type: String,
      enum: ["super_admin", "admin", "team", "business", "user"],
      default: "user",
      required: true,
    },

    status: {
      type: String,
      enum: ["pending", "active", "suspended", "disabled"],
      default: "pending",
    },

    // Optional: users can have zero, one, or multiple app associations.
    apps: {
      type: [appSchema],
      default: [],
    },

    connectVerified: {
      type: Boolean,
      default: false,
    },

    connectVerifiedAt: {
      type: Date,
    },

    phone: {
      type: String,
      trim: true,
    },

    phoneVerified: {
      type: Boolean,
      default: false,
    },

    phoneVerifiedAt: {
      type: Date,
    },

    recoveryConnect: {
      type: String,
      lowercase: true,
      trim: true,
    },

    recoveryConnectVerified: {
      type: Boolean,
      default: false,
    },

    recoveryConnectVerifiedAt: {
      type: Date,
    },

    theme: {
      type: String,
      required: false,
    },

    color: {
      type: String,
      required: false,
    },

    termsAccepted: {
      type: Boolean,
      required: true,
      default: false,
    },

    termsAcceptedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  },
);
