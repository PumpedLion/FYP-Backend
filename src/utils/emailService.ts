import nodemailer from 'nodemailer';

const smtpHost = process.env.SMTP_HOST?.trim().replace(/^["']|["']$/g, '') || 'smtp-relay.brevo.com';
const smtpPort = Number(process.env.SMTP_PORT?.trim().replace(/^["']|["']$/g, '')) || 587;
const smtpUser = process.env.SMTP_USER?.trim().replace(/^["']|["']$/g, '') || '';
const smtpPass = process.env.SMTP_PASS?.trim().replace(/^["']|["']$/g, '') || '';
const smtpSecure = process.env.SMTP_SECURE?.trim().replace(/^["']|["']$/g, '') === 'true';

const transporter = nodemailer.createTransport({
  host: smtpHost,
  port: smtpPort,
  secure: smtpSecure,
  auth: {
    user: smtpUser,
    pass: smtpPass,
  },
  tls: {
    rejectUnauthorized: false
  }
});

console.log(`[Email Service] Initialized with host: ${smtpHost}, port: ${smtpPort}, secure: ${smtpSecure}`);


interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  attachments?: any[];
}

export const sendEmail = async ({ to, subject, html, attachments }: EmailOptions) => {
  try {
    const info = await transporter.sendMail({
      from: `"YourTales Support" <${smtpUser}>`,
      to,
      subject,
      html,
      attachments,
    });
    console.log(`Email sent successfully to ${to}: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (error) {

    console.error('Error sending email:', error);
    return { success: false, error };
  }
};
