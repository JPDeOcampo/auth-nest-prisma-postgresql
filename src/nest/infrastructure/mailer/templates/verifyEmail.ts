import { emailLayout } from "../emailLayout";

interface VerifyEmailTemplateParams {
  firstName: string;
  verificationLink: string;
  loginCount?: number;
}

export const verifyEmailTemplate = ({
  firstName,
  verificationLink,
  loginCount,
}: VerifyEmailTemplateParams) => {
  const isNewAccount = loginCount === 0;

  const content = `
  <div
    style="
      font-size:16px;
      line-height:1.6;
      margin-bottom:20px;
    "
  >
    <p>Hi ${firstName},</p>

    ${
      isNewAccount
        ? `
          <p>Welcome to XYZ!</p>
          <p>Your account has been created successfully.</p>
          <p>Please verify your email address by clicking the link below:</p>
        `
        : `
          <p>
            We received a request to change the email address associated with your XYZ account.
          </p>
          <p>
            Please verify your new email address by clicking the link below:
          </p>
        `
    }

    <p
      style="
        word-break:break-all;
        color:#2b7fff;
        font-size:14px;
      "
    >
      ${verificationLink}
    </p>

    <p>
      This link will expire in 15 minutes.
    </p>

    ${
      isNewAccount
        ? `
          <p>
            If you did not create a XYZ account, you can safely ignore this email.
          </p>
        `
        : `
          <p>
            If you did not request this email change, you can safely ignore this email. Your account email address will remain unchanged unless this verification is completed.
          </p>
        `
    }
  </div>
`;

  return emailLayout({
    title: isNewAccount ? "Verify Your Email" : "Verify Your New Email Address",
    content,
  });
};
