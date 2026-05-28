import twilio from 'twilio';

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID!,
  process.env.TWILIO_AUTH_TOKEN!
);

const sendSMS = async (phone: string, otp: string) => {
  try {
    const message = await client.messages.create({
      body: `Your TizzyGo OTP is ${otp}`,
      from: process.env.TWILIO_PHONE_NUMBER!,
      to: phone.startsWith('+') ? phone : `+91${phone}` // Add country code if needed
    });

    console.log('✅ SMS sent:', message.sid);
  } catch (error) {
    console.error('❌ Error sending SMS:', error);
    throw error;
  }
};

export default sendSMS;
