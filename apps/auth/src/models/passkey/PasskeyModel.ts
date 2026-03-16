import {
  AuthenticatorTransportFuture,
  Uint8Array_,
} from '@simplewebauthn/server';
import { Document, Model, model, Schema, Types } from 'mongoose';

interface Passkey extends Document {
  user: Types.ObjectId;
  name?: string;
  device?: string;
  browser?: string;
  formFactor?: string;
  webAuthnUserID: Uint8Array_;
  credentialID: string;
  id: string;
  publicKey: string;
  counter: number;
  transports: AuthenticatorTransportFuture[];
  deviceType: string;
  backedUp: boolean;
  createdAt: Date;
}

const passkeySchema = new Schema<Passkey>(
  {
    user: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    name: { type: String },
    device: { type: String },
    browser: { type: String },
    formFactor: { type: String },
    webAuthnUserID: { type: String, required: true },
    credentialID: { type: String, required: true, unique: true },
    id: { type: String, required: true, unique: true },
    publicKey: { type: String, required: true },
    counter: { type: Number, required: true },
    transports: { type: [String], required: true },
    deviceType: { type: String, required: true },
    backedUp: { type: Boolean, required: true },
  },
  {
    timestamps: true,
    writeConcern: { w: 'majority', j: true, wtimeout: 5000 },
  },
);

passkeySchema.index({ user: 1 });

export const Passkey: Model<Passkey> = model<Passkey>('Passkey', passkeySchema);
