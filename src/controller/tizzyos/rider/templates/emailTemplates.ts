export const emailTemplates = {
  approveRider: (riderName: string, riderId: string) => `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          margin: 0;
          padding: 0;
          background-color: #f9f9f9;
        }
        .container {
          max-width: 600px;
          margin: 0 auto;
          background: #ffffff;
          border-radius: 12px;
          overflow: hidden;
          box-shadow: 0 4px 20px rgba(0,0,0,0.1);
        }
        .header {
          background: #d32f2f;
          padding: 30px 20px;
          text-align: center;
        }
        .content {
          padding: 40px 30px;
          color: #333333;
          line-height: 1.6;
        }
        .rider-id {
          background: #f5f5f5;
          padding: 20px;
          border-radius: 8px;
          text-align: center;
          margin: 25px 0;
          border-left: 4px solid #4caf50;
        }
        .rider-id-code {
          font-size: 24px;
          font-weight: bold;
          color: #d32f2f;
          letter-spacing: 2px;
        }
        .button {
          display: inline-block;
          background: #d32f2f;
          color: white !important;
          padding: 14px 30px;
          text-decoration: none;
          border-radius: 6px;
          margin: 20px 0;
          font-weight: bold;
          text-align: center;
        }
        .footer {
          background: #f5f5f5;
          padding: 25px;
          text-align: center;
          color: #666666;
          font-size: 14px;
        }
        .highlight {
          color: #d32f2f;
          font-weight: bold;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1 style="color: white; margin: 0; font-size: 28px;">Application Approved!</h1>
        </div>
        
        <div class="content">
          <h2>Congratulations, ${riderName}! 🎊</h2>
          <p>We're thrilled to inform you that your rider application has been <span class="highlight">successfully approved</span> by our review team.</p>
          
          <div class="rider-id">
            <p style="margin: 0 0 10px 0; font-weight: bold;">Your UniqueOS-Rider ID:</p>
            <div class="rider-id-code">${riderId}</div>
          </div>
          
          <p>This ID is your unique identifier within the TizzyPanelX system. Please keep it safe and reference it in all future communications.</p>
          
          <h3>What's Next?</h3>
          <ul>
            <li>You will receive a welcome package with detailed instructions</li>
            <li>Complete your onboarding process</li>
            <li>Download the TizzyPanelX Rider App</li>
            <li>Start accepting delivery requests</li>
          </ul>
          
          <div style="text-align: center;">
            <a href="#" class="button">Get Started Now</a>
          </div>
          
          <p>Welcome to the TizzyPanelX family! We're excited to have you on board and look forward to a successful partnership.</p>
          
          <p>Best regards,<br>
          <strong>The TizzyPanelX Team</strong></p>
        </div>
        
        <div class="footer">
          <p>© 2024 TizzyPanelX. All rights reserved.</p>
          <p>If you have any questions, contact us at support@tizzypanelx.com</p>
          <p>You're receiving this email because you applied to become a rider with TizzyPanelX.</p>
        </div>
      </div>
    </body>
    </html>
  `,

  pendingRider: (riderName: string, reason: string) => `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          margin: 0;
          padding: 0;
          background-color: #f9f9f9;
        }
        .container {
          max-width: 600px;
          margin: 0 auto;
          background: #ffffff;
          border-radius: 12px;
          overflow: hidden;
          box-shadow: 0 4px 20px rgba(0,0,0,0.1);
        }
        .header {
          background: #d32f2f;
          padding: 30px 20px;
          text-align: center;
        }
        .content {
          padding: 40px 30px;
          color: #333333;
          line-height: 1.6;
        }
        .pending-notice {
          background: #fff3e0;
          padding: 25px;
          border-radius: 8px;
          border-left: 4px solid #ff9800;
          margin: 25px 0;
        }
        .reason-box {
          background: #f5f5f5;
          padding: 20px;
          border-radius: 8px;
          margin: 20px 0;
          border: 1px solid #e0e0e0;
        }
        .button {
          display: inline-block;
          background: #d32f2f;
          color: white !important;
          padding: 14px 30px;
          text-decoration: none;
          border-radius: 6px;
          margin: 20px 0;
          font-weight: bold;
          text-align: center;
        }
        .footer {
          background: #f5f5f5;
          padding: 25px;
          text-align: center;
          color: #666666;
          font-size: 14px;
        }
        .highlight {
          color: #d32f2f;
          font-weight: bold;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1 style="color: white; margin: 0; font-size: 28px;">Application Status: Pending</h1>
        </div>
        
        <div class="content">
          <h2>Hello ${riderName},</h2>
          
          <div class="pending-notice">
            <h3 style="color: #ff9800; margin-top: 0;">⏳ Additional Information Required</h3>
            <p>Your rider application is currently <span class="highlight">under review</span> and requires some additional information before we can proceed with approval.</p>
          </div>
          
          <h3>Reason for Pending Status:</h3>
          <div class="reason-box">
            <p style="margin: 0; font-style: italic;">"${reason}"</p>
          </div>
          
          <h3>What You Need to Do:</h3>
          <ol>
            <li>Review the reason mentioned above</li>
            <li>Provide the requested information or documents</li>
            <li>Resubmit your application for review</li>
            <li>Our team will re-evaluate within 2-3 business days</li>
          </ol>
          
          <p>This is a normal part of our verification process to ensure the safety and quality of our rider network.</p>
          
          <div style="text-align: center;">
            <a href="#" class="button">Provide Additional Information</a>
          </div>
          
          <p>If you have any questions about what's needed, please don't hesitate to contact our support team.</p>
          
          <p>We appreciate your patience and look forward to completing your application.</p>
          
          <p>Best regards,<br>
          <strong>The TizzyPanelX Review Team</strong></p>
        </div>
        
        <div class="footer">
          <p>© 2024 TizzyPanelX. All rights reserved.</p>
          <p>Need help? Contact us at support@tizzypanelx.com or call (555) 123-HELP</p>
          <p>This is an automated message. Please do not reply to this email.</p>
        </div>
      </div>
    </body>
    </html>
  `,

  rejectRider: (riderName: string, reason: string) => `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          margin: 0;
          padding: 0;
          background-color: #f9f9f9;
        }
        .container {
          max-width: 600px;
          margin: 0 auto;
          background: #ffffff;
          border-radius: 12px;
          overflow: hidden;
          box-shadow: 0 4px 20px rgba(0,0,0,0.1);
        }
        .header {
          background: #d32f2f;
          padding: 30px 20px;
          text-align: center;
        }
        .content {
          padding: 40px 30px;
          color: #333333;
          line-height: 1.6;
        }
        .rejection-notice {
          background: #ffebee;
          padding: 25px;
          border-radius: 8px;
          border-left: 4px solid #f44336;
          margin: 25px 0;
        }
        .reason-box {
          background: #f5f5f5;
          padding: 20px;
          border-radius: 8px;
          margin: 20px 0;
          border: 1px solid #e0e0e0;
        }
        .next-steps {
          background: #e8f5e9;
          padding: 25px;
          border-radius: 8px;
          border-left: 4px solid #4caf50;
          margin: 25px 0;
        }
        .button {
          display: inline-block;
          background: #d32f2f;
          color: white !important;
          padding: 14px 30px;
          text-decoration: none;
          border-radius: 6px;
          margin: 20px 0;
          font-weight: bold;
          text-align: center;
        }
        .footer {
          background: #f5f5f5;
          padding: 25px;
          text-align: center;
          color: #666666;
          font-size: 14px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1 style="color: white; margin: 0; font-size: 28px;">Application Decision</h1>
        </div>
        
        <div class="content">
          <h2>Dear ${riderName},</h2>
          
          <div class="rejection-notice">
            <h3 style="color: #f44336; margin-top: 0;">❌ Application Not Approved</h3>
            <p>After careful review, we regret to inform you that your application to become a TizzyPanelX rider <strong>has not been approved</strong> at this time.</p>
          </div>
          
          <h3>Reason for Decision:</h3>
          <div class="reason-box">
            <p style="margin: 0; font-style: italic;">"${reason}"</p>
          </div>
          
          <div class="next-steps">
            <h3 style="color: #4caf50; margin-top: 0;">Possible Next Steps:</h3>
            <ul>
              <li>You may reapply after 90 days if your circumstances change</li>
              <li>Consider other opportunities with TizzyPanelX</li>
              <li>Explore similar platforms that may have different requirements</li>
            </ul>
          </div>
          
          <p>We understand this news may be disappointing and appreciate the time and effort you put into your application.</p>
          
          <p>Thank you for your interest in joining the TizzyPanelX community. We wish you the best in your future endeavors.</p>
          
          <p>Sincerely,<br>
          <strong>TizzyPanelX Rider Recruitment Team</strong></p>
        </div>
        
        <div class="footer">
          <p>© 2024 TizzyPanelX. All rights reserved.</p>
          <p>This decision is final and not subject to appeal. Please do not reply to this automated message.</p>
          <p>For other inquiries, please visit our website at www.tizzypanelx.com</p>
        </div>
      </div>
    </body>
    </html>
  `
};