export interface Rider {
  _id?: string;
  fullName: string;
  dateOfBirth: Date;
  gender: 'Male' | 'Female' | 'Other';
  phoneNumber: string;
  email: string;
  currentAddress: string;
  city: string;
  state: string;
  pincode: string;
  aadhaarNumber?: string;
  panNumber?: string;
  aadhaarFrontImage?: string;
  aadhaarBackImage?: string;
  panFrontImage?: string;
  panBackImage?: string;
  drivingLicenseNumber: string;
  licenseExpiryDate: Date;
  drivingLicensePhoto: string;

  // Vehicle Info
  vehicleType: 'Auto' | 'Bike' | 'Scooter' | 'Car';
  vehicleCompany: string;       // ex: Maruti, Toyota, Honda
  vehicleModel: string;         // ex: Swift, Innova, Activa, Pulsar
  vehicleRegistrationNumber: string;
  vehicleInsuranceCopy: string;

  status: 'Pending' | 'Approved' | 'Rejected';
  riderId?: string;
  reason?: string;
}

export interface ApproveRequest {
  riderId: string;
}

export interface RejectRequest {
  reason: string;
}

export interface PendingRequest {
  reason: string;
}
