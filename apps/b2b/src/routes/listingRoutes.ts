import { Role } from '@server/types';
import { validationRequest } from '@server/validator';
import express, { Router } from 'express';
import { authProtect } from '../controller/protectController';
import { ListingServices } from '../services/ListingServices';
import { ZodId, ZodListingSchema } from '../validators/ZodListingSchema';
import { ZodQuerySchema } from '../validators/ZodQuerySchema';

const router: Router = express.Router();

router.use(
  authProtect.validateToken,
  authProtect.requireAuth,
  authProtect.restrictTo(Role.SUPER_ADMIN),
);

router
  .route('/')
  .post(validationRequest({ body: ZodListingSchema }), ListingServices.create)
  .get(validationRequest({ query: ZodQuerySchema }), ListingServices.find);

router
  .route('/:id')
  .all(validationRequest({ params: ZodId }))
  .patch(
    validationRequest({ body: ZodListingSchema }),
    ListingServices.findOneAndUpdate,
  )
  .get(ListingServices.findById)
  .delete(ListingServices.findOneAndDelete);

export default router;
