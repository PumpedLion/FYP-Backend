import dotenv from 'dotenv';
dotenv.config();
import { sendEmail } from '../src/utils/emailService.js';
import { getOTPTemplate } from '../src/utils/emailTemplates.js';

async function testTemplates() {
  console.log('Testing Registration Template...');
  const regHtml = getOTPTemplate('Dev Rai', '12345', 'registration');
  const regResult = await sendEmail({
    to: 'devrai3457@gmail.com',
    subject: 'Verify your YourTales account (Test)',
    html: regHtml
  });
  console.log('Registration Template Result:', regResult);

  console.log('Testing Forgot Password Template...');
  const forgotHtml = getOTPTemplate('Dev Rai', '54321', 'forgot_password');
  const forgotResult = await sendEmail({
    to: 'devrai3457@gmail.com',
    subject: 'Reset your YourTales password (Test)',
    html: forgotHtml
  });
  console.log('Forgot Password Template Result:', forgotResult);
}

testTemplates();
