import { IProfile } from '@server/types';
import { Schema } from 'mongoose';

export const ProfileSchema = new Schema<IProfile>(
  {
    familyName: { type: String },
    givenName: { type: String },
    avatar: {
      public_id: { type: String },
      url: { type: String },
    },
    email: { type: String },
  },
  { _id: false },
);
