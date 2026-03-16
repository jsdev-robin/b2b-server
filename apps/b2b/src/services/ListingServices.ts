import { HTTPException } from '@server/middlewares';
import { catchAsync, Status, StatusCodes } from '@server/utils';
import { NextFunction, Request, RequestHandler, Response } from 'express';
import mongoose from 'mongoose';
import z from 'zod';
import { ListingModel } from '../models/Listing';
import QueryFind from '../utils/QueryFind';
import { ZodId, ZodListingSchema } from '../validators/ZodListingSchema';
import { ZodQuerySchema } from '../validators/ZodQuerySchema';

export class ListingServices {
  static create: RequestHandler = catchAsync(
    async (
      req: Request<unknown, unknown, z.infer<typeof ZodListingSchema>>,
      res: Response,
    ): Promise<void> => {
      // created document
      const data = await ListingModel.create({
        user: new mongoose.Types.ObjectId(req.self._id),
        ...req.body,
      });

      // respond with created listing
      res.status(StatusCodes.CREATED).json({
        status: Status.CREATED,
        message: 'Service listing created successfully',
        payload: { service: data },
      });
    },
  );

  static find: RequestHandler = catchAsync(
    async (
      req: Request<unknown, unknown, unknown, z.infer<typeof ZodQuerySchema>>,
      res: Response,
    ): Promise<void> => {
      // base query for current user's listings
      const baseQuery = ListingModel.find({
        user: new mongoose.Types.ObjectId(req.self._id),
      });

      // apply filters, sorting, field limiting, pagination
      const query = new QueryFind(baseQuery, req.query)
        .filter()
        .sort()
        .limitFields()
        .paginate().query;

      // total listings count
      const totalCount = ListingModel.countDocuments();

      // execute query and count
      const [data, total] = await Promise.all([query, totalCount]);

      // respond with listings
      res.status(StatusCodes.OK).json({
        status: Status.SUCCESS,
        message: 'All service listings fetched successfully',
        payload: { data, total },
      });
    },
  );

  static findById: RequestHandler = catchAsync(
    async (
      req: Request<z.infer<typeof ZodId>, unknown, unknown>,
      res: Response,
      next: NextFunction,
    ): Promise<void> => {
      // find listing by id for current user
      const data = await ListingModel.findOne({
        $and: [
          { _id: new mongoose.Types.ObjectId(req.params.id) },
          { user: new mongoose.Types.ObjectId(req.self._id) },
        ],
      });

      // if not found, throw error
      if (!data) {
        return next(
          new HTTPException('Service listing not found', StatusCodes.NOT_FOUND),
        );
      }

      // respond with found listing
      res.status(StatusCodes.OK).json({
        status: Status.SUCCESS,
        message: 'Service listing fetched successfully',
        payload: { service: data },
      });
    },
  );

  static findOneAndUpdate: RequestHandler = catchAsync(
    async (
      req: Request<
        z.infer<typeof ZodId>,
        unknown,
        z.infer<typeof ZodListingSchema>
      >,
      res: Response,
      next: NextFunction,
    ): Promise<void> => {
      // update listing by id for current user
      const data = await ListingModel.findOneAndUpdate(
        {
          $and: [
            { _id: new mongoose.Types.ObjectId(req.params.id) },
            { user: new mongoose.Types.ObjectId(req.self._id) },
          ],
        },
        { $set: req.body },
        { returnDocument: 'after', runValidators: true },
      );

      // if not found, throw error
      if (!data) {
        return next(
          new HTTPException('Service listing not found', StatusCodes.NOT_FOUND),
        );
      }

      // respond with updated listing
      res.status(StatusCodes.OK).json({
        status: Status.SUCCESS,
        message: 'Service listing updated successfully',
        payload: { service: data },
      });
    },
  );

  static findOneAndDelete: RequestHandler = catchAsync(
    async (
      req: Request<z.infer<typeof ZodId>, unknown, unknown>,
      res: Response,
      next: NextFunction,
    ): Promise<void> => {
      // delete listing by id for current user
      const data = await ListingModel.findOneAndDelete({
        $and: [
          { _id: new mongoose.Types.ObjectId(req.params.id) },
          { user: new mongoose.Types.ObjectId(req.self._id) },
        ],
      });

      // if not found, throw error
      if (!data) {
        return next(
          new HTTPException('Service listing not found', StatusCodes.NOT_FOUND),
        );
      }

      // respond with no content
      res.status(StatusCodes.NO_CONTENT).send();
    },
  );
}
