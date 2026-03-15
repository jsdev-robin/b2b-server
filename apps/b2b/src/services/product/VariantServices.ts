import { catchAsync, Status, StatusCodes } from '@server/utils';
import { Request, RequestHandler, Response } from 'express';
import { VariantModel } from '../../models/product/models';

export class VariantServices {
  static create: RequestHandler = catchAsync(
    async (req: Request, res: Response): Promise<void> => {
      console.log(req.body);

      // dfd
      await VariantModel.create(req.body.variables.variants);

      res.status(StatusCodes.CREATED).json({
        status: Status.CREATED,
        message: 'Variants created successfully',
      });
    },
  );
}
