import { BrevoClient } from '@getbrevo/brevo';

let client: BrevoClient | null = null;

const getClient = () => {
  if (!client) {
    const apiKey = process.env.BREVO_API_KEY || '';
    client = new BrevoClient({
      apiKey: apiKey
    });
    console.log(`[Email Service] Initialized with Brevo API (v5)`);
  }
  return client;
};

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  attachments?: any[];
}

export const sendEmail = async ({ to, subject, html, attachments }: EmailOptions) => {
  try {
    const emailData: any = {
      subject: subject,
      htmlContent: html,
      sender: { name: "YourTales Support", email: "a8075e001@smtp-brevo.com" },
      to: [{ email: to }],
    };

    if (attachments && attachments.length > 0) {
      emailData.attachment = attachments.map(att => ({
        content: att.content.toString('base64'),
        name: att.filename
      }));
    }

    const client = getClient();
    const response = await client.transactionalEmails.sendTransacEmail(emailData);
    
    // In v5, response might have a different structure, usually it returns the result directly or in .data
    const messageId = response.messageId; 
    
    console.log(`Email sent successfully to ${to}: ${messageId}`);
    return { success: true, messageId };
  } catch (error: any) {
    console.error('Error sending email via Brevo API:', error.response ? error.response.data : error);
    return { success: false, error };
  }
};
