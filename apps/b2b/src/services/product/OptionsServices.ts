import { catchAsync, Status, StatusCodes } from '@server/utils';
import { Request, RequestHandler, Response } from 'express';
import mongoose, { startSession } from 'mongoose';
import z from 'zod';
import { OptionModel, ProductModel } from '../../models/product/models';
import { ZodOptionSchema } from '../../validators/ZodOptionSchema';
import { ZodProductId } from '../../validators/ZodProductSchema';

export class OptionsServices {
  static create: RequestHandler = catchAsync(
    async (
      req: Request<
        z.infer<typeof ZodProductId>,
        unknown,
        z.infer<typeof ZodOptionSchema>
      >,
      res: Response,
    ): Promise<void> => {
      const session = await startSession();

      try {
        session.startTransaction();
        const product = await ProductModel.findById(
          req.params.productId,
        ).session(session);

        if (!product) {
          throw new Error('Product not found');
        }

        await OptionModel.updateOne(
          { _id: new mongoose.Types.ObjectId(req.params.productId) },
          {
            $setOnInsert: {
              productId: new mongoose.Types.ObjectId(req.params.productId),
              options: req.body.options,
            },
          },
          { upsert: true, session },
        );

        await session.commitTransaction();
      } catch (error) {
        await session.abortTransaction();
        throw error;
      } finally {
        session.endSession();
      }

      res.status(StatusCodes.CREATED).json({
        status: Status.CREATED,
        message: 'Options created successfully',
      });
    },
  );
}
