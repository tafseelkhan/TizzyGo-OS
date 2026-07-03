export interface IRouteService {
  getRoute(params: IRouteParams): Promise<IRouteResult>;
  refreshRoute(params: IRefreshRouteParams): Promise<IRouteResult | null>;
  shouldRefreshRoute(params: IShouldRefreshParams): boolean;
}

export interface IRouteParams {
  origin: {
    latitude: number;
    longitude: number;
    address?: string;
  };
  destination: {
    latitude: number;
    longitude: number;
    address?: string;
  };
  travelMode?: "DRIVE" | "TWO_WHEELER" | "WALK" | "TRANSIT";
  routingPreference?: "TRAFFIC_AWARE" | "TRAFFIC_UNAWARE";
}

export interface IRouteResult {
  roadDistanceKm: number;
  normalDurationMinutes: number;
  trafficDurationMinutes: number;
  encodedPolyline: string;
  routeSummary: {
    startAddress: string;
    endAddress: string;
    durationText: string;
    distanceText: string;
    steps: IRouteStep[];
  };
}

export interface IRouteStep {
  distance: number;
  duration: number;
  instruction: string;
  polyline: string;
  travelMode: string;
  maneuver: string;
}

export interface IRefreshRouteParams {
  bookingId: string;
  currentLocation: {
    latitude: number;
    longitude: number;
  };
  forceRefresh?: boolean;
}

export interface IShouldRefreshParams {
  distanceSinceLastRefreshKm: number;
  timeSinceLastRefreshMinutes: number;
  isOffRoute: boolean;
  isCustomerTracking: boolean;
  routeData: IRouteResult;
  currentLocation: {
    latitude: number;
    longitude: number;
  };
}
