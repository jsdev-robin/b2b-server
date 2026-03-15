import { Decipheriv } from '@server/security';
import { Document, Types } from 'mongoose';

export enum Role {
  SUPER_ADMIN = 'SUPER_ADMIN',
  STORE_OWNER = 'STORE_OWNER',
  GUEST = 'GUEST',
}

export interface IProfile extends Document {
  familyName: string;
  givenName: string;
  displayName: string;
  avatar?: {
    public_id: string | undefined;
    url: string | undefined;
  };
  email: string;
}

export interface IAuth extends Document {
  password?: string | undefined;
  isVerified: boolean;
  passKeys: {
    enabled: boolean;
    count: number;
    lastUsedAt: Date;
  };
  twoFA: {
    enabled: boolean;
    backupCodes: Decipheriv[];
    secret: Decipheriv;
  };
}

export interface IUser extends Document {
  __v?: number;
  _id: Types.ObjectId;
  id: string;
  profile: IProfile;
  auth: IAuth;
  role: Role;
  checkPassword: (plainPassword: string) => Promise<boolean>;
}
