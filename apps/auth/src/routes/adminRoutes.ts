import { Role } from '@server/types';
import express, { Router } from 'express';
import { authController, authProtect } from '../controllers/authController';
import { validationRequest } from '../middlewares/validationRequest';
import { authValidator } from '../validator/authValidator';

// const upload = multer({ storage: multer.memoryStorage() });

const router: Router = express.Router();

// ============================== Public Routes ==========================
router.post(
  '/signup',
  authValidator.signup,
  validationRequest,
  authController.signup,
);

router.post(
  '/signup/verify',
  authValidator.verify,
  validationRequest,
  authController.verify(Role.SUPER_ADMIN),
);

router.post(
  '/signin',
  authValidator.signin,
  validationRequest,
  authController.signin(Role.SUPER_ADMIN),
  authController.createSession,
);

router.post('/refresh-token', authController.refreshToken);

router.post(
  '/password/reset/start',
  authValidator.isEmail,
  validationRequest,
  authController.startPasswordReset,
);

router.patch(
  '/password/reset/finish/:token',
  authValidator.finishPasswordReset,
  validationRequest,
  authController.finishPasswordReset,
);

router.post(
  '/passkey/authentication/start',
  authValidator.isEmail,
  validationRequest,
  authController.generateAuthenticationOptions,
);

router.post(
  '/passkey/authentication/finish',
  authController.verifyAuthenticationResponse,
  authController.createSession,
);

router.post(
  '/2fa/handshake/app',
  authValidator.handshake2FA,
  validationRequest,
  authController.handshake2FA,
  authController.createSession,
);

router.post(
  '/2fa/handshake/recovery',
  authValidator.handshakeBackupCode2FA,
  validationRequest,
  authController.handshakeBackupCode2FA,
  authController.createSession,
);

// ============================== userProtected Routes =======================
router.use(
  authProtect.validateToken,
  authProtect.requireAuth,
  authProtect.restrictTo(Role.SUPER_ADMIN),
);

router
  .route('/profile')
  .get(authController.findProfile)
  .patch(
    authValidator.updateProfile,
    validationRequest,
    authController.updateProfile,
  );

// router
//   .route('/profile/avatar')
//   .patch(upload.single('img'), authController.updateAvatar);

router.post('/signout', authController.signout);
router.post(
  '/signout/:token',
  authValidator.token,
  validationRequest,
  authController.signoutSession,
);
router.post('/signout-all', authController.signoutAllSession);

router.get('/sessions', authController.findSessions);

router.patch(
  '/password/change',
  authValidator.changePassword,
  validationRequest,
  authController.changePassword,
);

router.post(
  '/email/change/start',
  authValidator.startEmailChange,
  validationRequest,
  authController.startEmailChange,
);

router.patch(
  '/email/change/finish/:token',
  authValidator.finishEmailChange,
  validationRequest,
  authController.finishEmailChange,
);

// Passkey
router.post(
  '/passkey/registration/start',
  authController.generateRegistrationOptions,
);

router.post(
  '/passkey/registration/finish',
  authValidator.verifyRegistrationResponse,
  validationRequest,
  authController.verifyRegistrationResponse,
);

router.get('/passkeys', authController.findPasskeys);
router.delete(
  '/passkeys/:id',
  authValidator.id,
  validationRequest,
  authController.unregisterPasskey,
);

// // MFA
router.get('/2fa/enabled/start', authController.startEnabled2FA);
router.patch(
  '/2fa/enabled/finish',
  authValidator.finishEnabled2FA,
  validationRequest,
  authController.finishEnabled2FA,
);

router
  .route('/2fa/backup-codes')
  .patch(authController.generateBackupCodes2FA)
  .get(authController.findBackupCodes2FA);

router.patch('/2fa/disabled', authController.disabled2FA);

export default router;
