import { Protect } from '@server/protect';
import { UserModel } from '../models/user/UserModel';
import { AuthService } from '../services/auth/AuthServices';

export const authController = new AuthService({
  model: UserModel,
});

export const authProtect = new Protect();
