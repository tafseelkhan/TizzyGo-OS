const NotificationModel = require('../models/Notification');

interface SendNotificationParams {
  userId: string;
  role: string;
  title: string;
  message: string;
  type: string;
}

const sendNotification = async (
  io: any,
  { userId, role, title, message, type }: SendNotificationParams
) => {
  const notification = await NotificationModel.create({
    userId, role, title, message, type
  });

  // Emit to the user's room
  io.to(userId.toString()).emit('notification', notification);
};

module.exports = sendNotification;
