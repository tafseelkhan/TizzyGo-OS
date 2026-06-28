// services/emailService.ts

import nodemailer from "nodemailer";

interface OTPEmailParams {
  to: string;
  name: string;
  otp: string;
  orderId: string;
  expiresInMinutes: number;
}

// Create transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: parseInt(process.env.SMTP_PORT || "587"),
  secure: process.env.SMTP_SECURE === "true",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

export const sendOTPEmail = async (params: OTPEmailParams): Promise<void> => {
  const { to, name, otp, orderId, expiresInMinutes } = params;

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body {
          font-family: Arial, sans-serif;
          line-height: 1.6;
          color: #333;
          max-width: 600px;
          margin: 0 auto;
          padding: 20px;
        }
        .header {
          background: #4F46E5;
          color: white;
          padding: 20px;
          text-align: center;
          border-radius: 8px 8px 0 0;
        }
        .content {
          background: #f8fafc;
          padding: 30px;
          border-radius: 0 0 8px 8px;
          border: 1px solid #e2e8f0;
        }
        .otp-box {
          background: white;
          padding: 20px;
          text-align: center;
          border-radius: 8px;
          margin: 20px 0;
          border: 2px dashed #4F46E5;
        }
        .otp-code {
          font-size: 36px;
          font-weight: bold;
          color: #4F46E5;
          letter-spacing: 8px;
        }
        .expiry {
          color: #64748b;
          font-size: 14px;
          text-align: center;
          margin-top: 10px;
        }
        .footer {
          margin-top: 20px;
          text-align: center;
          color: #94a3b8;
          font-size: 12px;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>🔐 Delivery OTP</h1>
      </div>
      <div class="content">
        <p>Dear <strong>${name}</strong>,</p>
        
        <p>Your order <strong>#${orderId}</strong> is out for delivery!</p>
        
        <p>Please provide the following OTP to the delivery person to complete the delivery:</p>
        
        <div class="otp-box">
          <div class="otp-code">${otp}</div>
        </div>
        
        <p class="expiry">⏱️ This OTP will expire in <strong>${expiresInMinutes} minutes</strong></p>
        
        <p><strong>Important:</strong></p>
        <ul>
          <li>Do not share this OTP with anyone</li>
          <li>Only share it with the delivery person at the time of delivery</li>
          <li>This OTP is valid for one-time use only</li>
        </ul>
        
        <p>If you didn't request this OTP or have any questions, please contact our support team.</p>
        
        <p>Thank you for choosing our service!</p>
        
        <div class="footer">
          <p>This is an automated message, please do not reply.</p>
          <p>&copy; ${new Date().getFullYear()} Your Company. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  const textContent = `
    🔐 Delivery OTP
    
    Dear ${name},
    
    Your order #${orderId} is out for delivery!
    
    Please provide the following OTP to the delivery person:
    
    ${otp}
    
    ⏱️ This OTP will expire in ${expiresInMinutes} minutes
    
    Important:
    - Do not share this OTP with anyone
    - Only share it with the delivery person at the time of delivery
    - This OTP is valid for one-time use only
    
    If you didn't request this OTP, please ignore this email.
    
    Thank you for choosing our service!
  `;

  const mailOptions = {
    from: process.env.SMTP_FROM || "noreply@yourcompany.com",
    to,
    subject: `🔐 Delivery OTP for Order #${orderId}`,
    text: textContent,
    html: htmlContent,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`✅ OTP email sent successfully to ${to}`);
  } catch (error) {
    console.error("❌ Error sending OTP email:", error);
    throw error;
  }
};
