import { emailTemplates } from '../templates/emailTemplates';
import { sendEmail } from '../../../../config/tizzygo/emailConfig'; // Adjust path based on your project structure

export const sendRiderEmail = async (
  email: string, 
  subject: string, 
  template: string
): Promise<void> => {
  try {
    await sendEmail(email, subject, template);
  } catch (error) {
    console.error('Failed to send email:', error);
    throw new Error('Email sending failed');
  }
};

export const riderEmailHelper = {
  sendApprovalEmail: async (email: string, fullName: string, riderId: string) => {
    const subject = "🎉 Your TizzyPanelX Rider Application Has Been Approved!";
    const template = emailTemplates.approveRider(fullName, riderId);
    return sendRiderEmail(email, subject, template);
  },

  sendPendingEmail: async (email: string, fullName: string, reason: string) => {
    const subject = "⏳ Your TizzyPanelX Application Requires Additional Information";
    const template = emailTemplates.pendingRider(fullName, reason);
    return sendRiderEmail(email, subject, template);
  },

  sendRejectionEmail: async (email: string, fullName: string, reason: string) => {
    const subject = "❌ Update on Your TizzyPanelX Rider Application";
    const template = emailTemplates.rejectRider(fullName, reason);
    return sendRiderEmail(email, subject, template);
  }
};