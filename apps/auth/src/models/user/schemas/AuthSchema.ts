import { IAuth } from '@server/types';
import { Schema } from 'mongoose';

export const AuthSchema = new Schema<IAuth>(
  {
    password: { type: String, select: false },
    isVerified: { type: Boolean, default: false },
    passKeys: {
      enabled: { type: Boolean, default: false },
      count: { type: Number, default: 0 },
      lastUsedAt: { type: Date },
    },
    twoFA: {
      enabled: { type: Boolean, default: false },
      backupCodes: {
        type: [
          {
            salt: { type: String, required: true, select: false },
            iv: { type: String, required: true, select: false },
            data: { type: String, required: true, select: false },
          },
        ],
        select: false,
      },
      secret: {
        type: {
          salt: { type: String },
          iv: { type: String },
          data: { type: String },
        },
        select: false,
        _id: false,
      },
    },
  },
  { _id: false },
);
