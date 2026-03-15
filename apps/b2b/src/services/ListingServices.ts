import { HTTPException } from '@server/middlewares';
import { catchAsync, Status, StatusCodes } from '@server/utils';
import { NextFunction, Request, RequestHandler, Response } from 'express';
import z from 'zod';
import { ListingModel } from '../models/Service';
import QueryFind from '../utils/QueryFind';
import { ZodId, ZodListingSchema } from '../validators/ZodListingSchema';
import { ZodQuerySchema } from '../validators/ZodQuerySchema';

export class ListingServices {
  static create: RequestHandler = catchAsync(
    async (
      req: Request<unknown, unknown, z.infer<typeof ZodListingSchema>>,
      res: Response,
    ): Promise<void> => {
      const data = await ListingModel.create(req.body);

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
      const query = new QueryFind(ListingModel.find(), req.query)
        .filter()
        .sort()
        .limitFields()
        .paginate().query;

      const totalCount = ListingModel.countDocuments();

      const [data, total] = await Promise.all([query, totalCount]);

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
      const data = await ListingModel.findById(req.params.id);

      if (!data) {
        return next(
          new HTTPException('Service listing not found', StatusCodes.NOT_FOUND),
        );
      }

      res.status(StatusCodes.OK).json({
        status: Status.SUCCESS,
        message: 'Service listing fetched successfully',
        payload: { service: data },
      });
    },
  );

  static findByIdAndUpdate: RequestHandler = catchAsync(
    async (
      req: Request<
        z.infer<typeof ZodId>,
        unknown,
        z.infer<typeof ZodListingSchema>
      >,
      res: Response,
      next: NextFunction,
    ): Promise<void> => {
      const data = await ListingModel.findByIdAndUpdate(
        req.params.id,
        req.body,
        { returnDocument: 'after' },
      );

      if (!data) {
        return next(
          new HTTPException('Service listing not found', StatusCodes.NOT_FOUND),
        );
      }

      res.status(StatusCodes.OK).json({
        status: Status.SUCCESS,
        message: 'Service listing updated successfully',
        payload: { service: data },
      });
    },
  );

  static findByIdAndDelete: RequestHandler = catchAsync(
    async (
      req: Request<z.infer<typeof ZodId>, unknown, unknown>,
      res: Response,
      next: NextFunction,
    ): Promise<void> => {
      const data = await ListingModel.findByIdAndDelete(req.params.id);

      if (!data) {
        return next(
          new HTTPException('Service listing not found', StatusCodes.NOT_FOUND),
        );
      }

      res.status(StatusCodes.NO_CONTENT).send();
    },
  );
}
