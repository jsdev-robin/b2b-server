import { model, Model, Schema } from 'mongoose';
import { ISession } from './types';

export const SessionSchema = new Schema<ISession>(
  {
    token: {
      type: String,
      required: true,
    },

    deviceInfo: {
      deviceType: String,
      os: String,
      browser: String,
      userAgent: String,
    },

    location: {
      city: String,
      country: String,
      lat: Number,
      lng: Number,
    },

    ip: {
      type: String,
    },

    status: {
      type: Boolean,
      default: true,
      index: true,
    },

    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
    },

    loggedInAt: {
      type: Date,
      default: Date.now,
    },

    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
    writeConcern: { w: 'majority', j: true, wtimeout: 5000 },
  },
);

// Prevent duplicate token per user
SessionSchema.index({ user: 1, token: 1 }, { unique: true });

// Fast lookup active sessions per user
SessionSchema.index({ user: 1, status: 1 });

// TTL index for automatic expiration
SessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const SessionModel: Model<ISession> = model<ISession>(
  'Session',
  SessionSchema,
);
