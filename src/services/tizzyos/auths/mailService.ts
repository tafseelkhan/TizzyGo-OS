import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  service: "Gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

export const sendOTPEmail = async (to: string, otp: string) => {
  const mailOptions = {
    from: `"TizzyOS" <${process.env.EMAIL_USER}>`,
    to,
    subject: "Your OTP Code",
    html: `<p>Your OTP code is <b>${otp}</b>. It expires in 10 minutes.</p>`,
  };

  await transporter.sendMail(mailOptions);
};
