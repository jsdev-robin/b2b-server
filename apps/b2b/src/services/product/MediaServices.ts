import { HTTPException } from '@server/middlewares';
import { catchAsync, Status, StatusCodes } from '@server/utils';
import { NextFunction, Request, RequestHandler, Response } from 'express';
import mongoose from 'mongoose';
import { ProductModel } from '../../models/product/models';

export class MediaServices {
  static createOne: RequestHandler = catchAsync(
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      const { productId, mediaId } = req.params;

      const media = await mongoose.connection
        .collection('media')
        .aggregate([
          {
            $match: {
              $and: [
                { _id: new mongoose.Types.ObjectId(mediaId) },
                { storeId: new mongoose.Types.ObjectId(req.self._id) },
              ],
            },
          },
          {
            $project: {
              mediaId: '$_id',
              src: 1,
              alt: 1,
              mediaType: 1,
              width: 1,
              height: 1,
              _id: 0,
            },
          },
        ])
        .toArray();

      if (!media) {
        return next(
          new HTTPException(
            'Media not found. Please check the media IDs.',
            StatusCodes.NOT_FOUND,
          ),
        );
      }

      const product = await ProductModel.findOneAndUpdate(
        {
          $and: [
            { _id: new mongoose.Types.ObjectId(productId) },
            { storeId: req.self._id },
            {
              $expr: {
                $lte: [
                  {
                    $add: [
                      { $size: { $ifNull: ['$media', []] } },
                      media.length,
                    ],
                  },
                  10,
                ],
              },
            },
          ],
        },
        {
          $push: { media: { $each: media } },
        },
      );

      if (!product) {
        return next(
          new HTTPException(
            'Cannot add media. Maximum of 10 items already reached.',
            StatusCodes.BAD_REQUEST,
          ),
        );
      }

      res.status(StatusCodes.CREATED).json({
        status: Status.CREATED,
        message: 'Media added to product successfully.',
      });
    },
  );

  static createMany: RequestHandler = catchAsync(
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      const { ids } = req.body;
      const { productId } = req.params;

      const objectIds = ids.map(
        (id: string) => new mongoose.Types.ObjectId(id),
      );

      const media = await mongoose.connection
        .collection('media')
        .aggregate([
          {
            $match: {
              $and: [
                { _id: { $in: objectIds } },
                { storeId: new mongoose.Types.ObjectId(req.self._id) },
              ],
            },
          },
          {
            $project: {
              mediaId: '$_id',
              src: 1,
              alt: 1,
              mediaType: 1,
              width: 1,
              height: 1,
              _id: 0,
            },
          },
        ])
        .toArray();

      if (!media) {
        return next(
          new HTTPException(
            'Media not found. Please check the media IDs.',
            StatusCodes.NOT_FOUND,
          ),
        );
      }

      const product = await ProductModel.findOneAndUpdate(
        {
          $and: [
            { _id: new mongoose.Types.ObjectId(productId) },
            { storeId: req.self._id },
            {
              $expr: {
                $lte: [
                  {
                    $add: [
                      { $size: { $ifNull: ['$media', []] } },
                      media.length,
                    ],
                  },
                  10,
                ],
              },
            },
          ],
        },
        {
          $push: { media: { $each: media } },
        },
      );

      if (!product) {
        return next(
          new HTTPException(
            'Cannot add media. Maximum of 10 items already reached.',
            StatusCodes.BAD_REQUEST,
          ),
        );
      }

      res.status(StatusCodes.CREATED).json({
        status: Status.CREATED,
        message: 'Media added to product successfully.',
      });
    },
  );

  static deleteOne: RequestHandler = catchAsync(
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      const { productId, mediaId } = req.params;

      const product = await ProductModel.findOneAndUpdate(
        {
          $and: [
            { _id: new mongoose.Types.ObjectId(productId) },

            { storeId: req.self._id },
          ],
        },
        {
          $pull: {
            media: {
              mediaId: new mongoose.Types.ObjectId(mediaId),
            },
          },
        },
      );

      if (!product) {
        return next(
          new HTTPException('Product not found.', StatusCodes.NOT_FOUND),
        );
      }

      res.status(StatusCodes.NO_CONTENT).json({
        status: Status.SUCCESS,
        message: 'Media removed from product successfully.',
      });
    },
  );

  static deleteMany: RequestHandler = catchAsync(
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      const { ids } = req.body;
      const { productId } = req.params;

      const objectIds = ids.map(
        (id: string) => new mongoose.Types.ObjectId(id),
      );

      const product = await ProductModel.findOneAndUpdate(
        {
          $and: [
            { _id: new mongoose.Types.ObjectId(productId) },
            { storeId: req.self._id },
          ],
        },
        {
          $pull: {
            media: {
              mediaId: {
                $in: objectIds,
              },
            },
          },
        },
        { returnDocument: 'after' },
      );

      if (!product) {
        return next(
          new HTTPException('Draft product not found.', StatusCodes.NOT_FOUND),
        );
      }

      res.status(StatusCodes.NO_CONTENT).json({
        status: Status.SUCCESS,
        message: 'Media removed from draft product successfully.',
      });
    },
  );
}
