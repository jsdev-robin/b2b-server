import { nodeClient } from '@server/cloud';
import { SendEmail } from '@server/emails';
import { HTTPException } from '@server/middlewares';
import { CT, DOMAIN_COOKIE } from '@server/protect';
import { Crypto, Decipheriv } from '@server/security';
import { IUser, Role } from '@server/types';
import { catchAsync, Status, StatusCodes } from '@server/utils';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import { NextFunction, Request, RequestHandler, Response } from 'express';
import { UserAgent } from 'express-useragent';
import jwt from 'jsonwebtoken';
import mongoose, { Model } from 'mongoose';
import QRCode from 'qrcode';
import speakeasy from 'speakeasy';
import { parse } from 'tldts';
import { config } from '../../configs/configs';
import { Passkey } from '../../models/passkey/PasskeyModel';
import { PasswordReset } from '../../models/password/PasswordResetModel';
import { SessionModel } from '../../models/session/SessionModel';
import { AuthEngine } from './engine/AuthEngine';
import { TokenSignature } from './engine/TokenService';
import {
  IChangePasswordRequest,
  IFinishEmailChangeRequest,
  IFinishEnabled2FARequest,
  IFinishPasswordResetRequest,
  IGenerateAuthenticationOptionsRequest,
  IHandshake2FARequest,
  IHandshakeBackupCode2FARequest,
  ISigninRequest,
  ISignupRequest,
  IStartEmailChangeRequest,
  IStartPasswordResetRequest,
  IUpdateProfileRequest,
  IVerifyAuthenticationRequest,
  IVerifyRegistrationRequest,
} from './types';

export class AuthService extends AuthEngine {
  constructor(options: { model: Model<IUser> }) {
    super(options);
  }

  public signup: RequestHandler = catchAsync(
    async (
      req: ISignupRequest,
      res: Response,
      next: NextFunction,
    ): Promise<void> => {
      // Extract user signup details from request body
      const { familyName, givenName, email, password } = req.body;

      // Check if a user with the same email already exists in the database
      const exists = await this.model.exists({
        $or: [{ 'profile.email': email }, { 'auth.oauth.email': email }],
      });

      // If email is already registered, return BAD_REQUEST error
      if (exists) {
        return next(
          new HTTPException(
            'This email is already registered. Use a different email address.',
            StatusCodes.BAD_REQUEST,
          ),
        );
      }

      // Generate OTP and JWT token for email verification
      const { token, plainOtp } = await this.creatOtp(req, {
        familyName,
        givenName,
        email,
        password,
      });

      // Prepare payload for sending verification email
      const payload = {
        user: {
          name: familyName,
          email,
        },
        otp: plainOtp,
      };

      // Send verification email
      await new SendEmail(payload)
        .verifyEmail()
        .then(() => {
          // On success, respond with success status, message, and token
          res.status(StatusCodes.OK).json({
            status: Status.SUCCESS,
            message:
              'Verification code sent successfully to your email address.',
            payload: {
              token,
            },
          });
        })
        .catch(() => {
          // On failure, pass error to global error handler
          return next(
            new HTTPException(
              'An error occurred while sending the verification email. Please try again later.',
              StatusCodes.INTERNAL_SERVER_ERROR,
            ),
          );
        });
    },
  );

  public verify = (ROLE: Role): RequestHandler =>
    catchAsync(
      async (
        req: Request,
        res: Response,
        next: NextFunction,
      ): Promise<void> => {
        // Extract OTP and token from request body
        const { otp, token } = req.body;

        // Verify the JWT token and extract the encrypted data
        const { encrypted } = jwt.verify(token, config.ACTIVATION_SECRET) as {
          encrypted: Decipheriv;
        };

        // Decrypt the encrypted payload to get user signup data and OTP
        const { familyName, givenName, email, password, plainOtp, ip } =
          await Crypto.decipheriv<{
            familyName: string;
            givenName: string;
            email: string;
            password: string;
            plainOtp: string;
            ip: string;
          }>(encrypted, config.CRYPTO_SECRET);

        // Check ip mismatch
        if (ip !== req.ip) {
          return next(
            new HTTPException(
              'Verification blocked due to IP mismatch. Request a new OTP.',
              StatusCodes.BAD_REQUEST,
            ),
          );
        }

        const aBuf = String(plainOtp);
        const bBuf = String(otp);

        // Compare the provided OTP with the original OTP securely
        const isOtpValid = Crypto.safeCompare(aBuf, bBuf);

        // If OTP does not match, return BAD_REQUEST error
        if (!isOtpValid) {
          return next(
            new HTTPException(
              'The OTP you entered does not match. Please double-check the code and try again.',
              StatusCodes.BAD_REQUEST,
            ),
          );
        }

        // Create the user in the database
        await this.model.create({
          profile: {
            familyName,
            givenName,
            email,
          },
          auth: {
            password,
            isVerified: true,
          },
          role: ROLE,
        });

        // Respond with success message
        res.status(StatusCodes.CREATED).json({
          status: Status.CREATED,
          message: 'Your account has been successfully verified.',
        });
      },
    );

  public signin = (ROLE: Role): RequestHandler =>
    catchAsync(
      async (
        req: ISigninRequest,
        res: Response,
        next: NextFunction,
      ): Promise<void> => {
        // Extract credentials and remember flag from request body
        const { email, password, remember } = req.body;

        // Find user by email and explicitly select the password field
        const user = await this.model
          ?.findOne({
            $and: [{ 'profile.email': email }, { role: ROLE }],
          })
          .select('+auth.password')
          .exec();

        // If user not found OR password is invalid → return unauthorized error
        if (!user || !(await user.checkPassword(password))) {
          return next(
            new HTTPException(
              'Incorrect email or password. Please check your credentials and try again.',
              StatusCodes.UNAUTHORIZED,
            ),
          );
        }

        // If 2FA is enabled for this user → create a pending 2FA session
        if (user?.auth?.twoFA.enabled) {
          await this.set2FA(res, {
            id: user.id,
            role: user.role,
            remember: remember,
            password: password,
          });
          res.status(StatusCodes.OK).json({
            status: Status.SUCCESS,
            message:
              'Sign-in successful. Please complete two-factor authentication.',
            payload: {
              enable2fa: true,
            },
          });
          return;
        }

        // Remove password from the user object before attaching to request
        user.auth.password = undefined;

        // Attach authenticated user to request
        req.self = user;
        // Attach remember flag to request
        req.remember = remember;
        // Pass control to next middleware (e.g. createSession)
        next();
      },
    );

  public createSession: RequestHandler = catchAsync(
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      // user object attached to request (from middleware)
      const user = req.self;
      // "remember me" option (affects cookie expiry)
      const remember = req.remember;
      const role = req.self.role;

      // Generate new access, refresh, and protect tokens
      const [accessToken, refreshToken] = this.rotateToken(req, {
        id: user.id,
        role: user.role,
        remember,
      });

      // Save access token in cookie
      res.cookie(...this.cookie(role, CT.ACCESS, accessToken, remember));
      // Save refresh token in cookie
      res.cookie(...this.cookie(role, CT.REFRESH, refreshToken, remember));

      // Store session with user and access token
      await this.storeSession(req, { user, accessToken });

      try {
        res.status(StatusCodes.OK).json({
          status: Status.SUCCESS,
          message: `Welcome back ${user?.profile.familyName}.`,
          payload: {
            role: user.role,
          },
        });
      } catch (error) {
        // If an error occurs and headers aren’t sent yet → clear all cookies
        this.clearCookies(req, res);
        // Pass error to next middleware
        next(error);
      }
    },
  );

  public refreshToken: RequestHandler = catchAsync(
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      // Get signed role cookie from request
      const host = parse(req.hostname).hostname;
      const { REFRESH } = DOMAIN_COOKIE[host as keyof typeof DOMAIN_COOKIE];
      // Get refresh token cookie for this role
      const refreshCookie = req.cookies[REFRESH];

      // If no refresh token, user is unauthorized
      if (!refreshCookie) {
        return this.unauthorized(req, res, next);
      }

      try {
        // Verify and decode the refresh token
        const decode = jwt.verify(
          refreshCookie,
          config.REFRESH_TOKEN,
        ) as TokenSignature;

        // Check token signature; if invalid, user is unauthorized
        if (this.checkTokenSignature(decode, req)) {
          return this.unauthorized(req, res, next);
        }

        const { remember, id, role, token } = decode;

        // Generate new access, refresh, and role tokens
        const [accessToken, refreshToken] = this.rotateToken(req, {
          id: id,
          role: role,
          remember: remember,
        });

        // Save access token in cookie
        res.cookie(...this.cookie(role, CT.ACCESS, accessToken, remember));
        // Save refresh token in cookie
        res.cookie(...this.cookie(role, CT.REFRESH, refreshToken, remember));
        // Save role token in cookie

        // Update session storage with new access token
        const oldToken = token;
        const newToken = accessToken;

        await this.rotateSession({
          id: id,
          oldToken,
          newToken,
        });

        // Respond with success message
        res.status(200).json({
          status: Status.SUCCESS,
          message: 'Token refreshed successfully.',
        });
      } catch (error) {
        // If headers haven't been sent yet, clear cookies and pass error to next handler
        if (!res.headersSent) {
          this.clearCookies(req, res);
        }
        next(error);
      }
    },
  );

  public signout: RequestHandler = catchAsync(
    async (req: Request, res: Response): Promise<void> => {
      // Get the currently authenticated user and accessToken from the request
      const { accessToken, self } = req;

      // Remove the user's session using their ID and hashed access token
      await this.removeASession({
        id: self._id,
        token: Crypto.hmac(accessToken, config.HMAC_SECRET),
      });

      this.clearCookies(req, res);

      // Send a success response to the client indicating signout is complete
      res.status(StatusCodes.OK).json({
        status: Status.SUCCESS,
        message: 'You have been successfully signed out.',
      });
    },
  );

  public signoutSession: RequestHandler = catchAsync(
    async (req: Request, res: Response): Promise<void> => {
      // Extract the session token from the request parameters
      const { token } = req.params;

      // Get the currently authenticated user from the request
      const user = req.self;

      // Remove the specific session associated with this user and token
      await this.removeASession({
        id: user._id,
        token: token,
      });

      // Send a success response to the client indicating the session logout is complete
      res.status(StatusCodes.OK).json({
        status: Status.SUCCESS,
        message: 'You have been successfully logged out.',
      });
    },
  );

  public signoutAllSession: RequestHandler = catchAsync(
    async (req: Request, res: Response): Promise<void> => {
      // Get the currently authenticated user from the request
      const user = req.self;

      // Remove all sessions for this user except the current one
      await this.removeOtherSessions(req, {
        id: user.id,
      });

      // Send a success response to the client indicating all other sessions have been logged out
      res.status(StatusCodes.OK).json({
        status: Status.SUCCESS,
        message: 'You have been successfully logged out.',
      });
    },
  );

  // User profile & account management
  public findProfile: RequestHandler = catchAsync(
    async (req: Request, res: Response): Promise<void> => {
      // User is already attached to request via auth middleware
      const user = req.self;

      // Consider returning only necessary profile data
      res.status(StatusCodes.OK).json({
        status: Status.SUCCESS,
        message: 'Profile retrieved successfully',
        payload: {
          user,
        },
      });
    },
  );

  public updateProfile: RequestHandler = catchAsync(
    async (
      req: IUpdateProfileRequest,
      res: Response,
      next: NextFunction,
    ): Promise<void> => {
      const { familyName, givenName } = req.body.profile;

      const user = await this.model.findByIdAndUpdate(
        req.self._id,
        {
          $set: {
            'profile.familyName': familyName,
            'profile.givenName': givenName,
          },
        },
        { returnDocument: 'after' },
      );

      if (!user) {
        return next(
          new HTTPException(
            'User not found with this id',
            StatusCodes.NOT_FOUND,
          ),
        );
      }

      await this.refreshCache(user);

      res.status(StatusCodes.OK).json({
        status: Status.SUCCESS,
        message: 'Your profile updated successfully',
      });
    },
  );

  public findSessions: RequestHandler = catchAsync(
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      const sessions = await SessionModel.find({ user: req.self._id })
        .sort({ loggedInAt: -1 })
        .lean();

      if (!sessions) {
        return next(
          new HTTPException(
            'No session found. Please log in again to access your account.',
            StatusCodes.NOT_FOUND,
          ),
        );
      }

      res.status(StatusCodes.OK).json({
        status: Status.SUCCESS,
        message: 'User sessions retrieved successfully',
        payload: {
          sessions: sessions,
        },
      });
    },
  );

  public startPasswordReset: RequestHandler = catchAsync(
    async (
      req: IStartPasswordResetRequest,
      res: Response,
      next: NextFunction,
    ): Promise<void> => {
      const user = await this.model.findOne({
        'profile.email': req.body.email,
      });

      if (!user) {
        return next(
          new HTTPException(
            'If this email exists in our system, you will receive a password reset link shortly.',
            StatusCodes.OK,
          ),
        );
      }

      const resetEntry = new PasswordReset();
      const resetToken = resetEntry.resetToken(user.id);

      try {
        await resetEntry.save();
      } catch (error: unknown) {
        if (
          error instanceof mongoose.mongo.MongoServerError &&
          error.code === 11000
        ) {
          return next(
            new HTTPException(
              'A password reset request already exists for this account. Please wait 10 minutes before requesting another reset link.',
              StatusCodes.CONFLICT,
            ),
          );
        }

        throw error;
      }
      const mailData = {
        user: {
          name: user.profile.familyName,
          email: user.profile.email,
        },
        resetUrl: `${req.headers.origin}/forgot-password/${resetToken}/reset`,
        clientInfo: this.getDeviceInfo(req),
      };

      try {
        await new SendEmail(mailData).forgotPassword();

        res.status(StatusCodes.OK).json({
          status: Status.SUCCESS,
          message:
            'Password reset link has been sent to your email. Please check your inbox (and spam folder) for instructions.',
        });
      } catch {
        await PasswordReset.findOneAndDelete({ userId: user.id });
        return next(
          new HTTPException(
            'We encountered an issue sending the password reset email. Please try again in a few minutes.',
            StatusCodes.INTERNAL_SERVER_ERROR,
          ),
        );
      }
    },
  );

  public finishPasswordReset: RequestHandler = catchAsync(
    async (
      req: IFinishPasswordResetRequest,
      res: Response,
      next: NextFunction,
    ): Promise<void> => {
      const hashedToken = Crypto.hash(req.params.token);

      const token = await PasswordReset.findOne({
        token: hashedToken,
        expiresAt: { $gt: Date.now() },
      });

      if (!token) {
        return next(
          new HTTPException(
            'The password reset link has expired or is invalid. Please request a new one.',
            StatusCodes.BAD_REQUEST,
          ),
        );
      }

      const user = await this.model.findById(token.userId);

      if (!user) {
        return next(
          new HTTPException(
            'The user associated with this password reset request was not found.',
            StatusCodes.NOT_FOUND,
          ),
        );
      }

      user.auth.password = req.body.newPassword;
      await user.save();

      await PasswordReset.deleteOne({ _id: token._id });

      await this.resetSecurity(res, { id: user.id });

      res.status(StatusCodes.OK).json({
        status: Status.SUCCESS,
        message: 'Your password has been successfully reset.',
      });
    },
  );

  public changePassword: RequestHandler = catchAsync(
    async (
      req: IChangePasswordRequest,
      res: Response,
      next: NextFunction,
    ): Promise<void> => {
      const { currentPassword, newPassword } = req.body;

      const user = await this.model
        .findById(req.self?._id)
        .select('+auth.password');

      if (!(await user?.checkPassword(currentPassword)) || !user) {
        return next(
          new HTTPException(
            'The current password you entered is incorrect. Please double-check and try again.',
            StatusCodes.UNAUTHORIZED,
          ),
        );
      }

      if (await user.checkPassword(newPassword)) {
        return next(
          new HTTPException(
            'New password must be different from the current password.',
            StatusCodes.BAD_REQUEST,
          ),
        );
      }

      user.auth.password = newPassword;
      await user.save();

      await this.resetSecurity(res, {
        id: user?.id,
      });

      res.status(StatusCodes.OK).json({
        status: Status.SUCCESS,
        message:
          'Your password has been updated successfully. Please use your new password the next time you log in.',
      });
    },
  );

  public startEmailChange: RequestHandler = catchAsync(
    async (
      req: IStartEmailChangeRequest,
      res: Response,
      next: NextFunction,
    ): Promise<void> => {
      const { newEmail, password } = req.body;

      const exists = await this.model.exists({ 'profile.email': newEmail });

      if (exists) {
        return next(
          new HTTPException(
            'This email is already in use by another account.',
            StatusCodes.CONFLICT,
          ),
        );
      }

      const user = await this.model
        ?.findById(req.self?._id)
        .select('+auth.password');

      // Check if user exists and password is valid
      if (!user || !(await user.checkPassword(password))) {
        return next(
          new HTTPException(
            'The current password you entered is incorrect. Please double-check and try again.',
            StatusCodes.UNAUTHORIZED,
          ),
        );
      }

      const ua = new UserAgent().hydrate(
        req.headers['user-agent'] ?? 'unknown',
      ).Agent;

      const clientMeta = {
        ip: req.ip,
        location: req.ipinfo?.location,
        device: ua?.os,
        oldEmail: user.profile.email,
        newEmail: newEmail,
      };

      const { token, plainOtp } = await this.creatOtp(req, clientMeta);

      const newEmailPayload = {
        user: {
          name: user.profile.displayName,
          email: newEmail,
        },
        url: `${req.headers.origin}/account/workflow/sessions/email-change/${token}`,
        ...clientMeta,
      };

      const oldEmailPayload = {
        user: {
          name: user.profile.displayName,
          email: user.profile?.email,
        },
        otp: plainOtp,
        ...clientMeta,
      };

      await Promise.all([
        new SendEmail(oldEmailPayload).emailChangeAlert(),
        new SendEmail(newEmailPayload).emailChangeRequest(),
      ])
        .then(() => {
          res.status(StatusCodes.OK).json({
            status: Status.SUCCESS,
            message:
              'Verification emails have been sent to both your old and new email addresses. Please check your inboxes to confirm the email update.',
          });
        })
        .catch(() => {
          next(
            new HTTPException(
              'An error occurred while sending the verification emails. Please try again later.',
              StatusCodes.INTERNAL_SERVER_ERROR,
            ),
          );
        });
    },
  );

  public finishEmailChange: RequestHandler = catchAsync(
    async (
      req: IFinishEmailChangeRequest,
      res: Response,
      next: NextFunction,
    ): Promise<void> => {
      const { code } = req.body;
      const token = String(req.params.token);

      const { encrypted } = jwt.verify(
        String(token),
        config.ACTIVATION_SECRET,
      ) as {
        encrypted: Decipheriv;
      };

      const { oldEmail, newEmail, plainOtp } = await Crypto.decipheriv<{
        oldEmail: string;
        newEmail: string;
        plainOtp: string;
      }>(encrypted, config.CRYPTO_SECRET);

      const aBuf = String(code);
      const bBuf = String(plainOtp);

      const correctOTP = Crypto.safeCompare(aBuf, bBuf);

      if (!correctOTP) {
        return next(
          new HTTPException(
            'The OTP you entered does not match. Please double-check the code and try again.',
            StatusCodes.BAD_REQUEST,
          ),
        );
      }

      const user = await this.model.findOneAndUpdate(
        { 'profile.email': oldEmail },
        { $set: { 'profile.email': newEmail } },
        {
          returnDocument: 'after',
        },
      );

      if (!user) {
        return next(
          new HTTPException(
            'User not found or already updated. Please request a new email change.',
            StatusCodes.NOT_FOUND,
          ),
        );
      }

      await this.resetSecurity(res, {
        id: user?.id,
      });

      res.status(StatusCodes.OK).json({
        status: Status.SUCCESS,
        message: 'Your email has been successfully updated.',
      });
    },
  );

  // WebAuthn passkey registration and authentication flows
  public generateRegistrationOptions: RequestHandler = catchAsync(
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      // Get the current user from request
      const user = req.self;

      // Handle missing user session
      if (!user) {
        return next(
          new HTTPException(
            'Your session may have expired. Please log in again.',
            StatusCodes.UNAUTHORIZED,
          ),
        );
      }

      // Fetch existing passkeys for the user
      const userPasskeys = await Passkey.find({ user: user._id });

      // Generate WebAuthn registration options
      const options = await generateRegistrationOptions({
        rpName: config.RP_NAME,
        rpID: String(parse(req.hostname).domain),
        userName: user.profile.email,
        userID: Uint8Array.from(new TextEncoder().encode(user.id)),
        userDisplayName: user.profile.displayName,
        attestationType: 'none',
        excludeCredentials: userPasskeys.map((passkey) => ({
          id: passkey.credentialID,
          transports: passkey.transports,
        })),
        authenticatorSelection: {
          residentKey: 'preferred',
          userVerification: 'preferred',
          authenticatorAttachment: 'platform',
        },
        preferredAuthenticatorType: 'localDevice',
      });

      // Store challenge in Redis with a TTL of 300 seconds
      await nodeClient.setEx(
        `reg_challenge:${user._id}`,
        300,
        JSON.stringify({ challenge: options.challenge }),
      );

      // Send registration options to client
      res.status(StatusCodes.OK).json({
        status: Status.SUCCESS,
        message:
          'Ready to set up your passkey. Follow the next steps to complete registration.',
        payload: options,
      });
    },
  );

  public verifyRegistrationResponse: RequestHandler = catchAsync(
    async (
      req: IVerifyRegistrationRequest,
      res: Response,
      next: NextFunction,
    ): Promise<void> => {
      // Extract credential data from request body
      const { credential } = req.body;

      // Get the currently authenticated user
      const user = req.self;

      // Retrieve the stored registration challenge from Redis
      const storedChallenge = await nodeClient.get(`reg_challenge:${user._id}`);

      // Handle case when challenge is not found
      if (!storedChallenge) {
        return next(
          new HTTPException(
            'No registration challenge found. Please restart the registration process.',
            StatusCodes.NOT_FOUND,
          ),
        );
      }

      // Parse the stored challenge
      const { challenge } = JSON.parse(storedChallenge);

      // Verify the registration response using WebAuthn
      const verification = await verifyRegistrationResponse({
        response: credential,
        expectedChallenge: challenge,
        expectedOrigin: String(req.headers.origin),
        expectedRPID: String(parse(req.hostname).domain),
      });

      // Destructure verification results
      const { verified, registrationInfo } = verification;

      // Handle failed verification
      if (!verified || !registrationInfo) {
        return next(
          new HTTPException(
            'Passkey registration could not be verified. Please try again.',
            StatusCodes.UNAUTHORIZED,
          ),
        );
      }

      // Destructure registration info for storing
      const {
        credential: regCredential,
        credentialDeviceType,
        credentialBackedUp,
      } = registrationInfo;

      const device = this.getDeviceInfo(req);
      // Create a new passkey document
      const newPasskey = new Passkey({
        user: user._id,
        device: device.os,
        browser: device.browser,
        formFactor: device.deviceType,
        webAuthnUserID: new TextEncoder().encode(user._id.toString()),
        id: regCredential.id,
        publicKey: regCredential.publicKey,
        counter: regCredential.counter,
        transports: regCredential.transports,
        deviceType: credentialDeviceType,
        backedUp: credentialBackedUp,
        credentialID: regCredential.id,
      });

      // Save the new passkey in the database
      await newPasskey.save();

      // Count total passkeys for the user
      const count = await Passkey.countDocuments({
        user: user._id,
      });

      // Update user session with passkey information
      const newSession: IUser = await this.model
        ?.findByIdAndUpdate(user._id, {
          $set: {
            'auth.passKeys.enabled': true,
            'auth.passKeys.count': count,
            'auth.passKeys.lastUsedAt': new Date(),
          },
        })
        .select('-auth.password');

      // Update Redis: remove used challenge and store updated session
      await nodeClient.del(`reg_challenge:${user._id}`);
      await this.refreshCache(newSession);

      // Send success response to client
      res.status(StatusCodes.OK).json({
        status: Status.SUCCESS,
        message:
          'Your passkey has been successfully registered and is ready to use.',
      });
    },
  );

  public generateAuthenticationOptions: RequestHandler = catchAsync(
    async (
      req: IGenerateAuthenticationOptionsRequest,
      res: Response,
      next: NextFunction,
    ): Promise<void> => {
      const { email } = req.body;

      // Find user by email
      const user = await this.model?.findOne({ 'profile.email': email }).exec();

      // Handle case when user is not found
      if (!user) {
        return next(
          new HTTPException(
            'No account found with this email. Please check and try again.',
            StatusCodes.UNAUTHORIZED,
          ),
        );
      }

      if (!user.auth.passKeys.enabled) {
        return next(
          new HTTPException(
            'No passkeys are registered for this account. Please register a passkey first.',
            StatusCodes.UNAUTHORIZED,
          ),
        );
      }

      // Fetch registered passkeys for the user
      const userPasskeys = await Passkey.find({
        user: user._id,
      });

      // Handle case when user has no passkeys
      if (!userPasskeys || userPasskeys.length === 0) {
        return next(
          new HTTPException(
            'No passkeys registered for this account. Please register a passkey first.',
            StatusCodes.BAD_REQUEST,
          ),
        );
      }

      // Generate WebAuthn authentication options
      const options = await generateAuthenticationOptions({
        rpID: String(parse(req.hostname).domain),
        allowCredentials: userPasskeys.map((passkey) => ({
          id: passkey.credentialID,
          transports: passkey.transports,
        })),
        userVerification: 'preferred',
      });

      // Save authentication challenge in Redis with TTL
      await nodeClient.setEx(
        `auth_challenge:${user._id}`,
        300,
        JSON.stringify({ challenge: options.challenge }),
      );

      // Send authentication options to client
      res.status(StatusCodes.OK).json({
        status: Status.SUCCESS,
        message:
          'Passkey authentication initiated! Follow the instructions to securely sign in.',
        payload: {
          options,
          email,
        },
      });
    },
  );

  public verifyAuthenticationResponse: RequestHandler = catchAsync(
    async (
      req: IVerifyAuthenticationRequest,
      res: Response,
      next: NextFunction,
    ): Promise<void> => {
      // Extract email and credential from request body
      const { email, credential } = req.body;

      // Find user by email
      const user = await this.model?.findOne({ 'profile.email': email }).exec();

      // Handle case when user is not found
      if (!user) {
        return next(
          new HTTPException(
            'No account found with this email. Please check and try again.',
            StatusCodes.UNAUTHORIZED,
          ),
        );
      }

      if (!user.auth.passKeys.enabled) {
        return next(
          new HTTPException(
            'No passkeys are registered for this account. Please register a passkey first.',
            StatusCodes.UNAUTHORIZED,
          ),
        );
      }

      // Retrieve stored authentication challenge from Redis
      const storedChallenge = await nodeClient.get(
        `auth_challenge:${user._id}`,
      );

      // Handle missing challenge
      if (!storedChallenge) {
        return next(
          new HTTPException('Challenge not found', StatusCodes.NOT_FOUND),
        );
      }

      // Parse the stored challenge
      const { challenge } = JSON.parse(storedChallenge);

      // Find the passkey used for this authentication
      const passkey = await Passkey.findOne({
        credentialID: credential.id,
        user: user._id,
      }).setOptions({
        writeConcern: {
          w: 'majority',
          j: true,
          wtimeout: 5000,
        },
      });

      // Handle case when passkey is not found
      if (!passkey) {
        return next(
          new HTTPException(
            'No passkeys are registered for this account. Please register a passkey first.',
            StatusCodes.NOT_FOUND,
          ),
        );
      }

      // Verify the authentication response
      const verification = await verifyAuthenticationResponse({
        response: credential,
        expectedChallenge: challenge,
        expectedOrigin: String(req.headers.origin),
        expectedRPID: String(parse(req.hostname).domain),
        credential: {
          id: passkey?.credentialID,
          publicKey: new Uint8Array(passkey?.publicKey.split(',').map(Number)),
          counter: passkey?.counter,
          transports: passkey?.transports,
        },
      });

      // Destructure verification results
      const { verified, authenticationInfo } = verification;

      // Handle failed verification
      if (!verified || !authenticationInfo) {
        return next(
          new HTTPException(
            'Authentication verification failed',
            StatusCodes.UNAUTHORIZED,
          ),
        );
      }

      // Update passkey counter
      passkey.counter = authenticationInfo.newCounter;
      await passkey.save();

      // Update user session with passkey info
      const newSession: IUser = await this.model
        .findByIdAndUpdate(
          user._id,
          {
            $set: {
              'auth.passKeys.count': authenticationInfo.newCounter,
              'auth.passKeys.lastUsedAt': new Date(),
            },
          },
          { returnDocument: 'after' },
        )
        .select('-auth.password');

      // Remove used challenge from Redis
      await nodeClient.del(`auth_challenge:${user._id}`);

      // Attach new session and remember flag to request
      req.self = newSession;
      req.remember = true;

      // Proceed to next middleware
      next();
    },
  );

  public findPasskeys: RequestHandler = catchAsync(
    async (req: Request, res: Response): Promise<void> => {
      const user = req.self;

      const passkeys = await Passkey.find({ user: user._id }).select(
        'name device browser formFactor createdAt',
      );

      res.status(StatusCodes.OK).json({
        status: Status.SUCCESS,
        message: 'Passkey information retrieved successfully.',
        payload: {
          passkeys,
        },
      });
    },
  );

  public unregisterPasskey: RequestHandler = catchAsync(
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      const passkey = await Passkey.findByIdAndDelete(req.params.id);

      if (!passkey) {
        return next(
          new HTTPException(
            'No passkey found. Please try again.',
            StatusCodes.NOT_FOUND,
          ),
        );
      }

      const user = await this.model?.findByIdAndUpdate(
        req.self._id,
        [
          {
            $set: {
              'auth.passKeys.count': {
                $max: [{ $subtract: ['$auth.passKeys.count', 1] }, 0],
              },
              'auth.passKeys.enabled': {
                $gt: [{ $subtract: ['$auth.passKeys.count', 1] }, 0],
              },
            },
          },
        ],
        {
          returnDocument: 'after',
          updatePipeline: true,
        },
      );

      if (!user) {
        return next(
          new HTTPException('Oops! User does not exist', StatusCodes.NOT_FOUND),
        );
      }

      await this.refreshCache(user);

      res.status(StatusCodes.NO_CONTENT).send();
    },
  );

  // Auth MFA
  public startEnabled2FA: RequestHandler = catchAsync(
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      // Authenticated user from middleware
      const user = req.self;

      // Generate a new 2FA secret using hashed email
      const secret = speakeasy.generateSecret({
        name: `Devmun-FMS:${Crypto.hash(user?.profile.email)}`,
      });

      // If otpauth_url is missing, return server error
      if (!secret.otpauth_url) {
        return next(
          new HTTPException(
            'Failed to generate otpauth_url',
            StatusCodes.INTERNAL_SERVER_ERROR,
          ),
        );
      }

      // Generate Base64 QR code from otpauth URL
      const qrDataURL = await QRCode.toDataURL(secret.otpauth_url);

      // Send 2FA setup data to client
      res.status(StatusCodes.OK).json({
        status: 'success',
        message: '2FA setup generated successfully.',
        payload: {
          secret: secret.base32,
          otpauth_url: secret.otpauth_url,
          qrcode: qrDataURL,
        },
      });
    },
  );

  public finishEnabled2FA: RequestHandler = catchAsync(
    async (
      req: IFinishEnabled2FARequest,
      res: Response,
      next: NextFunction,
    ): Promise<void> => {
      // Extract TOTP code and secret from request body
      const { totp, secret } = req.body;

      // Verify TOTP token using base32 secret
      const isVerified = speakeasy.totp.verify({
        secret,
        encoding: 'base32',
        token: totp,
        window: 1,
      });

      // If verification fails, reject request
      if (!isVerified) {
        return next(
          new HTTPException(
            'Invalid or expired 2FA token.',
            StatusCodes.UNAUTHORIZED,
          ),
        );
      }

      // Encrypt the 2FA secret before storing
      const encryptedSecret = await Crypto.cipheriv(
        secret,
        config.CRYPTO_SECRET,
      );

      // Generate recovery (backup) codes
      const encryptedCodes = await this.recoveryCodes();

      // Update user with 2FA enabled, secret, and backup codes
      const user = await this.model
        .findByIdAndUpdate(
          req.self._id,
          {
            $set: {
              'auth.twoFA.enabled': true,
              'auth.twoFA.secret': encryptedSecret,
              'auth.twoFA.backupCodes': encryptedCodes,
            },
          },
          {
            returnDocument: 'after',
          },
        )
        .exec();

      // If user not found, session is likely expired
      if (!user) {
        return next(
          new HTTPException(
            'Your session may have expired. Please log in again.',
            StatusCodes.UNAUTHORIZED,
          ),
        );
      }

      // Refresh cached user data after update
      await this.refreshCache(user);

      // Send success response
      res.status(StatusCodes.OK).json({
        status: 'success',
        message: '2FA has been confirmed and enabled.',
      });
    },
  );

  public handshake2FA: RequestHandler = catchAsync(
    async (
      req: IHandshake2FARequest,
      res: Response,
      next: NextFunction,
    ): Promise<void> => {
      // Extract TOTP from request body
      const { totp } = req.body;
      const host = parse(req.hostname).hostname;
      const { PENDING_2FA } = DOMAIN_COOKIE[host as keyof typeof DOMAIN_COOKIE];

      // Get pending 2FA session data
      const data = await this.get2FA(req, res);

      // If no pending session, treat as expired
      if (!data) {
        return next(
          new HTTPException(
            'Your 2FA session has expired. Please log in again to continue.',
            StatusCodes.UNAUTHORIZED,
          ),
        );
      }

      // Destructure user and remember preference
      const { authUser, fullUser, remember } = data;

      // Decrypt stored 2FA secret
      const base32Secret = await Crypto.decipheriv<string>(
        authUser?.auth.twoFA.secret,
        config.CRYPTO_SECRET,
      );

      // Verify the provided TOTP code
      const isVerified = speakeasy.totp.verify({
        secret: base32Secret ?? '',
        encoding: 'base32',
        token: totp,
        window: 0,
      });

      // If verification fails, reject request
      if (!isVerified) {
        return next(
          new HTTPException(
            'Invalid or expired 2FA token. Check your Google Authenticator app and try again.',
            StatusCodes.UNAUTHORIZED,
          ),
        );
      }

      // Clear pending 2FA cookie after successful verification
      this.clearCookie(res, PENDING_2FA);

      // Attach authenticated user to request
      req.self = fullUser;

      // Preserve remember-me preference
      req.remember = remember;

      // Continue to next middleware
      next();
    },
  );

  public generateBackupCodes2FA: RequestHandler = catchAsync(
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      // Fetch the authenticated user from DB
      const user = await this.model?.findById(req.self._id);

      // If user not found, session may have expired
      if (!user) {
        return next(
          new HTTPException(
            'Your session may have expired. Please log in again.',
            StatusCodes.UNAUTHORIZED,
          ),
        );
      }

      // Check if 2FA is enabled for the user
      if (!user.auth?.twoFA?.enabled) {
        return next(
          new HTTPException(
            'Two-factor authentication is not enabled. Please enable 2FA first.',
            StatusCodes.BAD_REQUEST,
          ),
        );
      }

      // Generate new recovery (backup) codes
      const encryptedCodes = await this.recoveryCodes();

      // Update user's backup codes in DB
      await this.model.findByIdAndUpdate(req.self._id, {
        $set: {
          'auth.twoFA.backupCodes': encryptedCodes,
        },
      });

      // Send success response
      res.status(StatusCodes.OK).json({
        status: 'success',
        message: '2FA backup codes generated successfully.',
      });
    },
  );

  public findBackupCodes2FA: RequestHandler = catchAsync(
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      const user = await this.model
        .findById(req.self._id)
        .select('auth.twoFA.backupCodes');

      if (!user) {
        return next(
          new HTTPException(
            'Your session may have expired. Please log in again.',
            StatusCodes.UNAUTHORIZED,
          ),
        );
      }

      const decryptedCodes = await this.decryptCodes(
        user.auth.twoFA.backupCodes,
      );

      res.status(StatusCodes.OK).json({
        status: 'success',
        message: '2FA backup codes retrieved successfully.',
        payload: {
          codes: decryptedCodes,
        },
      });
    },
  );

  public handshakeBackupCode2FA: RequestHandler = catchAsync(
    async (
      req: IHandshakeBackupCode2FARequest,
      res: Response,
      next: NextFunction,
    ): Promise<void> => {
      const code = this.formatCode(req.body.code);

      const data = await this.get2FA(req, res);
      if (!data) {
        return next(
          new HTTPException(
            'Your 2FA session has expired. Please log in again to continue.',
            StatusCodes.UNAUTHORIZED,
          ),
        );
      }

      const { authUser, fullUser, remember } = data;

      const decryptedCodes = await this.decryptCodes(
        authUser.auth.twoFA.backupCodes,
      );

      if (!decryptedCodes.includes(code)) {
        return next(
          new HTTPException(
            'Invalid backup code. Please try again.',
            StatusCodes.UNAUTHORIZED,
          ),
        );
      }

      const remainingCodes = decryptedCodes.filter((c) => c !== code);
      const encryptedRemaining = await this.encryptCodes(remainingCodes);
      authUser.auth.twoFA.backupCodes = encryptedRemaining;

      await authUser.save();

      // this.clearCookie(res, 'pending2FA');

      req.self = fullUser;
      req.remember = remember;
      next();
    },
  );

  public disabled2FA: RequestHandler = catchAsync(
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      const user = await this.model.findByIdAndUpdate(req.self.id, {
        $set: {
          'auth.twoFA.enabled': false,
        },
        $unset: {
          'auth.twoFA.backupCodes': 1,
          'auth.twoFA.secret': 1,
        },
      });

      if (!user) {
        return next(
          new HTTPException('Oops! User does not exist', StatusCodes.NOT_FOUND),
        );
      }

      await this.refreshCache(user);

      res.status(StatusCodes.OK).json({
        status: 'success',
        message: '2FA removed successfully.',
      });
    },
  );
}
