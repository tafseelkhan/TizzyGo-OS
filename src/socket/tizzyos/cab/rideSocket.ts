import { Server, Socket } from "socket.io";

interface AuthenticateData {
  userId: string;
  userType: "customer" | "driver";
}

interface DriverLocationData {
  latitude: number;
  longitude: number;
  heading?: number;
  speed?: number;
  accuracy?: number;
  bearing?: number;
  altitude?: number;
  provider?: string;
  batteryLevel?: number;
  networkType?: string;
  isMockLocation?: boolean;
}

interface DriverStatusData {
  isOnline: boolean;
  isAvailable: boolean;
}

interface CustomerLocationData {
  latitude: number;
  longitude: number;
}

export class RideSocketService {
  private static instance: RideSocketService;
  private io: Server | null = null;
  private customerSockets: Map<string, string> = new Map();
  private driverSockets: Map<string, string> = new Map();
  private socketRooms: Map<string, string> = new Map();

  private constructor() {}

  static getInstance(): RideSocketService {
    if (!RideSocketService.instance) {
      RideSocketService.instance = new RideSocketService();
    }
    return RideSocketService.instance;
  }

  initialize(io: Server): void {
    this.io = io;
    this.setupSocketHandlers();
  }

  private setupSocketHandlers(): void {
    if (!this.io) return;

    this.io.on("connection", (socket: Socket) => {
      console.log(`Socket connected: ${socket.id}`);

      socket.on("authenticate", (data: AuthenticateData) => {
        this.handleAuthentication(socket, data);
      });

      socket.on("disconnect", () => {
        this.handleDisconnect(socket);
      });

      socket.on("driver-location-update", (data: DriverLocationData) => {
        this.handleDriverLocationUpdate(socket, data);
      });

      socket.on("driver-status-update", (data: DriverStatusData) => {
        this.handleDriverStatusUpdate(socket, data);
      });

      socket.on("customer-location-update", (data: CustomerLocationData) => {
        this.handleCustomerLocationUpdate(socket, data);
      });
    });
  }

  private handleAuthentication(socket: Socket, data: AuthenticateData): void {
    const { userId, userType } = data;

    if (!userId || !userType) {
      socket.emit("authentication-failed", {
        message: "Invalid authentication data",
      });
      return;
    }

    if (userType === "customer") {
      this.customerSockets.set(userId, socket.id);
      socket.join(`customer-${userId}`);
      socket.emit("authentication-success", { userId, userType });
    } else if (userType === "driver") {
      this.driverSockets.set(userId, socket.id);
      socket.join(`driver-${userId}`);
      socket.emit("authentication-success", { userId, userType });
    } else {
      socket.emit("authentication-failed", {
        message: "Invalid user type",
      });
      return;
    }

    this.socketRooms.set(socket.id, userId);
    console.log(`User ${userId} authenticated as ${userType}`);
  }

  private handleDisconnect(socket: Socket): void {
    const userId = this.socketRooms.get(socket.id);
    if (userId) {
      // Remove from customer sockets
      for (const [key, value] of this.customerSockets.entries()) {
        if (value === socket.id) {
          this.customerSockets.delete(key);
          break;
        }
      }
      // Remove from driver sockets
      for (const [key, value] of this.driverSockets.entries()) {
        if (value === socket.id) {
          this.driverSockets.delete(key);
          break;
        }
      }
      this.socketRooms.delete(socket.id);
      console.log(`User ${userId} disconnected`);
    }
  }

  private handleDriverLocationUpdate(
    socket: Socket,
    data: DriverLocationData,
  ): void {
    const userId = this.socketRooms.get(socket.id);
    if (userId) {
      // Forward to all customers tracking this driver
      // Implementation would depend on your business logic
      console.log(`Driver ${userId} location update:`, data);
    }
  }

  private handleDriverStatusUpdate(
    socket: Socket,
    data: DriverStatusData,
  ): void {
    const userId = this.socketRooms.get(socket.id);
    if (userId) {
      console.log(`Driver ${userId} status update:`, data);
    }
  }

  private handleCustomerLocationUpdate(
    socket: Socket,
    data: CustomerLocationData,
  ): void {
    const userId = this.socketRooms.get(socket.id);
    if (userId) {
      console.log(`Customer ${userId} location update:`, data);
    }
  }

  emitToCustomer(customerId: string, event: string, data: any): boolean {
    if (!this.io) return false;
    const socketId = this.customerSockets.get(customerId);
    if (socketId) {
      this.io.to(socketId).emit(event, data);
      return true;
    }
    return false;
  }

  emitToDriver(
    driverId: string,
    event: string,
    data: any,
    socketId?: string,
  ): boolean {
    if (!this.io) return false;
    const targetSocketId = socketId || this.driverSockets.get(driverId);
    if (targetSocketId) {
      this.io.to(targetSocketId).emit(event, data);
      return true;
    }
    return false;
  }

  emitLiveLocation(
    customerId: string,
    bookingId: string,
    location: any,
  ): boolean {
    return this.emitToCustomer(customerId, "ride-live-location", {
      bookingId,
      location,
      timestamp: new Date().toISOString(),
    });
  }

  emitToRoom(room: string, event: string, data: any): boolean {
    if (!this.io) return false;
    this.io.to(room).emit(event, data);
    return true;
  }

  broadcastToAll(event: string, data: any): boolean {
    if (!this.io) return false;
    this.io.emit(event, data);
    return true;
  }

  getCustomerSocketId(customerId: string): string | undefined {
    return this.customerSockets.get(customerId);
  }

  getDriverSocketId(driverId: string): string | undefined {
    return this.driverSockets.get(driverId);
  }

  isCustomerOnline(customerId: string): boolean {
    return this.customerSockets.has(customerId);
  }

  isDriverOnline(driverId: string): boolean {
    return this.driverSockets.has(driverId);
  }

  getOnlineCustomers(): string[] {
    return Array.from(this.customerSockets.keys());
  }

  getOnlineDrivers(): string[] {
    return Array.from(this.driverSockets.keys());
  }

  getTotalConnections(): number {
    return this.socketRooms.size;
  }

  disconnectUser(userId: string): void {
    const socketId =
      this.customerSockets.get(userId) || this.driverSockets.get(userId);
    if (socketId) {
      this.io?.to(socketId).disconnectSockets();
    }
  }

  clearAllConnections(): void {
    this.customerSockets.clear();
    this.driverSockets.clear();
    this.socketRooms.clear();
  }
}
