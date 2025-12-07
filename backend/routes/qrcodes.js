const express = require("express");
const router = express.Router();
const QRCode = require("qrcode");
const mongoose = require("mongoose");
const { v2: cloudinary } = require("cloudinary");
const authMiddleware = require("../middleware/auth"); // Middleware kiểm tra JWT token
const QRCodeModel = require("../models/qrcodes");

// Cấu hình Cloudinary (nếu dùng)
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Endpoint: Tạo mã QR
router.post("/", authMiddleware, async (req, res) => {
  const { productId, qrContent } = req.body;
const createdBy = req.user.walletAddress || req.user.userId; // fallback nếu chưa có ví

  try {
    // Tạo hình ảnh mã QR
    const qrImageUrl = await QRCode.toDataURL(qrContent); // Tạo mã QR dưới dạng base64

    // Upload lên Cloudinary (nếu dùng)
    const uploadResult = await cloudinary.uploader.upload(qrImageUrl, {
      folder: "qrcodes",
    });

    // Lưu vào database
    const qrCode = new QRCodeModel({
      productId,
      qrContent,
      qrImageUrl: uploadResult.secure_url,
      createdBy,
    });

    await qrCode.save();
    res.status(201).json({ message: "Tạo mã QR thành công", qrCode });
  } catch (error) {
    console.error("Lỗi khi tạo mã QR:", error);
    res.status(500).json({ message: "Lỗi server" });
  }
});

// Endpoint: Lấy tất cả mã QR
router.get("/", authMiddleware, async (req, res) => {
  try {
    const qrCodes = await QRCodeModel.find();
    res.status(200).json(qrCodes);
  } catch (error) {
    console.error("Lỗi khi lấy danh sách mã QR:", error);
    res.status(500).json({ message: "Lỗi server" });
  }
});

// Endpoint: Lấy mã QR theo productId
router.get("/product/:productId", authMiddleware, async (req, res) => {
  try {
    const qrCode = await QRCodeModel.findOne({
      productId: req.params.productId,
    });
    if (!qrCode) {
      return res.status(404).json({ message: "Không tìm thấy mã QR" });
    }
    res.status(200).json(qrCode);
  } catch (error) {
    console.error("Lỗi khi lấy mã QR:", error);
    res.status(500).json({ message: "Lỗi server" });
  }
});

// Endpoint: Xóa mã QR
router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const qrCode = await QRCodeModel.findByIdAndDelete(req.params.id);
    if (!qrCode) {
      return res.status(404).json({ message: "Không tìm thấy mã QR" });
    }
    res.status(200).json({ message: "Xóa mã QR thành công" });
  } catch (error) {
    console.error("Lỗi khi xóa mã QR:", error);
    res.status(500).json({ message: "Lỗi server" });
  }
});

module.exports = router;
