import { StatusCodes } from '@server/utils';
import { NextFunction, Request, Response } from 'express';

export function bodyJsonParser(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (req.body.data) {
    try {
      req.body = JSON.parse(req.body.data);
    } catch {
      res
        .status(StatusCodes.BAD_REQUEST)
        .json({ error: 'Invalid JSON in data field' });
      return;
    }
  }

  if (req.body && typeof req.body === 'object') {
    req.body = JSON.parse(JSON.stringify(req.body));
  }

  next();
}
