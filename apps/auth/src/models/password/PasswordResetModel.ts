import { Crypto } from '@server/security';
import { Document, Schema, model } from 'mongoose';

export interface IPasswordReset extends Document {
  userId: string;
  token: string;
  changedAt?: Date;
  expiresAt?: Date;
  resetToken: (id: string) => string;
  createdAt: Date;
}

const PasswordResetSchema = new Schema<IPasswordReset>(
  {
    userId: {
      type: String,
      required: true,
      unique: true,
    },
    token: {
      type: String,
      required: true,
      unique: true,
    },
    changedAt: {
      type: Date,
      select: false,
    },
    expiresAt: Date,
    createdAt: {
      type: Date,
      default: Date.now,
      expires: 600,
    },
  },
  {
    timestamps: true,
    writeConcern: { w: 'majority', j: true, wtimeout: 5000 },
  },
);

PasswordResetSchema.index({ expiresAt: 1 });
PasswordResetSchema.index({ userId: 1, token: 1 });

PasswordResetSchema.methods.resetToken = function (id: string) {
  const resetToken = Crypto.randomHexString();
  this.token = Crypto.hash(resetToken);
  this.expiresAt = Date.now() + 10 * 60 * 1000;
  this.userId = id;
  return resetToken;
};

export const PasswordReset = model<IPasswordReset>(
  'PasswordReset',
  PasswordResetSchema,
);
