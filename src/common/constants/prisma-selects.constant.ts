export const USER_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  role: true,
  status: true,
  loginCount: true,
  lastLoginAt: true,
  emailStatus: true,
  emailVerifiedAt: true,
  emailChangeRequest: {
    select: {
      id: true,
      userId: true,
      newEmail: true,
      expiresAt: true,
      ipAddress: true,
      userAgent: true,
    },
  },
  profile: {
    select: {
      profileType: true,
      profileValue: true,
      coverType: true,
      coverValue: true,
    },
  },
  settings: {
    select: {
      darkMode: true,
    },
  },
  accounts: {
    select: {
      provider: true,
      providerAccountId: true,
    },
  },
} as const;
