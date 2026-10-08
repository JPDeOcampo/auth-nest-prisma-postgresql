type UserProfileSummary = {
  profileType?: string | null;
  profileValue?: string | null;
  coverType?: string | null;
  coverValue?: string | null;
};

type UserSettingsSummary = {
  darkMode?: boolean | null;
};

type EmailChangeRequestSummary = {
  id: string;
  userId: string;
  newEmail: string;
  expiresAt?: string | Date | null;
  ipAddress?: string | null;
  userAgent?: string | null;
};

type UserPayload = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  loginCount: number;
  role?: string;
  emailStatus?: string;
  emailVerifiedAt?: string | Date | null;
  emailChangeRequest?: EmailChangeRequestSummary | null;
  /** @deprecated plural shape kept for backwards compat with older callers/tests */
  emailChangeRequests?: EmailChangeRequestSummary[] | unknown;
  profile?: UserProfileSummary | null;
  settings?: UserSettingsSummary | null;
  accounts?: Array<{ provider: string; providerAccountId: string }> | null;
};

export const serializeUserResponse = (user: UserPayload) => {
  const emailChangeRequest =
    user.emailChangeRequest ??
    (Array.isArray(user.emailChangeRequests)
      ? user.emailChangeRequests[0]
      : null) ??
    null;

  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    loginCount: user.loginCount,
    role: user.role,
    emailStatus: user.emailStatus,
    emailVerifiedAt: user.emailVerifiedAt ?? null,
    emailChangeRequest,
    profile: {
      profileType: user.profile?.profileType,
      profileValue: user.profile?.profileValue,
      coverType: user.profile?.coverType,
      coverValue: user.profile?.coverValue,
    },
    settings: {
      darkMode: user.settings?.darkMode,
    },
    accounts: user.accounts?.map(({ provider, providerAccountId }) => ({
      provider,
      providerAccountId,
    })),
  };
};
