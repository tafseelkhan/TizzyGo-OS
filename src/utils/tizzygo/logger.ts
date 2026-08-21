// ============================================================
// utils/logger.ts
// ============================================================

type LogLevel = "info" | "warn" | "error" | "debug" | "fatal";

export interface LogContext {
  requestId?: string;
  paymentId?: string;
  gatewayOrderId?: string;
  checkoutSessionId?: string;
  transactionId?: string;
  eventType?: string;
  lockOwner?: string;
  retryAttempt?: number;
  processingTime?: number;
  userId?: string;
  orderId?: string;
  serverInstance?: string;
  correlationId?: string;
  [key: string]: any;
}

interface LogEntry {
  level: LogLevel;
  event?: string;
  message: string;
  timestamp: string;
  context: LogContext;
  error?: any;
}

class Logger {
  private static instance: Logger;
  private serverInstance: string;

  private constructor() {
    this.serverInstance =
      process.env.HOSTNAME ||
      process.env.POD_NAME ||
      crypto.randomUUID().slice(0, 8);
  }

  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  private formatLog(entry: LogEntry): string {
    const { level, event, message, timestamp, context, error } = entry;

    // Build structured log line
    const parts: string[] = [
      `[${timestamp}]`,
      level.toUpperCase(),
      event || "GENERAL",
      `msg="${message}"`,
      `instance="${this.serverInstance}"`,
    ];

    // Add context fields
    for (const [key, value] of Object.entries(context)) {
      if (value !== undefined && value !== null && value !== "") {
        if (typeof value === "object") {
          parts.push(`${key}="${JSON.stringify(value).replace(/"/g, '\\"')}"`);
        } else {
          parts.push(`${key}="${value}"`);
        }
      }
    }

    // Add error if present
    if (error) {
      if (error instanceof Error) {
        parts.push(`error="${error.message.replace(/"/g, '\\"')}"`);
        if (error.stack) {
          parts.push(`stack="${error.stack.replace(/"/g, '\\"')}"`);
        }
        if ((error as any).code) {
          parts.push(`code="${(error as any).code}"`);
        }
      } else if (typeof error === "string") {
        parts.push(`error="${error.replace(/"/g, '\\"')}"`);
      } else {
        parts.push(`error="${JSON.stringify(error).replace(/"/g, '\\"')}"`);
      }
    }

    return parts.join(" ");
  }

  public info(event: string, message: string, context: LogContext = {}): void {
    this.log("info", event, message, context);
  }

  public warn(event: string, message: string, context: LogContext = {}): void {
    this.log("warn", event, message, context);
  }

  public error(
    event: string,
    message: string,
    context: LogContext = {},
    error?: any,
  ): void {
    this.log("error", event, message, context, error);
  }

  public fatal(
    event: string,
    message: string,
    context: LogContext = {},
    error?: any,
  ): void {
    this.log("fatal", event, message, context, error);
  }

  public debug(event: string, message: string, context: LogContext = {}): void {
    if (process.env.NODE_ENV === "development") {
      this.log("debug", event, message, context);
    }
  }

  private log(
    level: LogLevel,
    event: string,
    message: string,
    context: LogContext = {},
    error?: any,
  ): void {
    // Always include server instance
    context.serverInstance = this.serverInstance;

    // Ensure correlationId for tracing
    if (!context.correlationId && context.requestId) {
      context.correlationId = context.requestId;
    }

    const entry: LogEntry = {
      level,
      event,
      message,
      timestamp: new Date().toISOString(),
      context,
      error,
    };

    const formatted = this.formatLog(entry);

    switch (level) {
      case "fatal":
      case "error":
        console.error(formatted);
        break;
      case "warn":
        console.warn(formatted);
        break;
      case "info":
        console.log(formatted);
        break;
      case "debug":
        console.debug(formatted);
        break;
    }
  }
}

import crypto from "crypto";
export const logger = Logger.getInstance();
