import mongoose, { Document, Model, Schema } from 'mongoose';

export interface IListing extends Document {
  title: string;
  price: number;
  category: string;
  description: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const ListingSchema: Schema<IListing> = new Schema<IListing>(
  {
    title: { type: String, required: true, trim: true },
    price: { type: Number, required: true, min: 0 },
    category: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
  },
  {
    timestamps: true,
    writeConcern: { w: 'majority', j: true, wtimeout: 5000 },
  },
);

export const ListingModel: Model<IListing> = mongoose.model<IListing>(
  'Listing',
  ListingSchema,
);
