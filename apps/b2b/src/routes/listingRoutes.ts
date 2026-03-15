import { validationRequest } from '@server/validator';
import express, { Router } from 'express';
import { ListingServices } from '../services/ListingServices';
import { ZodListingSchema } from '../validators/ZodListingSchema';
import { ZodQuerySchema } from '../validators/ZodQuerySchema';

const router: Router = express.Router();

router
  .route('/')
  .post(validationRequest({ body: ZodListingSchema }), ListingServices.create)
  .get(validationRequest({ query: ZodQuerySchema }), ListingServices.find);

router
  .route('/:id')
  .patch(
    validationRequest({ body: ZodListingSchema }),
    ListingServices.findByIdAndUpdate,
  )
  .get(ListingServices.findById)
  .delete(ListingServices.findByIdAndDelete);

export default router;
