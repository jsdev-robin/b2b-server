import { HTTPException } from '@server/middlewares';
import { ACCESS_TTL, CookieService, REFRESH_TTL } from '@server/protect';
import { Crypto } from '@server/security';
import { IUser, Role } from '@server/types';
import { StatusCodes } from '@server/utils';
import { timingSafeEqual } from 'crypto';
import { Request } from 'express';
import { UserAgent } from 'express-useragent';
import jwt from 'jsonwebtoken';
import { Model } from 'mongoose';
import { config } from '../../../configs/configs';

export interface TokenSignature {
  ip: string;
  browser: string;
  device: string;
  id: string;
  role: Role;
  remember: boolean;
  token: string;
}

export class TokenService extends CookieService {
  protected readonly model: Model<IUser>;
  constructor(options: { model: Model<IUser> }) {
    super();
    this.model = options.model;
  }

  private tokenSignature(req: Request, user: { id: string; role: Role }) {
    const parser = new UserAgent().hydrate(
      req.headers['user-agent'] ?? 'unknown',
    );

    return {
      ip: Crypto.hmac(String(req.ip), config.HMAC_SECRET),
      id: user.id,
      role: user.role,
      browser: Crypto.hmac(String(parser.Agent?.browser), config.HMAC_SECRET),
      device: Crypto.hmac(String(parser.Agent?.os), config.HMAC_SECRET),
    };
  }

  protected checkTokenSignature(
    decoded: TokenSignature | null,
    req: Request,
  ): boolean {
    if (!decoded) return true;

    // Safe string comparison using crypto.timingSafeEqual
    const compare = (a: string, b: string): boolean => {
      const aBuf: Buffer = Buffer.from(a);
      const bBuf: Buffer = Buffer.from(b);

      if (aBuf.length !== bBuf.length) return false;
      return timingSafeEqual(
        aBuf as unknown as Uint8Array,
        bBuf as unknown as Uint8Array,
      );
    };

    const parser = new UserAgent().hydrate(
      req.headers['user-agent'] ?? 'unknown',
    );

    // Return true if device or browser signature does not match
    return (
      !compare(
        decoded.device,
        Crypto.hmac(String(parser.Agent?.os), config.HMAC_SECRET),
      ) ||
      !compare(
        decoded.browser,
        Crypto.hmac(String(parser.Agent?.browser), config.HMAC_SECRET),
      )
    );
  }

  protected rotateToken = (
    req: Request,
    payload: { id: string; role: Role; remember: boolean },
  ): [string, string] => {
    try {
      const { id, role, remember } = payload;

      // Generate a hashed signature for the client
      const clientSignature = this.tokenSignature(req, {
        id: id,
        role: role,
      });

      // Create an access token with a short TTL
      const accessToken = jwt.sign(
        { ...clientSignature },
        config.ACCESS_TOKEN,
        {
          expiresIn: `${ACCESS_TTL}m`,
          algorithm: 'HS256',
        },
      );

      const refreshToken = jwt.sign(
        {
          ...clientSignature,
          remember: remember,
          token: Crypto.hmac(accessToken, config.HMAC_SECRET),
        },
        config.REFRESH_TOKEN,
        {
          expiresIn: `${REFRESH_TTL}d`,
          algorithm: 'HS256',
        },
      );

      // Return all three tokens
      return [accessToken, refreshToken];
    } catch {
      // Throw error if token generation fails
      throw new HTTPException(
        'Failed to generate session tokens. Please try again.',
        StatusCodes.INTERNAL_SERVER_ERROR,
      );
    }
  };

  public get tokenToolkit() {
    return {
      tokenSignature: this.tokenSignature.bind(this),
      checkTokenSignature: this.checkTokenSignature.bind(this),
      rotateToken: this.rotateToken.bind(this),
    };
  }
}
