import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { AppSettingsService } from '../app-settings/app-settings.service';

@Injectable()
export class MailService {
  constructor(private readonly settings: AppSettingsService) {}

  async sendPasswordReset(toEmail: string, toName: string, resetToken: string): Promise<void> {
    const [host, portStr, user, pass, fromName, fromEmail, secureStr] = await Promise.all([
      this.settings.get('smtp_host'),
      this.settings.get('smtp_port'),
      this.settings.get('smtp_user'),
      this.settings.get('smtp_pass'),
      this.settings.get('smtp_from_name'),
      this.settings.get('smtp_from_email'),
      this.settings.get('smtp_secure'),
    ]);

    if (!host || !user || !pass) {
      throw new ServiceUnavailableException(
        'Email sending is not configured. Ask a super admin to set SMTP settings.',
      );
    }

    const port = parseInt(portStr ?? '587');
    const secure = secureStr === 'true';
    const displayName = fromName ?? 'Reconciliation App';
    const senderEmail = fromEmail ?? user;
    const frontendUrl = process.env.FRONTEND_URL ?? 'https://recon-ae.vercel.app';
    const resetUrl = `${frontendUrl}/reset-password?token=${resetToken}`;

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
    });

    await transporter.sendMail({
      from: `"${displayName}" <${senderEmail}>`,
      to: toEmail,
      subject: 'Reset your password — Reconciliation App',
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;color:#111;">
          <h2 style="font-size:20px;margin-bottom:8px;">Password Reset</h2>
          <p style="color:#555;margin-bottom:24px;">Hi ${toName || toEmail},</p>
          <p style="color:#555;">We received a request to reset your password. Click the button below — the link expires in <strong>1 hour</strong>.</p>
          <a href="${resetUrl}"
             style="display:inline-block;margin:24px 0;padding:12px 24px;background:#2563eb;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">
            Reset Password
          </a>
          <p style="color:#999;font-size:12px;">If you didn't request this, ignore this email — your password won't change.</p>
          <hr style="border:none;border-top:1px solid #eee;margin:24px 0;" />
          <p style="color:#bbb;font-size:11px;">Reconciliation App · aarij co</p>
        </div>
      `,
    });
  }

  async sendTestEmail(toEmail: string): Promise<void> {
    const [host, portStr, user, pass, fromName, fromEmail, secureStr] = await Promise.all([
      this.settings.get('smtp_host'),
      this.settings.get('smtp_port'),
      this.settings.get('smtp_user'),
      this.settings.get('smtp_pass'),
      this.settings.get('smtp_from_name'),
      this.settings.get('smtp_from_email'),
      this.settings.get('smtp_secure'),
    ]);

    if (!host || !user || !pass) {
      throw new ServiceUnavailableException('SMTP not configured');
    }

    const port = parseInt(portStr ?? '587');
    const secure = secureStr === 'true';
    const displayName = fromName ?? 'Reconciliation App';
    const senderEmail = fromEmail ?? user;

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
    });

    await transporter.sendMail({
      from: `"${displayName}" <${senderEmail}>`,
      to: toEmail,
      subject: 'SMTP test — Reconciliation App',
      text: 'SMTP is configured correctly. This is a test email.',
    });
  }
}
