import { nodeClient } from '@server/cloud';
import { HTTPException, globalErrorHandler } from '@server/middlewares';
import { StatusCodes } from '@server/utils';
import bodyParser from 'body-parser';
import { RedisStore } from 'connect-redis';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { Application, NextFunction, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import session from 'express-session';
import * as useragent from 'express-useragent';
import ipinfo, { defaultIPSelector } from 'ipinfo-express';
import morgan from 'morgan';
import { parse } from 'tldts';
import { config } from './configs/configs';
import adminRouter from './routes/adminRoutes';

const app: Application = express();

// Development logging
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// Set the view engine to EJS
app.set('view engine', 'ejs');

// Proxy middleware
app.set('trust proxy', 1);

const redisStore = new RedisStore({
  client: nodeClient,
  prefix: 'devmun:',
  ttl: 5 * 60,
});

app.use(
  session({
    store: redisStore,
    secret: 'testing-code',
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 5 * 60 * 1000,
      httpOnly: true,
      sameSite: 'lax',
    },
  }),
);

// Parse request bodies
app.use(bodyParser.json({ limit: '50kb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50kb' }));

// Parse cookies
app.use(cookieParser(config.COOKIE_SECRET));

// app.use(helmet());

app.use(
  ipinfo({
    token: config.IPINFO_KEY,
    cache: null,
    timeout: 5000,
    ipSelector: defaultIPSelector,
  }),
);

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

// Rate limit
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

// Get user device info

app.use(useragent.express());

app.get('/', async (req, res) => {
  const host = parse(req.hostname);
  const source = req.headers['user-agent'] ?? 'unknown';
  const parser = new useragent.UserAgent().hydrate(source);

  res.status(200).json({
    status: 'success',
    message: '🚀 Welcome to Auth! Your API is running perfectly.',
    host,
    parser,
  });
});

app.use('/admin', adminRouter);

// Handle 404 errors
app.all(/(.*)/, (req: Request, res: Response, next: NextFunction) => {
  return next(
    new HTTPException(
      `Can't find ${req.originalUrl} on this server!`,
      StatusCodes.NOT_FOUND,
    ),
  );
});

// Global error handling middleware
app.use(globalErrorHandler);

export default app;
