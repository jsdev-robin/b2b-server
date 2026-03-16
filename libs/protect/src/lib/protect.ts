import { nodeClient } from '@server/cloud';
import { HTTPException } from '@server/middlewares';
import { Crypto } from '@server/security';
import { IUser, Role } from '@server/types';
import { catchAsync, StatusCodes } from '@server/utils';
import { NextFunction, Request, RequestHandler, Response } from 'express';
import jwt from 'jsonwebtoken';
import { CookieService } from './engine/CookieService.js';
import { DOMAIN_COOKIE } from './engine/constants.js';

export class Protect extends CookieService {
  public validateToken: RequestHandler = catchAsync(
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      // const host = parse(req.hostname).hostname;
      const host = 'devmun'; // this is test mode, in vercel not working, need realtime server like railway,aws,etc.
      const { ACCESS } = DOMAIN_COOKIE[host as keyof typeof DOMAIN_COOKIE];

      if (!ACCESS) {
        return next(
          new HTTPException(
            'Your session has expired or is no longer available. Please log in again to continue. 1',
            StatusCodes.UNAUTHORIZED,
          ),
        );
      }

      const accessCookie = req.signedCookies[ACCESS];

      // If the access token is missing, throw an unauthorized error
      if (!accessCookie) {
        return next(
          new HTTPException(
            'Your session has expired or is no longer available. Please log in again to continue. 2',
            StatusCodes.UNAUTHORIZED,
          ),
        );
      }

      // Verify the access token and decode the payload
      const decoded = jwt.verify(
        accessCookie,
        String(process.env.ACCESS_TOKEN),
      ) as {
        id: string;
        role: Role;
      };

      // Attach user ID and access token to the request object
      req.userId = decoded?.id;
      req.role = decoded?.role;
      req.accessToken = accessCookie;

      next();
    },
  );

  public requireAuth: RequestHandler = catchAsync(
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      // Get credentials from request
      const { userId, accessToken } = req;

      // Query session and user data from Redis
      const p = nodeClient.multi();
      p.SISMEMBER(
        `${userId}:session`,
        Crypto.hmac(String(accessToken), String(process.env.HMAC_SECRET)),
      );
      p.json.GET(`${userId}:user`);

      const [token, user] = await p.exec();

      // Invalidate if session/user not found
      if (!token || !user) {
        return this.unauthorized(req, res, next);
      }

      req.self = user as unknown as IUser;

      next();
    },
  );

  public restrictTo = (...roles: Role[]) => {
    return (req: Request, res: Response, next: NextFunction) => {
      const user = req?.self;
      if (!user?.role || !roles.includes(user.role)) {
        this.clearCookies(req, res);
        return next(
          new HTTPException(
            'You do not have permission to perform this action',
            StatusCodes.FORBIDDEN,
          ),
        );
      }

      next();
    };
  };
}
