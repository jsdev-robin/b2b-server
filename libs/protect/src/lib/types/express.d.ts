import { IUser, Role } from '@server/types';
import 'express';

declare global {
  namespace Express {
    interface Request {
      userId: string;
      accessToken: string;
      self: IUser;
      role: Role;
    }
  }
}
