export interface ISession {
  token?: string;
  deviceInfo?: {
    deviceType: string;
    os: string;
    browser: string;
    userAgent: string;
  };
  ip?: string;
  location?: {
    city: string;
    country: string;
    lat: number;
    lng: number;
  };
  status?: boolean;
  loggedInAt?: Date;
  expiresAt?: Date;

  user: Types.ObjectId;
}
