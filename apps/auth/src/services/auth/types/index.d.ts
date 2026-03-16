import {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { Request } from 'express';

export interface ISignupRequest extends Request {
  body: {
    familyName: string;
    givenName: string;
    email: string;
    password: string;
  };
}

export interface IVerifyRequest extends Request {
  body: {
    otp: string;
    token: string;
  };
}

export interface ISigninRequest extends Request {
  body: {
    email: string;
    password: string;
    remember: boolean;
  };
}

export interface IUpdateProfileRequest extends Request {
  body: {
    profile: {
      familyName: string;
      givenName: string;
    };
  };
}

export interface IStartPasswordResetRequest extends Request {
  body: {
    email: string;
  };
}

export interface IFinishPasswordResetRequest extends Request {
  body: {
    newPassword: string;
  };
}

export interface IChangePasswordRequest extends Request {
  body: {
    currentPassword: string;
    newPassword: string;
  };
}

export interface IStartEmailChangeRequest extends Request {
  body: {
    newEmail: string;
    password: string;
  };
}

export interface IFinishEmailChangeRequest extends Request {
  body: {
    code: string;
  };
}

export interface IVerifyRegistrationRequest extends Request {
  body: {
    credential: RegistrationResponseJSON;
  };
}

export interface IGenerateAuthenticationOptionsRequest extends Request {
  body: {
    email: string;
  };
}

export interface IVerifyAuthenticationRequest extends Request {
  body: {
    email: string;
    credential: AuthenticationResponseJSON;
  };
}

export interface IFinishEnabled2FARequest extends Request {
  body: {
    totp: string;
    secret: string;
  };
}

export interface IHandshake2FARequest extends Request {
  body: {
    totp: string;
  };
}

export interface IHandshakeBackupCode2FARequest extends Request {
  body: {
    code: string;
  };
}
