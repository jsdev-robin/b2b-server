import { HTTPException } from '@server/middlewares';
import { catchAsync, Status, StatusCodes } from '@server/utils';
import { NextFunction, Request, RequestHandler, Response } from 'express';
import mongoose, { startSession } from 'mongoose';
import { ProductModel, VariantModel } from '../../models/product/models';
import { ProductStatus } from '../../models/product/schemas/ProductScheam';

export class DraftServices {
  static create: RequestHandler = catchAsync(
    async (req: Request, res: Response): Promise<void> => {
      const session = await startSession();

      try {
        session.startTransaction();
        const product = await ProductModel.findOneAndUpdate(
          {
            $and: [
              { storeId: new mongoose.Types.ObjectId(req.self._id) },
              { status: ProductStatus.DRAFT },
            ],
          },
          {
            $setOnInsert: {
              storeId: new mongoose.Types.ObjectId(req.self._id),
              status: ProductStatus.DRAFT,
            },
          },
          {
            upsert: true,
            setDefaultsOnInsert: true,
            returnDocument: 'after',
            session,
            strict: false,
          },
        );

        await VariantModel.updateOne(
          {
            $and: [
              { storeId: new mongoose.Types.ObjectId(req.self._id) },
              { productId: product._id },
              { position: 1 },
            ],
          },
          {
            $set: {
              price: 0.0,
              position: 1,
              productId: product._id,
            },
          },
          {
            upsert: true,
            setDefaultsOnInsert: true,
            runValidators: false,
            session,
            strict: false,
          },
        );

        await session.commitTransaction();
      } catch (error) {
        await session.abortTransaction();
        throw error;
      } finally {
        session.endSession();
      }

      res.status(StatusCodes.OK).json({
        status: Status.CREATED,
        message: 'Draft created successfully',
      });
    },
  );

  static find: RequestHandler = catchAsync(
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      const draft = await ProductModel.findOne({
        $and: [
          { storeId: new mongoose.Types.ObjectId(req.self._id) },
          { status: ProductStatus.DRAFT },
        ],
      });

      if (!draft) {
        return next(
          new HTTPException(
            'Draft not found. Please refresh your page',
            StatusCodes.NOT_FOUND,
          ),
        );
      }

      res.status(StatusCodes.OK).json({
        status: Status.SUCCESS,
        message: 'Draft fetched successfully',
        payload: {
          draft,
        },
      });
    },
  );
}
