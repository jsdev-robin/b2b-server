import { StatusCodes } from '@server/utils';
import { NextFunction, Request, Response } from 'express';
import { HTTPException } from './HTTPException.js';

interface CustomError extends Error {
  statusCode?: number;
  status?: string;
  isOperational?: boolean;
  path?: string;
  value?: string;
  code?: number;
  errmsg?: string;
  errors?: Record<string, { message: string }>;
  reason?: unknown;
}

// Enhanced Error Handlers
const handleInvalidFieldError = (err: CustomError): HTTPException => {
  const message = `Invalid input provided for the ${err.path} field: "${err.value}". Please provide a valid value and try again.`;
  return new HTTPException(message, StatusCodes.BAD_REQUEST);
};

// const handleDuplicateValueError = (err: CustomError): HTTPException => {
//   const value = err.errmsg?.match(/(["'])(\\?.)*?\1/);
//   const duplicateValue = value ? value[0] : '';
//   const message = `The value ${duplicateValue} already exists. Duplicate entries are not allowed. Please choose a different value and try again.`;
//   return new HTTPException(message, StatusCodes.CONFLICT);
// };

const handleDuplicateValueError = (): HTTPException => {
  return new HTTPException(
    'Duplicate entry detected. Each value must be unique. Please provide a different value and try again.',
    StatusCodes.CONFLICT,
  );
};

const handleInputValidationError = (err: CustomError): HTTPException => {
  const errors = Object.values(err.errors ?? {}).map((el) => el.message);
  const message = `There were validation errors in your input. ${errors.join(
    '. ',
  )}. Please correct them and try again.`;
  return new HTTPException(message, StatusCodes.UNPROCESSABLE_ENTITY);
};

const handleDocumentNotFoundError = (): HTTPException => {
  return new HTTPException(
    'The requested resource could not be found. Please check your input and try again.',
    StatusCodes.NOT_FOUND,
  );
};

const handleStrictModeError = (err: CustomError): HTTPException => {
  const message = `Field "${err.path}" is not allowed under strict schema rules. Please check your data and try again.`;
  return new HTTPException(message, StatusCodes.BAD_REQUEST);
};

const handleMissingSchemaError = (err: CustomError): HTTPException => {
  const message = `The schema for "${err.message}" is missing. Please ensure all schemas are registered correctly.`;
  return new HTTPException(message, StatusCodes.INTERNAL_SERVER_ERROR);
};

const handleDisconnectedError = (): HTTPException => {
  return new HTTPException(
    'Lost connection to the database. Please try again later.',
    StatusCodes.SERVICE_UNAVAILABLE,
  );
};

const handleInvalidTokenError = (): HTTPException => {
  return new HTTPException(
    'Your session is invalid or has been tampered with. Please try again later.',
    StatusCodes.UNAUTHORIZED,
  );
};

const handleExpiredTokenError = (): HTTPException => {
  return new HTTPException(
    'Your session has expired. Please try again later.',
    StatusCodes.UNAUTHORIZED,
  );
};

const handleInactiveTokenError = (): HTTPException => {
  return new HTTPException(
    'This token is not yet active. Please check the token activation time and try again.',
    StatusCodes.UNAUTHORIZED,
  );
};

const sendError = (err: CustomError, res: Response, isDev: boolean): void => {
  const statusCode = err.statusCode ?? StatusCodes.INTERNAL_SERVER_ERROR;
  const status = err.status ?? 'error';

  console.log(isDev);

  if (process.env.NODE_ENV === 'production') {
    res.status(statusCode).json({
      status,
      error: err,
      message: err.message,
      stack: err.stack,
    });
  } else {
    if (err.isOperational) {
      res.status(statusCode).json({
        status,
        message: err.message,
      });
    } else {
      res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
        status: 'error',
        message:
          'Something went very wrong! Our team has been notified, and we are working to fix this issue.',
      });
    }
  }
};

export const globalErrorHandler = (
  err: CustomError,
  _req: Request,
  res: Response,
  next: NextFunction,
): void => {
  err.statusCode = err.statusCode ?? StatusCodes.INTERNAL_SERVER_ERROR;
  err.status = err.status ?? 'error';

  const isDev = process.env.NODE_ENV === 'development';

  if (err.name === 'CastError') {
    err = handleInvalidFieldError(err);
  } else if (err.name === 'ValidationError') {
    err = handleInputValidationError(err);
  } else if (err.name === 'DocumentNotFoundError') {
    err = handleDocumentNotFoundError();
  } else if (err.name === 'StrictModeError') {
    err = handleStrictModeError(err);
  } else if (err.name === 'MissingSchemaError') {
    err = handleMissingSchemaError(err);
  } else if (err.name === 'DisconnectedError') {
    err = handleDisconnectedError();
  } else if (err.name === 'JsonWebTokenError') {
    err = handleInvalidTokenError();
  } else if (err.name === 'TokenExpiredError') {
    err = handleExpiredTokenError();
  } else if (err.name === 'NotBeforeError') {
    err = handleInactiveTokenError();
  } else if (err.code === 11000) {
    err = handleDuplicateValueError();
  }

  sendError(err, res, isDev);

  next();
};
