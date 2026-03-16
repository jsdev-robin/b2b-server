import { body, param } from 'express-validator';

export const authValidator = {
  signup: [
    body('familyName')
      .trim()
      .notEmpty()
      .withMessage('First name is required')
      .isLength({ min: 2, max: 32 })
      .withMessage('Must be 2-32 characters')
      .escape(),

    body('givenName')
      .trim()
      .notEmpty()
      .withMessage('Last name is required')
      .isLength({ min: 2, max: 32 })
      .withMessage('Must be 2-32 characters')
      .escape(),

    body('email')
      .trim()
      .notEmpty()
      .withMessage('Email is required')
      .isEmail()
      .withMessage('Please enter a valid email')
      .normalizeEmail(),

    body('password')
      .notEmpty()
      .withMessage('Password is required')
      .isLength({ min: 8 })
      .withMessage('Must be at least 8 characters')
      .isStrongPassword({
        minLength: 8,
        minLowercase: 1,
        minUppercase: 1,
        minNumbers: 1,
        minSymbols: 1,
      })
      .withMessage(
        'Must contain at least 1 uppercase, 1 lowercase, 1 number, and 1 special character',
      ),

    body('passwordConfirm')
      .notEmpty()
      .withMessage('Please confirm your password')
      .custom((value, { req }) => value === req.body.password)
      .withMessage('Passwords do not match'),
  ],

  verify: [
    body('otp')
      .notEmpty()
      .withMessage('Verification code is required')
      .isNumeric()
      .withMessage('Code must be numeric')
      .isLength({ min: 6, max: 6 })
      .withMessage('Must be 6 digits'),
    body('token').notEmpty().withMessage('Token is required'),
  ],

  signin: [
    body('email')
      .trim()
      .notEmpty()
      .withMessage('Email is required')
      .isEmail()
      .withMessage('Please enter a valid email')
      .normalizeEmail(),
    body('password').notEmpty().withMessage('Password is required'),
    body('remember').optional().toBoolean(),
  ],

  updateProfile: [
    body('profile.familyName')
      .notEmpty()
      .withMessage('Family name is required'),
    body('profile.givenName').notEmpty().withMessage('Given name is required'),
  ],

  isEmail: [
    body('email')
      .isEmail()
      .withMessage('Please provide a valid email address')
      .normalizeEmail(),
  ],

  finishPasswordReset: [
    param('token').trim().notEmpty().withMessage('Token is required'),
    body('newPassword')
      .notEmpty()
      .withMessage('Password is required')
      .isLength({ min: 8 })
      .withMessage('Must be at least 8 characters')
      .isStrongPassword({
        minLength: 8,
        minLowercase: 1,
        minUppercase: 1,
        minNumbers: 1,
        minSymbols: 1,
      })
      .withMessage(
        'Must contain at least 1 uppercase, 1 lowercase, 1 number, and 1 special character',
      ),

    body('confirmNewPassword')
      .notEmpty()
      .withMessage('Please confirm your password')
      .custom((value, { req }) => value === req.body.newPassword)
      .withMessage('Passwords do not match'),
  ],

  changePassword: [
    body('currentPassword')
      .notEmpty()
      .withMessage('Current password is required'),

    body('newPassword')
      .notEmpty()
      .withMessage('Password is required')
      .isLength({ min: 8 })
      .withMessage('Must be at least 8 characters')
      .isStrongPassword({
        minLength: 8,
        minLowercase: 1,
        minUppercase: 1,
        minNumbers: 1,
        minSymbols: 1,
      })
      .withMessage(
        'Must contain at least 1 uppercase, 1 lowercase, 1 number, and 1 special character',
      )
      .custom((value, { req }) => value !== req.body.currentPassword)
      .withMessage('New password must be different from current'),

    body('confirmNewPassword')
      .notEmpty()
      .withMessage('Please confirm your new password')
      .custom((value, { req }) => value === req.body.newPassword)
      .withMessage('Passwords do not match'),
  ],

  startEmailChange: [
    body('newEmail')
      .trim()
      .notEmpty()
      .withMessage('New email is required')
      .isEmail()
      .withMessage('Please enter a valid email')
      .normalizeEmail(),

    body('confirmEmail')
      .trim()
      .notEmpty()
      .withMessage('Please confirm your email')
      .isEmail()
      .withMessage('Please enter a valid email')
      .normalizeEmail()
      .custom((value, { req }) => value === req.body.newEmail)
      .withMessage('Emails do not match')
      .custom((value, { req }) => value !== req.self?.profile.email)
      .withMessage('New email must be different from current email'),

    body('password')
      .notEmpty()
      .withMessage('Password is required for verification'),
  ],

  finishEmailChange: [
    body('code').trim().notEmpty().withMessage('Code is required'),
    param('token').trim().notEmpty().withMessage('Token is required'),
  ],

  verifyRegistrationResponse: [
    body('credential.id')
      .exists({ checkFalsy: true })
      .withMessage('id is required')
      .isString()
      .withMessage('id must be a string')
      .matches(/^[A-Za-z0-9\-_]+$/)
      .withMessage('id must be a valid Base64URL string'),

    body('credential.rawId')
      .exists({ checkFalsy: true })
      .withMessage('rawId is required')
      .isString()
      .withMessage('rawId must be a string')
      .matches(/^[A-Za-z0-9\-_]+$/)
      .withMessage('rawId must be a valid Base64URL string'),

    body('credential.response')
      .exists({ checkFalsy: true })
      .withMessage('response is required')
      .isObject()
      .withMessage('response must be an object'),

    body('credential.response.clientDataJSON')
      .exists({ checkFalsy: true })
      .withMessage('clientDataJSON is required')
      .isString()
      .withMessage('clientDataJSON must be a string')
      .matches(/^[A-Za-z0-9\-_]+$/)
      .withMessage('clientDataJSON must be a valid Base64URL string'),

    body('credential.response.attestationObject')
      .exists({ checkFalsy: true })
      .withMessage('attestationObject is required')
      .isString()
      .withMessage('attestationObject must be a string')
      .matches(/^[A-Za-z0-9\-_]+$/)
      .withMessage('attestationObject must be a valid Base64URL string'),

    body('credential.authenticatorAttachment')
      .optional()
      .isIn(['platform', 'cross-platform'])
      .withMessage(
        'authenticatorAttachment must be "platform" or "cross-platform"',
      ),

    body('credential.clientExtensionResults')
      .exists()
      .withMessage('clientExtensionResults is required')
      .isObject()
      .withMessage('clientExtensionResults must be an object'),

    body('credential.type')
      .exists({ checkFalsy: true })
      .withMessage('type is required')
      .equals('public-key')
      .withMessage('type must be "public-key"'),
  ],

  finishEnabled2FA: [
    body('totp').trim().notEmpty().withMessage('TOTP is required'),
    body('secret').trim().notEmpty().withMessage('Secret is required'),
  ],

  handshake2FA: [
    body('totp').trim().notEmpty().withMessage('TOTP is required'),
  ],

  handshakeBackupCode2FA: [
    body('code').trim().notEmpty().withMessage('Backup code is required'),
  ],

  token: [param('token').trim().notEmpty().withMessage('Token is required')],

  id: [
    param('id')
      .trim()
      .notEmpty()
      .withMessage('ID is required')
      .isMongoId()
      .withMessage('Invalid ID format'),
  ],
};
