import { HTTPException } from '@server/middlewares';
import { StatusCodes } from '@server/utils';
import { NextFunction, Request, Response } from 'express';
import { ZodError, ZodType } from 'zod';

type ValidationSchemas = {
  body?: ZodType<unknown>;
  query?: ZodType<unknown>;
  params?: ZodType<unknown>;
};

const safeParse = <T>(schema: ZodType<T>, data: unknown): T => {
  const result = schema.safeParse(data);
  if (!result.success) throw result.error;

  return result.data;
};

export const validationRequest = (schemas: ValidationSchemas) => {
  return (req: Request, _: Response, next: NextFunction): void => {
    try {
      if (schemas.body)
        req.body = safeParse(schemas.body, req.body) as typeof req.body;
      if (schemas.query)
        req.query = safeParse(schemas.query, req.query) as typeof req.query;
      if (schemas.params)
        req.params = safeParse(schemas.params, req.params) as typeof req.params;

      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const firstIssue = error.issues[0];

        return next(
          new HTTPException(
            firstIssue.message,
            StatusCodes.UNPROCESSABLE_ENTITY,
          ),
        );
      }

      next(error);
    }
  };
};
