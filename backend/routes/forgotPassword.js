const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const { Resend } = require("resend");

const resend = new Resend(process.env.RESEND_API_KEY);

let otpStore = {}; // Tạm lưu mã OTP

// Gửi OTP qua email
router.post("/send-otp", async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne({ email });
  if (!user) return res.status(404).json({ message: "Email không tồn tại!" });

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  otpStore[email] = otp;

  const logoUrl = "https://res.cloudinary.com/dsa2vb0wo/image/upload/v1765083932/3TMLDACN_ub2o05.png";
  const groupName = "3TML Team";

  try {
    await resend.emails.send({
      from: process.env.FROM_EMAIL,
      to: email,
      subject: "Mã xác nhận đặt lại mật khẩu",
      html: `
<div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <div style="text-align: center; padding-bottom: 20px;">
                <img src="${logoUrl}" alt="${groupName} Logo" style="max-width: 150px; height: auto; margin-bottom: 10px;">
                <h1 style="color: #007bff; margin: 0;">${groupName}</h1>
            </div>

            <p>Xin chào,</p>
            <p>Bạn đã yêu cầu đặt lại mật khẩu cho tài khoản của mình. Vui lòng sử dụng mã xác nhận bên dưới:</p>
            
            <div style="text-align: center; margin: 30px 0;">
                <p style="font-size: 18px; margin: 0; color: #555;">Mã OTP của bạn là:</p>
                <p>
                    <strong 
                        style="
                            display: inline-block;
                            padding: 10px 20px;
                            font-size: 28px;
                            color: #ffffff; 
                            background-color: #007bff; /* Nền xanh nổi bật */
                            border-radius: 5px;
                            letter-spacing: 3px;
                            box-shadow: 0 4px 8px rgba(0,0,0,0.1);
                        "
                    >${otp}</strong>
                </p>
            </div>

            <p style="font-style: italic; color: #dc3545;">Mã này chỉ có hiệu lực trong thời gian ngắn. Vui lòng không chia sẻ mã này với bất kỳ ai.</p>
            <p>Nếu bạn không yêu cầu đặt lại mật khẩu, vui lòng bỏ qua email này.</p>

            <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
            
            <p style="font-size: 12px; color: #999;">Đây là email tự động, vui lòng không trả lời.</p>

            <p>Trân trọng,<br><strong>Đội ngũ hỗ trợ ${groupName}</strong></p>
        </div>
        `,
    });
    res.json({ message: "Mã xác nhận đã được gửi!" });
  } catch (err) {
    res.status(500).json({ message: "Gửi email thất bại!", error: err.message });
    console.error("Lỗi gửi email:", err);

  }
});

// Xác minh OTP
router.post("/verify-otp", (req, res) => {
  const { email, otp } = req.body;
  if (otpStore[email] === otp) {
    return res.json({ verified: true });
  }
  return res.status(400).json({ message: "Mã xác nhận không đúng!" });
});

// Đặt lại mật khẩu
router.post("/reset-password", async (req, res) => {
  const { email, newPassword } = req.body;

  const hashedPassword = await bcrypt.hash(newPassword, 10);
  await User.updateOne({ email }, { password: hashedPassword });

  delete otpStore[email];
  res.json({ message: "Đặt lại mật khẩu thành công!" });
});

module.exports = router;
