import { HTTPException, globalErrorHandler } from '@server/middlewares';
import { StatusCodes } from '@server/utils';
import cors from 'cors';
import express, { Application, NextFunction, Request, Response } from 'express';
import proxy from 'express-http-proxy';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import morgan from 'morgan';
import { config } from './configs/configs';

const app: Application = express();

// Dev logging
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

app.set('trust proxy', 1);
app.use(helmet());

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10000,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (_req, _res, next) => {
    next(
      new HTTPException(
        'Too many requests, please try again later.',
        StatusCodes.TOO_MANY_REQUESTS,
      ),
    );
  },
});

app.use(limiter);
// app.use(bodyParser.json({ limit: '100mb' }));
// app.use(bodyParser.urlencoded({ extended: true, limit: '100mb' }));
// app.use(cookieParser(config.COOKIE_SECRET));

// Configure Cross-Origin Resource Sharing (CORS)
app.use(
  cors({
    origin: [config.ADMIN_CLIENT_URL],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'Origin',
    ],
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
    optionsSuccessStatus: 200,
  }),
);

app.options('*', cors());

app.get('/', async (req, res) => {
  res.status(200).json({
    status: 'success',
    message: '🚀 Welcome to Gateway! Your API is running perfectly.',
    timestamp: new Date().toISOString(),
  });
});

app.use('/api/v1/auth', proxy(config.AUTH_GATEWAY));
app.use('/api/v1/store', proxy(config.B2B_GATEWAY));
app.use('/api/v1/storage', proxy(config.STORAGE_GATEWAY));

app.all(/(.*)/, (req: Request, res: Response, next: NextFunction) => {
  return next(
    new HTTPException(
      `Can't find ${req.originalUrl} on this server!`,
      StatusCodes.NOT_FOUND,
    ),
  );
});

app.use(globalErrorHandler);

export default app;
