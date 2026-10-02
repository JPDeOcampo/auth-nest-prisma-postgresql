export type EmailStatus = "VERIFIED" | "UNVERIFIED" | "BLOCKED";
export type OAuthProviderDTO = "LOCAL" | "GOOGLE" | "GITHUB";

export interface RegisterUserDTO {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface EmailChangeRequestDTO {
  id: string;
  userId: string;
  newEmail: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface UserDTO {
  id?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  loginCount?: number;
  emailStatus?: "VERIFIED" | "UNVERIFIED" | "BLOCKED";
  emailChangeRequests?: EmailChangeRequestDTO[];
  accounts?: {
    provider: string;
    providerAccountId: string;
  }[];
  profile?: {
    coverType: string;
    coverValue: string;
    profileType: string;
    profileValue: string;
  };
  settings?: { darkMode: boolean };
}

export interface UserUpdateDTO {
  firstName?: string;
  lastName?: string;
  email?: string;
  emailStatus?: EmailStatus;
  ipAddress?: string;
  userAgent?: string;
}

export interface UserUpdateSettingsDTO {
  darkMode: boolean;
}

export interface LoginUserDTO {
  email: string;
  password: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface UpdatePasswordDTO {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}
