import nodemailer from 'nodemailer';
import { generateSuccessEmailHTML } from './templates/successEmail';
import { generateRejectionEmailHTML } from './templates/rejectionEmail';

export const sendSuccessEmail = async (to: string, name: string, uniqOsId: string) => {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER!,
      pass: process.env.EMAIL_PASS!,
    },
  });

  const htmlContent = generateSuccessEmailHTML(name, uniqOsId);

  await transporter.sendMail({
    from: `"SellerApp" <${process.env.EMAIL_USER}>`,
    to,
    subject: `Welcome to SellerApp - Your UniqOS ID`,
    html: htmlContent,
  });
};

export const sendRejectionEmail = async (to: string, name: string) => {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER!,
      pass: process.env.EMAIL_PASS!,
    },
  });

  const htmlContent = generateRejectionEmailHTML(name);

  await transporter.sendMail({
    from: `"SellerApp" <${process.env.EMAIL_USER}>`,
    to,
    subject: `Seller Application Rejected`,
    html: htmlContent,
  });
};
