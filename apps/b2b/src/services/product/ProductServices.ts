import { catchAsync, Status, StatusCodes } from '@server/utils';
import { Request, RequestHandler, Response } from 'express';
import mongoose from 'mongoose';
import z from 'zod';
import { ProductModel } from '../../models/product/models';
import { ProductStatus } from '../../models/product/schemas/ProductScheam';
import { ZodProductSchema } from '../../validators/ZodProductSchema';

export class ProductServices {
  static find: RequestHandler = catchAsync(
    async (req: Request, res: Response): Promise<void> => {
      // chekc body
      console.log(req.body);
      console.log(req.self);

      res.status(StatusCodes.OK).json({
        status: Status.SUCCESS,
        message: 'Message',
      });
    },
  );

  static create: RequestHandler = catchAsync(
    async (
      req: Request<unknown, unknown, z.infer<typeof ZodProductSchema>>,
      res: Response,
    ): Promise<void> => {
      const { input } = req.body;

      await ProductModel.findOneAndUpdate(
        {
          $and: [
            { status: ProductStatus.DRAFT },
            { storeId: new mongoose.Types.ObjectId(req.self._id) },
          ],
        },
        {
          $set: input,
        },
        { timestamps: true },
      );

      res.status(StatusCodes.CREATED).json({
        status: Status.CREATED,
        message: 'Product created successfully',
      });
    },
  );

  static count: RequestHandler = catchAsync(
    async (req: Request, res: Response): Promise<void> => {
      res.status(StatusCodes.OK).json({
        status: Status.SUCCESS,
        message: 'Message',
      });
    },
  );

  static findById: RequestHandler = catchAsync(
    async (req: Request, res: Response): Promise<void> => {
      res.status(StatusCodes.OK).json({
        status: Status.SUCCESS,
        message: 'Message',
      });
    },
  );

  static updateById: RequestHandler = catchAsync(
    async (req: Request, res: Response): Promise<void> => {
      res.status(StatusCodes.OK).json({
        status: Status.SUCCESS,
        message: 'Message',
      });
    },
  );

  static deleteById: RequestHandler = catchAsync(
    async (req: Request, res: Response): Promise<void> => {
      res.status(StatusCodes.OK).json({
        status: Status.SUCCESS,
        message: 'Message',
      });
    },
  );
}
