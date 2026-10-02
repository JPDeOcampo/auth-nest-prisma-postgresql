type UserProfileSummary = {
  profileType?: string | null;
  profileValue?: string | null;
  coverType?: string | null;
  coverValue?: string | null;
};

type UserSettingsSummary = {
  darkMode?: boolean | null;
};

type UserPayload = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  loginCount: number;
  emailStatus?: string;
  emailChangeRequests?: unknown[];
  profile?: UserProfileSummary | null;
  settings?: UserSettingsSummary | null;
  accounts?: Array<{ provider: string; providerAccountId: string }> | null;
};

export const serializeUserResponse = (user: UserPayload) => ({
  id: user.id,
  firstName: user.firstName,
  lastName: user.lastName,
  email: user.email,
  loginCount: user.loginCount,
  emailStatus: user.emailStatus,
  emailChangeRequests: user.emailChangeRequests,
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
});
