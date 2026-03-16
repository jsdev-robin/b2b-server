import { IUser, Role } from '@server/types';
import { compare, hash } from 'bcryptjs';
import { model, Model, Schema } from 'mongoose';
import { AuthSchema } from './schemas/AuthSchema';
import { ProfileSchema } from './schemas/ProfileSchema';

const UserSchema = new Schema<IUser>(
  {
    profile: ProfileSchema,
    auth: AuthSchema,
    role: {
      type: String,
      default: Role.GUEST,
      immutable: true,
    },
  },
  {
    writeConcern: { w: 'majority', j: true, wtimeout: 5000 },
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(_, ret: unknown) {
        const r = ret as { auth?: { password?: string }; __v?: unknown };
        delete r.auth?.password;
        delete r.__v;
        return r;
      },
    },
    toObject: {
      virtuals: true,
      transform(_, ret: unknown) {
        const r = ret as { auth?: { password?: string }; __v?: unknown };
        delete r.auth?.password;
        delete r.__v;
        return r;
      },
    },
  },
);

UserSchema.index({ 'profile.email': 1 }, { unique: true });
UserSchema.index({ 'profile.email': 1, role: 1 });
UserSchema.index({ role: 1, createdAt: -1 });
UserSchema.index({
  'profile.familyName': 'text',
  'profile.givenName': 'text',
  'profile.email': 'text',
});

UserSchema.virtual('profile.displayName').get(function (this: IUser) {
  return `${this.profile.familyName} ${this.profile.givenName}`.trim();
});

UserSchema.pre('save', async function () {
  if (this.isModified('auth.password') && this.auth.password) {
    this.auth.password = await hash(this.auth.password, 12);
  }
});

UserSchema.methods.checkPassword = async function (
  this: IUser,
  plainPassword: string,
): Promise<boolean> {
  return await compare(plainPassword, String(this.auth.password));
};

export const UserModel: Model<IUser> = model<IUser>('User', UserSchema);
