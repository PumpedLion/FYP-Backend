import dotenv from 'dotenv';
dotenv.config();
import { sendEmail } from '../src/utils/emailService.js';

async function test() {
  console.log('Testing Brevo API Email Sending...');
  const result = await sendEmail({
    to: 'devrai3457@gmail.com',
    subject: 'Test Email from Brevo API',
    html: '<h1>Hello!</h1><p>This is a test email sent using the Brevo API SDK instead of SMTP.</p>'
  });
  console.log('Result:', result);
}

test();
