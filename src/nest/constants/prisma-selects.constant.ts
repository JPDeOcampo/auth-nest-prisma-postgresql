export const USER_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  loginCount: true,
  lastLoginAt: true,
  emailStatus: true,
  emailChangeRequests: {
    select: {
      id: true,
      userId: true,
      newEmail: true,
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
