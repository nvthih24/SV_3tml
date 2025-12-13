const admin = require("firebase-admin");
const serviceAccount = require(path.join(process.cwd(), "firebase-key.json"));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// Hàm gửi thông báo (Xuất khẩu ra để dùng chỗ khác)
const sendPushNotification = async (fcmToken, title, body, data = {}) => {
  try {
    if (!fcmToken) return;

    const message = {
      notification: {
        title: title,
        body: body,
      },
      data: data, // Dữ liệu đi kèm (ví dụ: productId: "123")
      token: fcmToken,
    };

    const response = await admin.messaging().send(message);
    console.log("🔥 Đã gửi thông báo thành công:", response);
  } catch (error) {
    console.error("❌ Lỗi gửi thông báo:", error);
  }
};

module.exports = { admin, sendPushNotification };
