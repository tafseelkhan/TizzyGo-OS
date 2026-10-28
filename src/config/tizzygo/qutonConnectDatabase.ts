import mongoose from "mongoose";

import {
  userSchema,
  type IUser,
} from "../../models/auth/user.schema";

import {
  userCredentialsSchema,
  type IUserCredentials,
} from "../../models/auth/userCredentials";

import {
  userSessionSchema,
  type IUserSession,
} from "../../models/auth/userSession";

import {
  verificationCodeSchema,
  type IVerificationCode,
} from "../../models/auth/verificationCode";

let qutonConnection: mongoose.Connection | null = null;

/**
 * Register the four Quton Connect authentication models on the
 * dedicated connection. Guarded so that a reconnect on a fresh
 * connection object cannot throw OverwriteModelError.
 */
function registerQutonModels(connection: mongoose.Connection) {
  if (!connection.models.User) {
    connection.model<IUser>("User", userSchema);
  }

  if (!connection.models.UserCredentials) {
    connection.model<IUserCredentials>(
      "UserCredentials",
      userCredentialsSchema,
    );
  }

  if (!connection.models.UserSession) {
    connection.model<IUserSession>(
      "UserSession",
      userSessionSchema,
    );
  }

  if (!connection.models.VerificationCode) {
    connection.model<IVerificationCode>(
      "VerificationCode",
      verificationCodeSchema,
    );
  }
}

export async function connectQutonConnectDB() {
  const uri = process.env.QUTON_CONNECT_MONGO_URI;

  if (!uri) {
    throw new Error("QUTON_CONNECT_MONGO_URI is missing");
  }

  const connection = mongoose.createConnection(uri, {
    autoCreate: false,
    autoIndex: false,
  });

  try {
    await connection.asPromise();

    registerQutonModels(connection);

    qutonConnection = connection;

    console.log("✅ Quton Connect database connected");
    console.log("✅ Four authentication models registered on Quton connection");
  } catch (error) {
    await connection.close().catch(() => undefined);
    throw error;
  }
}

export function getQutonConnectModels() {
  if (!qutonConnection || qutonConnection.readyState !== 1) {
    throw new Error("Quton Connect database is not connected");
  }

  return {
    User: qutonConnection.model<IUser>("User"),
    UserCredentials: qutonConnection.model<IUserCredentials>(
      "UserCredentials",
    ),
    UserSession: qutonConnection.model<IUserSession>("UserSession"),
    VerificationCode: qutonConnection.model<IVerificationCode>(
      "VerificationCode",
    ),
  };
}