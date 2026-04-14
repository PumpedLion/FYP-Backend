/**
 * Generates an HTML email template for OTP verification
 */
export const getOTPTemplate = (name: string, otp: string, type: 'registration' | 'forgot_password') => {
  const isRegistration = type === 'registration';
  const title = isRegistration ? 'YourTales Email Verification' : 'Password Reset Request';
  const actionText = isRegistration 
    ? 'Thank you for registering with YourTales. Please use the following OTP to verify your email address:'
    : 'We received a request to reset your password. Use the following OTP to proceed with the reset:';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      line-height: 1.6;
      color: #333;
      margin: 0;
      padding: 0;
    }
    .container {
      max-width: 600px;
      margin: 20px auto;
      padding: 20px;
      border: 1px solid #eee;
      border-radius: 8px;
    }
    .header {
      font-size: 24px;
      font-weight: bold;
      color: #FF8B7D; /* New brand color */
      margin-bottom: 25px;
    }
    .greeting {
      font-size: 16px;
      margin-bottom: 15px;
    }
    .content {
      font-size: 14px;
      margin-bottom: 30px;
    }
    .otp-box {
      background-color: #f5f5f5; /* Grey box */
      padding: 30px;
      text-align: center;
      border-radius: 4px;
      margin: 25px 0;
    }
    .otp-code {
      font-size: 42px;
      font-weight: bold;
      color: #FF8B7D; 
      letter-spacing: 8px;
    }
    .footer {
      font-size: 13px;
      color: #666;
      margin-top: 30px;
      border-top: 1px solid #eee;
      padding-top: 20px;
    }
    .expiry {
      color: #444;
      font-weight: 500;
      margin-bottom: 10px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">YourTales ${isRegistration ? 'Email Verification' : 'Password Reset'}</div>
    
    <div class="greeting">Hello ${name},</div>
    
    <div class="content">
      ${actionText}
    </div>
    
    <div class="otp-box">
      <div class="otp-code">${otp}</div>
    </div>
    
    <div class="footer">
      <div class="expiry">This OTP will expire in 10 minutes.</div>
      <p>If you did not request this verification, please ignore this email.</p>
      <p>
        Best regards,<br>
        <strong>The YourTales Team</strong>
      </p>
    </div>
  </div>
</body>
</html>
  `;
};
