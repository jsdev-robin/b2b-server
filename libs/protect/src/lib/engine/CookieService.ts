import { HTTPException } from '@server/middlewares';
import { Role } from '@server/types';
import { StatusCodes } from '@server/utils';
import { CookieOptions, NextFunction, Request, Response } from 'express';
import { parse } from 'tldts';
import {
  ACCESS_COOKIE_EXP,
  CT,
  DOMAIN_COOKIE,
  ENABLE_DEVTUNNELS,
  REFRESH_COOKIE_EXP,
  RoleCookies,
} from './constants';

export class CookieService {
  private options(): CookieOptions {
    return {
      httpOnly: true,
      sameSite: 'none',
      secure: true,
      path: '/',
      domain: ENABLE_DEVTUNNELS ? 'devtunnels.ms' : process.env.DOMAIN,
    };
  }

  protected names(ROLE: Role) {
    const cookies = RoleCookies[ROLE];

    return {
      access: cookies.ACCESS,
      refresh: cookies.REFRESH,
      pending2FA: cookies.PENDING_2FA,
      role: cookies.ROLE,
    };
  }

  private config(ROLE: Role, type: CT) {
    return {
      name: this.names(ROLE)[type],
      expires:
        type === CT.ACCESS
          ? ACCESS_COOKIE_EXP
          : type === CT.REFRESH
            ? REFRESH_COOKIE_EXP
            : type === CT.PENDING_2FA
              ? {}
              : undefined,
      options: this.options(),
      signed: type === CT.ACCESS ? true : false,
    };
  }

  protected cookie = (
    ROLE: Role,
    type: CT,
    payload = '',
    remember = false,
  ): [string, string, CookieOptions] => {
    try {
      const base = this.config(ROLE, type);

      const options = remember
        ? {
            ...base.options,
            ...base.expires,
            signed: base.signed,
          }
        : {
            ...base.options,
            signed: base.signed,
          };

      return [base.name, payload, options];
    } catch {
      throw new HTTPException(
        'Failed to create access cookie.',
        StatusCodes.INTERNAL_SERVER_ERROR,
      );
    }
  };

  protected clearCookie = (res: Response, name: string) => {
    res.clearCookie(name, this.options());
  };

  protected clearCookies = (req: Request, res: Response) => {
    const host = parse(req.hostname).hostname;
    const domain = DOMAIN_COOKIE[host as keyof typeof DOMAIN_COOKIE];

    const { ACCESS, REFRESH, PENDING_2FA } = domain;

    [ACCESS, REFRESH, PENDING_2FA].forEach((type) => {
      if (type) res.clearCookie(type, this.options());
    });
  };

  protected unauthorized = (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    this.clearCookies(req, res);
    return next(
      new HTTPException(
        'Your session has expired or is no longer available. Please log in again to continue.',
        StatusCodes.UNAUTHORIZED,
      ),
    );
  };

  public get toolkit() {
    return {
      names: this.names.bind(this),
      config: this.config.bind(this),
      createCookie: this.cookie.bind(this),
      clearCookie: this.clearCookie.bind(this),
      clearCookies: this.clearCookies.bind(this),
      unauthorized: this.unauthorized.bind(this),
    };
  }
}
