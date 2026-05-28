import nodemailer from "nodemailer";

const sendEmail = async (to: string, otp: string) => {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  const logoUrl = "https://www.tizzygo.com/tizzy-logo.jpg";

  const emailHtml = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <style>
      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }
      
      body {
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        line-height: 1.6;
        color: #333;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        margin: 0;
        padding: 20px;
        min-height: 100vh;
      }
      
      .email-container {
        max-width: 650px;
        margin: 0 auto;
        background: #ffffff;
        border-radius: 20px;
        overflow: hidden;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.1);
        border: 1px solid #e8e8e8;
      }
      
      .header {
        background: linear-gradient(135deg, #0d00ffff 0%, #7c3aed 100%);
        padding: 40px 30px;
        text-align: center;
        position: relative;
        overflow: hidden;
      }
      
      .header::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 100" fill="%23ffffff" opacity="0.1"><polygon points="1000,100 1000,0 0,100"/></svg>');
        background-size: cover;
      }
      
      .logo-container {
        position: relative;
        z-index: 2;
        margin-bottom: 20px;
      }
      
      .logo {
        height: 70px;
        filter: brightness(0) invert(1);
      }
      
      .header h1 {
        color: white;
        font-size: 32px;
        font-weight: 700;
        margin: 0;
        position: relative;
        z-index: 2;
        text-shadow: 0 2px 4px rgba(0,0,0,0.1);
      }
      
      .header-subtitle {
        color: rgba(255, 255, 255, 0.9);
        font-size: 16px;
        font-weight: 400;
        margin-top: 8px;
        position: relative;
        z-index: 2;
      }
      
      .content {
        padding: 50px 40px;
        background: #ffffff;
      }
      
      .greeting {
        font-size: 18px;
        color: #4b5563;
        margin-bottom: 25px;
        font-weight: 500;
      }
      
      .intro-text {
        font-size: 16px;
        color: #6b7280;
        margin-bottom: 35px;
        line-height: 1.7;
      }
      
      .otp-section {
        background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
        border-radius: 16px;
        padding: 40px 30px;
        text-align: center;
        margin: 40px 0;
        border: 1px solid #e2e8f0;
        position: relative;
      }
      
      .otp-section::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: 4px;
        background: linear-gradient(135deg, #0099ffff, #7c3aed);
        border-radius: 16px 16px 0 0;
      }
      
      .otp-label {
        font-size: 14px;
        color: #64748b;
        text-transform: uppercase;
        letter-spacing: 1px;
        font-weight: 600;
        margin-bottom: 15px;
        display: block;
      }
      
      .otp-code {
        font-size: 48px;
        font-weight: 800;
        color: #ffffffff;
        letter-spacing: 8px;
        margin: 20px 0;
        font-family: 'Courier New', monospace;
        background: linear-gradient(135deg, #00ccffff, #7c3aed);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        text-shadow: 0 4px 8px rgba(79, 70, 229, 0.1);
      }
      
      .otp-instruction {
        font-size: 15px;
        color: #475569;
        margin: 20px 0;
        line-height: 1.6;
      }
      
      .timer-container {
        background: #fee2e2;
        border: 1px solid #fecaca;
        border-radius: 12px;
        padding: 16px;
        margin: 25px 0;
        display: inline-flex;
        align-items: center;
        gap: 12px;
      }
      
      .timer-icon {
        width: 20px;
        height: 20px;
        color: #dc2626;
      }
      
      .timer-text {
        color: #dc2626;
        font-weight: 600;
        font-size: 15px;
      }
      
      .security-notice {
        background: #f0f9ff;
        border: 1px solid #bae6fd;
        border-radius: 12px;
        padding: 20px;
        margin: 30px 0;
      }
      
      .security-title {
        color: #0369a1;
        font-weight: 600;
        margin-bottom: 8px;
        font-size: 15px;
      }
      
      .security-content {
        color: #0c4a6e;
        font-size: 14px;
        line-height: 1.6;
      }
      
      .steps-section {
        margin: 40px 0;
        padding: 30px;
        background: #f8fafc;
        border-radius: 16px;
        border: 1px solid #e2e8f0;
      }
      
      .steps-title {
        font-size: 18px;
        font-weight: 600;
        color: #1e293b;
        margin-bottom: 25px;
        text-align: center;
      }
      
      .steps-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 20px;
        margin-top: 25px;
      }
      
      .step-item {
        text-align: center;
        padding: 20px;
        background: white;
        border-radius: 12px;
        border: 1px solid #e2e8f0;
      }
      
      .step-number {
        width: 40px;
        height: 40px;
        background: linear-gradient(135deg, #4f46e5, #7c3aed);
        color: white;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 700;
        margin: 0 auto 15px;
        font-size: 18px;
        line-height: 1;
        padding: 0;
      }
      
      .step-text {
        font-size: 14px;
        color: #475569;
        line-height: 1.5;
      }
      
      .support-section {
        text-align: center;
        margin: 40px 0 30px;
        padding: 30px;
        background: linear-gradient(135deg, #f8fafc, #f1f5f9);
        border-radius: 16px;
        border: 1px solid #e2e8f0;
      }
      
      .support-title {
        font-size: 18px;
        font-weight: 600;
        color: #1e293b;
        margin-bottom: 15px;
      }
      
      .support-contact {
        color: #4f46e5;
        font-weight: 600;
        font-size: 16px;
        margin: 10px 0;
      }
      
      .support-hours {
        color: #64748b;
        font-size: 14px;
        margin-top: 8px;
      }
      
      .closing {
        text-align: center;
        margin: 40px 0 20px;
      }
      
      .closing-main {
        font-size: 16px;
        color: #1e293b;
        font-weight: 600;
        margin-bottom: 8px;
      }
      
      .closing-team {
        font-size: 15px;
        color: #4f46e5;
        font-weight: 600;
      }
      
      .footer {
        background: linear-gradient(135deg, #1e293b, #334155);
        color: white;
        padding: 40px 30px;
        text-align: center;
      }
      
      .footer-links {
        display: flex;
        justify-content: center;
        gap: 30px;
        margin-bottom: 25px;
        flex-wrap: wrap;
      }
      
      .footer-link {
        color: #cbd5e1;
        text-decoration: none;
        font-size: 14px;
        transition: color 0.3s ease;
      }
      
      .footer-link:hover {
        color: #ffffff;
      }
      
      .footer-info {
        font-size: 12px;
        color: #94a3b8;
        line-height: 1.6;
        margin-bottom: 20px;
      }
      
      .social-links {
        display: flex;
        justify-content: center;
        gap: 20px;
        margin: 25px 0;
      }
      
      .social-icon {
        width: 24px;
        height: 24px;
        color: #cbd5e1;
      }
      
      .copyright {
        font-size: 12px;
        color: #64748b;
        margin-top: 20px;
        padding-top: 20px;
        border-top: 1px solid #334155;
      }
      
      @media (max-width: 600px) {
        body {
          padding: 10px;
        }
        
        .content {
          padding: 30px 20px;
        }
        
        .header {
          padding: 30px 20px;
        }
        
        .header h1 {
          font-size: 24px;
        }
        
        .otp-code {
          font-size: 36px;
          letter-spacing: 6px;
        }
        
        .steps-grid {
          grid-template-columns: 1fr;
        }
        
        .footer-links {
          flex-direction: column;
          gap: 15px;
        }
      }
    </style>
  </head>
  <body>
    <div class="email-container">
      <div class="header">
        <div class="logo-container">
          <img src="${logoUrl}" alt="TizzyGo Logo" class="logo">
        </div>
        <h1>Account Verification Required</h1>
        <div class="header-subtitle">Secure your TizzyGo account</div>
      </div>
      
      <div class="content">
        <div class="greeting">Dear Valued User,</div>
        
        <div class="intro-text">
          Welcome to TizzyGo! We're excited to have you on board. To ensure the security of your account and enable all features, we need to verify your email address. This one-time verification process helps us maintain a secure environment for all our users.
        </div>
        
        <div class="otp-section">
          <span class="otp-label">Your Verification Code</span>
          <div class="otp-code">${otp}</div>
          <div class="otp-instruction">
            Enter this 6-digit verification code in the TizzyGo application to complete your account verification process.
          </div>
          
          <div class="timer-container">
            <svg class="timer-icon" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/>
            </svg>
            <div class="timer-text">This code will expire in 5 minutes for security reasons</div>
          </div>
        </div>
        
        <div class="security-notice">
          <div class="security-title">Security Advisory</div>
          <div class="security-content">
            For your protection, never share this verification code with anyone. TizzyGo representatives will never ask for this code. If you didn't request this verification, please ignore this email and contact our support team immediately.
          </div>
        </div>
        
        <div class="steps-section">
          <div class="steps-title">Complete Your Verification in 3 Simple Steps</div>
          <div class="steps-grid">
            <div class="step-item">
              <div class="step-number">1</div>
              <div class="step-text">Return to the TizzyGo application or website</div>
            </div>
            <div class="step-item">
              <div class="step-number">2</div>
              <div class="step-text">Enter the verification code shown above</div>
            </div>
            <div class="step-item">
              <div class="step-number">3</div>
              <div class="step-text">Click verify and start using your account</div>
            </div>
          </div>
        </div>
        
        <div class="support-section">
          <div class="support-title">Need Assistance?</div>
          <div class="support-contact">support@tizzygo.com</div>
          <div class="support-contact">+1 (555) 123-4567</div>
          <div class="support-hours">Available 24/7 for your convenience</div>
        </div>
        
        <div class="closing">
          <div class="closing-main">Thank you for choosing TizzyGo as your trusted partner.</div>
          <div class="closing-team">The TizzyGo Team</div>
        </div>
      </div>
      
      <div class="footer">
        <div class="footer-links">
          <a href="#" class="footer-link">Privacy Policy</a>
          <a href="#" class="footer-link">Terms of Service</a>
          <a href="#" class="footer-link">Help Center</a>
          <a href="#" class="footer-link">Contact Us</a>
        </div>
        
        <div class="social-links">
          <svg class="social-icon" viewBox="0 0 24 24" fill="currentColor">
            <path d="M24 4.557c-.883.392-1.832.656-2.828.775 1.017-.609 1.798-1.574 2.165-2.724-.951.564-2.005.974-3.127 1.195-.897-.957-2.178-1.555-3.594-1.555-3.179 0-5.515 2.966-4.797 6.045-4.091-.205-7.719-2.165-10.148-5.144-1.29 2.213-.669 5.108 1.523 6.574-.806-.026-1.566-.247-2.229-.616-.054 2.281 1.581 4.415 3.949 4.89-.693.188-1.452.232-2.224.084.626 1.956 2.444 3.379 4.6 3.419-2.07 1.623-4.678 2.348-7.29 2.04 2.179 1.397 4.768 2.212 7.548 2.212 9.142 0 14.307-7.721 13.995-14.646.962-.695 1.797-1.562 2.457-2.549z"/>
          </svg>
          <svg class="social-icon" viewBox="0 0 24 24" fill="currentColor">
            <path d="M22.46 6c-.77.35-1.6.58-2.46.69.88-.53 1.56-1.37 1.88-2.38-.83.5-1.75.85-2.72 1.05C18.37 4.5 17.26 4 16 4c-2.35 0-4.27 1.92-4.27 4.29 0 .34.04.67.11.98C8.28 9.09 5.11 7.38 3 4.79c-.37.63-.58 1.37-.58 2.15 0 1.49.75 2.81 1.91 3.56-.71 0-1.37-.2-1.95-.5v.03c0 2.08 1.48 3.82 3.44 4.21a4.22 4.22 0 0 1-1.93.07 4.28 4.28 0 0 0 4 2.98 8.521 8.521 0 0 1-5.33 1.84c-.34 0-.68-.02-1.02-.06C3.44 20.29 5.7 21 8.12 21 16 21 20.33 14.46 20.33 8.79c0-.19 0-.37-.01-.56.84-.6 1.56-1.36 2.14-2.23z"/>
          </svg>
          <svg class="social-icon" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20.9 2H3.1C2.5 2 2 2.5 2 3.1v17.8c0 .6.5 1.1 1.1 1.1h9.6v-7.7h-2.6v-3h2.6V9.2c0-2.6 1.6-4 3.9-4 1.1 0 2.1.1 2.4.1v2.8h-1.6c-1.3 0-1.5.6-1.5 1.5v2h3.1l-.4 3h-2.7V22h5.1c.6 0 1.1-.5 1.1-1.1V3.1c0-.6-.5-1.1-1.1-1.1z"/>
          </svg>
          <svg class="social-icon" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
          </svg>
        </div>
        
        <div class="footer-info">
          TizzyGo Technologies Inc.<br>
          123 Innovation Drive, Tech Valley, CA 94025<br>
          United States of America
        </div>
        
        <div class="copyright">
          © ${new Date().getFullYear()} TizzyGo Technologies Inc. All rights reserved.<br>
          This email was sent to ${to} as part of our account verification process.
        </div>
      </div>
    </div>
  </body>
  </html>
  `;

  await transporter.sendMail({
    from: `"TizzyGo Security" <${process.env.EMAIL_USER}>`,
    to,
    subject: "Your TizzyGo Verification Code - Secure Your Account",
    html: emailHtml,
  });
};

export default sendEmail;