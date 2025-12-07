const mongoose = require('mongoose');

const qrCodeSchema = new mongoose.Schema({
  productId: {
    type: String,
    required: true,
    unique: true, // Đảm bảo mỗi productId chỉ có một mã QR
  },
  qrContent: {
    type: String,
    required: true, // Nội dung mã QR (ví dụ: URL hoặc productId)
  },
  qrImageUrl: {
    type: String,
    required: true, // Đường dẫn đến hình ảnh mã QR trên Cloudinary
  },
  createdAt: {
    type: Date,
    default: Date.now, // Ngày tạo mã QR
  },
  updatedAt: {
    type: Date,
    default: Date.now, // Ngày cập nhật mã QR
  },
  isActive: {
    type: Boolean,
    default: true, // Trạng thái mã QR (bật/tắt)
  },
createdBy: {
    type: String,
    required: false, // Không bắt buộc
    default: 'unknown', // Giá trị mặc định
  },
});

// Cập nhật updatedAt trước khi lưu
qrCodeSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('QRCode', qrCodeSchema);