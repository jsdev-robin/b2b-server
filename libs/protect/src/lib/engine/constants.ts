import { Role } from '@server/types';

export const ACCESS_TTL = 30; // minutes
export const REFRESH_TTL = 3; // days

export const ACCESS_COOKIE_EXP = {
  expires: new Date(Date.now() + ACCESS_TTL * 60 * 1000),
  maxAge: ACCESS_TTL * 60 * 1000,
};

export const REFRESH_COOKIE_EXP = {
  expires: new Date(Date.now() + REFRESH_TTL * 24 * 60 * 60 * 1000),
  maxAge: REFRESH_TTL * 24 * 60 * 60 * 1000,
};

export const ENABLE_SIGNATURE = {
  signed: true,
};

export const ENABLE_DEVTUNNELS = false;

// Role-based cookie mapping
// tp8963f2-8001.asse.devtunnels.ms
// Domain booklist
export const SUB_DOMAIN = {
  [Role.SUPER_ADMIN]: 'devmun',
  [Role.GUEST]: 'role.duvmun.xyz',
};

export const RoleCookies = {
  [Role.SUPER_ADMIN]: {
    ACCESS: 'xsa1fe7',
    REFRESH: 'xsa2be3',
    PENDING_2FA: 'xsa3cd5',
    ROLE: 'xsa4role',
    DOMAIN: SUB_DOMAIN[Role.SUPER_ADMIN],
  },
  [Role.GUEST]: {
    ACCESS: 'xn1fe7',
    REFRESH: 'xn2be3',
    PENDING_2FA: 'xn3cd5',
    ROLE: 'xn4role',
    DOMAIN: SUB_DOMAIN[Role.GUEST],
  },
};

export const DOMAIN_COOKIE = {
  [SUB_DOMAIN[Role.SUPER_ADMIN]]: RoleCookies[Role.SUPER_ADMIN],
  [SUB_DOMAIN[Role.GUEST]]: RoleCookies[Role.GUEST],
};

// CT Mean Cookie type
export enum CT {
  ACCESS = 'access',
  REFRESH = 'refresh',
  PENDING_2FA = 'pending2FA',
  ROLE = 'role',
}
