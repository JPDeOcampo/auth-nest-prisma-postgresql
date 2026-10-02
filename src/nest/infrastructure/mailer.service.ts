import { Injectable, Logger } from "@nestjs/common";
import nodemailer, { type Transporter } from "nodemailer";

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
}

@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);
  private readonly transporter: Transporter;

  constructor() {
    const isProduction = process.env.NODE_ENV === "production";

    this.transporter = nodemailer.createTransport({
      host: isProduction ? "smtp-relay.brevo.com" : "smtp.gmail.com",
      port: isProduction ? 587 : 465,
      secure: !isProduction,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });
  }

  async send(message: MailMessage): Promise<boolean> {
    try {
      await this.transporter.sendMail({
        from:
          process.env.NODE_ENV === "production"
            ? process.env.EMAIL_FROM
            : process.env.EMAIL_USER,
        ...message,
      });

      return true;
    } catch (error) {
      this.logger.error("Failed to send email", error);
      return false;
    }
  }
}
