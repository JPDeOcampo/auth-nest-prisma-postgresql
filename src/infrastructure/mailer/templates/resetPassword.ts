import { emailLayout } from "../emailLayout";

interface ResetPasswordProps {
  firstName: string;
  resetCode: string;
}

export const resetPasswordTemplate = ({
  firstName,
  resetCode,
}: ResetPasswordProps) => {
  const content = `
      <p>Hi ${firstName},</p>

       <p>
            You requested a password reset.
            Please use the one-time code below to reset your password:
        </p>
      <div
        style="
          font-size:24px;
          font-weight:bold;
          background:#f0f0f0;
          padding:14px;
          text-align:center;
          letter-spacing:18px;
          border-radius:6px;
        "
      >
        ${resetCode}
      </div>

     <p>
        This code will expire in 2 minutes.
        If you didn't request a password reset,
        please ignore this email.
    </p>
  `;

  return emailLayout({
    title: "Password Reset Request",
    content,
  });
};
