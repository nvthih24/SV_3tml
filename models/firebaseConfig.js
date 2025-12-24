// models/firebaseConfig.js
const admin = require("firebase-admin");
require("dotenv").config(); // Nạp biến môi trường

// Cách này giúp ông chạy ngon cả trên máy cá nhân lẫn Railway
const serviceAccount = {
  type: "service_account",
  project_id: process.env.FIREBASE_PROJECT_ID,
  private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
  // Xử lý lỗi xuống dòng \n khi deploy
  private_key: process.env.FIREBASE_PRIVATE_KEY
    ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n")
    : undefined,
  client_email: process.env.FIREBASE_CLIENT_EMAIL,
  client_id: process.env.FIREBASE_CLIENT_ID,
  auth_uri: "https://accounts.google.com/o/oauth2/auth",
  token_uri: "https://oauth2.googleapis.com/token",
  auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
  client_x509_cert_url: process.env.FIREBASE_CLIENT_CERT_URL,
};

// Kiểm tra xem đã nạp đủ biến chưa
if (!serviceAccount.private_key || !serviceAccount.project_id) {
  console.error(
    "❌ LỖI: Chưa cấu hình Firebase Admin SDK trong biến môi trường (.env)"
  );
} else {
  try {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    console.log("✅ Firebase Admin đã kết nối thành công!");
  } catch (error) {
    if (!/already exists/.test(error.message)) {
      console.error("Lỗi khởi tạo Firebase:", error.stack);
    }
  }
}

module.exports = admin;
