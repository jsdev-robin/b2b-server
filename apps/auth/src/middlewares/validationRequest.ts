import { HTTPException } from '@server/middlewares';
import { StatusCodes } from '@server/utils';
import { NextFunction, Request, Response } from 'express';
import { matchedData, Result, validationResult } from 'express-validator';

interface ValidationError {
  msg: string;
}

export const validationRequest = (
  req: Request,
  _: Response,
  next: NextFunction,
): void => {
  const errors: Result<ValidationError> = validationResult(req);
  if (!errors.isEmpty()) {
    const error: HTTPException = new HTTPException(
      errors.array()[0].msg,
      StatusCodes.UNPROCESSABLE_ENTITY,
    );
    next(error);
    return;
  }

  req.body = matchedData(req, { locations: ['body'] });

  next();
};
