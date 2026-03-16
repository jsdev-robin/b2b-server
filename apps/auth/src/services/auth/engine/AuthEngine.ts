import { nodeClient } from '@server/cloud';
import { HTTPException } from '@server/middlewares';
import { CT, DOMAIN_COOKIE, REFRESH_TTL } from '@server/protect';
import { Crypto, Decipheriv } from '@server/security';
import { IUser, Role } from '@server/types';
import { StatusCodes } from '@server/utils';
import { randomBytes, randomInt } from 'crypto';
import { Request, Response } from 'express';
import { UserAgent } from 'express-useragent';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { parse } from 'tldts';
import { config } from '../../../configs/configs';
import { Passkey } from '../../../models/passkey/PasskeyModel';
import { SessionModel } from '../../../models/session/SessionModel';
import { TokenService } from './TokenService';

export class AuthEngine extends TokenService {
  protected getDeviceInfo = (req: Request) => {
    // Get the user agent object from the request (requires useragent middleware)
    const ua = new UserAgent().hydrate(
      req.headers['user-agent'] ?? 'unknown',
    ).Agent;

    // Determine the device type based on user agent flags
    let deviceType: string;

    switch (true) {
      case ua?.isSmartTV:
        deviceType = 'smart-tv';
        break;
      case ua?.isBot:
        deviceType = 'bot';
        break;
      case ua?.isMobileNative:
        deviceType = 'mobile-native';
        break;
      case ua?.isMobile:
        deviceType = 'mobile';
        break;
      case ua?.isTablet:
        deviceType = 'tablet';
        break;
      case ua?.isAndroidTablet:
        deviceType = 'android-tablet';
        break;
      case ua?.isiPad:
        deviceType = 'ipad';
        break;
      case ua?.isiPhone:
        deviceType = 'iphone';
        break;
      case ua?.isiPod:
        deviceType = 'ipod';
        break;
      case ua?.isKindleFire:
        deviceType = 'kindle-fire';
        break;
      case ua?.isDesktop:
        deviceType = 'desktop';
        break;
      case ua?.isWindows:
        deviceType = 'windows';
        break;
      case ua?.isMac:
        deviceType = 'mac';
        break;
      case ua?.isLinux:
        deviceType = 'linux';
        break;
      case ua?.isChromeOS:
        deviceType = 'chromeos';
        break;
      case ua?.isRaspberry:
        deviceType = 'raspberry-pi';
        break;
      default:
        deviceType = 'unknown';
    }

    return {
      deviceType,
      os: ua?.os ?? 'unknown',
      version: ua?.version ?? 'unknown',
      browser: ua?.browser ?? 'unknown',
      userAgent: req.headers['user-agent'] ?? 'unknown',
      ip: req.ip,
      date: Date.now(),
      ...this.getLocationInfo(req),
    };
  };

  protected getLocationInfo = (req: Request) => ({
    city: req.ipinfo?.city || 'unknown',
    country: req.ipinfo?.country || 'unknown',
    lat: Number(req.ipinfo?.loc?.split(',')[0]) || 0,
    lng: Number(req.ipinfo?.loc?.split(',')[1]) || 0,
  });

  protected creatOtp = async (
    req: Request,
    data: object,
  ): Promise<{ token: string; plainOtp: number }> => {
    try {
      // Define minimum and maximum values for a 6-digit OTP
      const otpMin = Math.pow(10, 6 - 1);
      const otpMax = Math.pow(10, 6) - 1;

      // Generate a random 6-digit OTP
      const plainOtp = randomInt(otpMin, otpMax);

      // Encrypt the OTP along with additional data and client IP
      const encrypted = await Crypto.cipheriv(
        {
          ...data,
          plainOtp,
          ip: req.ip,
        },
        config.CRYPTO_SECRET,
      );

      // Sign the encrypted data into a JWT token with 10 minutes expiry
      const token = jwt.sign({ encrypted }, config.ACTIVATION_SECRET, {
        expiresIn: '10m',
      });

      // Return both the JWT token and the plain OTP
      return { token, plainOtp };
    } catch {
      // Throw a generic internal server error if OTP creation fails
      throw new HTTPException(
        'Failed to create OTP. Please try again.',
        StatusCodes.INTERNAL_SERVER_ERROR,
      );
    }
  };

  protected storeSession = async (
    req: Request,
    payload: {
      user: IUser;
      accessToken: string;
    },
  ): Promise<void> => {
    try {
      const { user, accessToken } = payload;
      const { _id } = user;

      // Hash the access token for secure storage
      const hashedToken = Crypto.hmac(String(accessToken), config.HMAC_SECRET);

      // Execute Redis and MongoDB updates in parallel
      await Promise.all([
        (async () => {
          // Create a Redis multi-command pipeline
          const p = nodeClient.multi();

          // Add the hashed token to the user's session set in Redis
          p.SADD(`${_id}:session`, hashedToken);

          // Store the user object as JSON in Redis
          p.json.SET(`${_id}:user`, '$', user.toObject());

          // Set expiration for the session set (access token TTL in seconds)
          p.EXPIRE(`${_id}:session`, REFRESH_TTL * 24 * 60 * 60);

          // Set expiration for the user object (refresh token TTL in seconds)
          p.EXPIRE(`${_id}:user`, REFRESH_TTL * 24 * 60 * 60);

          // Execute all Redis commands in the pipeline
          await p.exec();
        })(),

        SessionModel.create({
          user: _id,
          token: hashedToken,
          deviceInfo: this.getDeviceInfo(req),
          location: this.getLocationInfo(req),
          ip: req.ip,
        }),
        // Update the MongoDB user document with session info
      ]);
    } catch {
      // Throw a generic error if session storage fails
      throw new HTTPException(
        'Failed to store session',
        StatusCodes.INTERNAL_SERVER_ERROR,
      );
    }
  };

  protected rotateSession = async (payload: {
    id: string;
    oldToken: string;
    newToken: string;
  }): Promise<void> => {
    try {
      const { id, oldToken, newToken } = payload;

      // Hash the new token for secure storage
      const hashedToken = Crypto.hmac(String(newToken), config.HMAC_SECRET);

      // Execute Redis and MongoDB updates in parallel
      await Promise.all([
        (async () => {
          // Create a Redis multi-command pipeline
          const p = nodeClient.multi();

          // Remove the old token from the user's session set in Redis
          p.SREM(`${id}:session`, String(oldToken));

          // Add the new hashed token to the user's session set in Redis
          p.SADD(`${id}:session`, hashedToken);

          // Set expiration for the session set (refresh token TTL in seconds)
          p.EXPIRE(`${id}:session`, REFRESH_TTL * 24 * 60 * 60);

          // Execute all Redis commands in the pipeline
          await p.exec();
        })(),

        // Update the MongoDB user document to replace the old token with the new hashed token
        SessionModel.findOneAndUpdate(
          {
            user: id,
            token: oldToken,
          },
          {
            $set: {
              token: hashedToken,
              expiresAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
            },
          },
        ),
      ]);
    } catch {
      // Throw a generic error if session rotation fails
      throw new HTTPException(
        'Failed to rotate session. Please try again later.',
        StatusCodes.INTERNAL_SERVER_ERROR,
      );
    }
  };

  protected removeASession = async (payload: {
    id: mongoose.Types.ObjectId;
    token: string;
  }): Promise<void> => {
    try {
      const { id, token } = payload;

      // Execute Redis and MongoDB updates in parallel
      await Promise.all([
        (async () => {
          // Create a Redis multi-command pipeline
          const p = nodeClient.multi();

          // Remove the token from the user's session set in Redis
          p.SREM(`${id}:session`, token);

          // Execute the Redis commands
          const [rem] = await p.exec();

          // Ensure that the token existed and was removed
          if (Number(rem) !== 1) {
            throw new Error('Token not found in session set.');
          }
        })(),

        // Update the MongoDB user document to mark the session as inactive
        await SessionModel.findOneAndUpdate(
          {
            user: id,
            token: token,
          },
          {
            $set: {
              status: false,
            },
          },
        ),
      ]);
    } catch {
      // Throw a generic error if session removal fails
      throw new HTTPException(
        'Failed to remove session. Please try again later.',
        StatusCodes.INTERNAL_SERVER_ERROR,
      );
    }
  };

  protected removeOtherSessions = async (
    req: Request,
    payload: {
      id: string;
    },
  ): Promise<void> => {
    try {
      const { id } = payload;
      const accessToken = req.accessToken;

      // Hash the current access token from signed cookies for secure comparison
      const token = Crypto.hmac(accessToken, config.HMAC_SECRET);

      // Execute Redis and MongoDB updates in parallel
      await Promise.all([
        (async () => {
          // Create a Redis multi-command pipeline
          const p = nodeClient.multi();

          // Delete all existing sessions for the user in Redis
          p.DEL(`${id}:session`);

          // Add only the current session token back into Redis
          p.SADD(`${id}:session`, token);

          // Execute the Redis commands
          await p.exec();
        })(),

        // Update the MongoDB user document to remove all other sessions
        await SessionModel.deleteMany({
          user: id,
          token: { $ne: token },
        }),
      ]);
    } catch {
      // Throw a generic error if clearing other sessions fails
      throw new HTTPException(
        'Failed to clear other sessions.',
        StatusCodes.INTERNAL_SERVER_ERROR,
      );
    }
  };

  protected refreshCache = async (user: IUser) => {
    const p = nodeClient.multi();
    p.json.SET(
      `${user?._id}:user`,
      '$',
      JSON.parse(JSON.stringify(user?.toObject())),
    );
    p.EXPIRE(`${user?._id}:user`, REFRESH_TTL * 24 * 60 * 60);
    await p.exec();
  };

  protected resetSecurity = async (
    res: Response,
    payload: {
      id: string;
    },
  ): Promise<void> => {
    try {
      const { id } = payload;

      await Promise.all([
        (async () => {
          const p = nodeClient.multi();
          p.DEL(`${id}:session`);
          p.DEL(`${id}:user`);
          await p.exec();
        })(),

        this.model.updateOne(
          { _id: id },
          {
            $unset: {
              sessions: 0,
              'auth.twoFA.backupCodes': 0,
              'auth.passKeys.lastUsedAt': 0,
              'auth.twoFA.secret': 0,
            },
            $set: {
              'auth.twoFA.enabled': false,
              'auth.passKeys.enabled': false,
              'auth.passKeys.count': 0,
            },
          },
        ),

        Passkey.deleteMany({ user: id }),
      ]);
    } catch {
      // Throw a generic error if removing all sessions fails
      throw new HTTPException(
        'Failed to remove all sessions.',
        StatusCodes.INTERNAL_SERVER_ERROR,
      );
    }
  };

  protected encryptCodes = async (codes: string[]): Promise<Decipheriv[]> => {
    try {
      return await Promise.all(
        codes.map(async (plain) => {
          const encrypted = await Crypto.cipheriv(plain, config.CRYPTO_SECRET);
          return {
            salt: encrypted.salt,
            iv: encrypted.iv,
            data: encrypted.data,
          };
        }),
      );
    } catch {
      throw new HTTPException(
        'Failed to encrypt backup codes.',
        StatusCodes.INTERNAL_SERVER_ERROR,
      );
    }
  };

  protected decryptCodes = async (codes: Decipheriv[]): Promise<string[]> => {
    try {
      return await Promise.all(
        codes.map(async (encrypted) => {
          const decrypted = await Crypto.decipheriv<string>(
            encrypted,
            config.CRYPTO_SECRET,
          );
          return decrypted;
        }),
      );
    } catch {
      throw new HTTPException(
        'Failed to decrypt backup codes.',
        StatusCodes.INTERNAL_SERVER_ERROR,
      );
    }
  };

  protected recoveryCodes = async (
    count = 16,
    codeLength = 12,
    chunkSize = 4,
  ): Promise<Decipheriv[]> => {
    const codes = Array.from({ length: count }, () =>
      randomBytes(Math.ceil(codeLength / 2))
        .toString('base64')
        .replace(/[^A-Z0-9]/gi, '')
        .substring(0, codeLength)
        .toUpperCase()
        .replace(new RegExp(`(.{${chunkSize}})(?=.)`, 'g'), '$1-'),
    );

    return await this.encryptCodes(codes);
  };

  protected formatCode = (code: string, chunkSize = 4): string => {
    return code
      .replace(/-/g, '')
      .replace(new RegExp(`(.{${chunkSize}})(?=.)`, 'g'), '$1-');
  };

  protected set2FA = async (
    res: Response,
    payload: {
      id: string;
      role: Role;
      remember: boolean;
      password: string;
    },
  ): Promise<void> => {
    try {
      const { id, role, remember, password } = payload;

      // Encrypt the user ID and "remember" flag for secure transmission
      const encrypted = await Crypto.cipheriv(
        {
          id: id,
          remember: remember,
          password: password,
        },
        config.CRYPTO_SECRET,
      );

      // Sign the encrypted payload into a JWT token with 5 minutes expiry
      const token = jwt.sign({ encrypted }, config.ACTIVATION_SECRET, {
        expiresIn: '5m',
      });

      // Set a cookie named 'pending2FA' with the token; not httpOnly since user may need it client-side
      res.cookie(...this.cookie(role, CT.PENDING_2FA, token, false));
    } catch {
      // Throw a generic error if 2FA setup fails
      throw new HTTPException(
        'Failed to create OTP. Please try again.',
        StatusCodes.INTERNAL_SERVER_ERROR,
      );
    }
  };

  protected get2FA = async (
    req: Request,
    res: Response,
  ): Promise<{
    authUser: IUser;
    fullUser: IUser;
    remember: boolean;
  } | null> => {
    const host = parse(req.hostname).hostname;
    const { PENDING_2FA } = DOMAIN_COOKIE[host as keyof typeof DOMAIN_COOKIE];

    const { encrypted } = jwt.verify(
      req.cookies[PENDING_2FA],
      config.ACTIVATION_SECRET,
    ) as { encrypted: Decipheriv };

    const { id, remember, password } = await Crypto.decipheriv<{
      id: string;
      remember: boolean;
      password: string;
    }>(encrypted, config.CRYPTO_SECRET);

    const [authUser, fullUser] = await Promise.all([
      this.model.findById({ _id: id }).select('auth.twoFA auth.password'),
      this.model.findById({ _id: id }),
    ]);

    if (!authUser || !fullUser || !(await authUser.checkPassword(password))) {
      this.clearCookie(res, PENDING_2FA);
      return null;
    }

    return { authUser, fullUser, remember };
  };
}
