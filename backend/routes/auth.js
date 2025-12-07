const express = require("express");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const jwtAuth = require("../middleware/auth");
const Notification = require("../models/Notification");

const router = express.Router();

// ==========================================
// ĐĂNG KÝ (REGISTER)
// ==========================================
router.post("/register", async (req, res) => {
  const { fullName, phone, email, address, password, confirmPassword, role } =
    req.body;

  if (password !== confirmPassword)
    return res.status(400).json({ msg: "Passwords do not match" });

  if (role === "admin")
    return res.status(403).json({ msg: "Cannot register as admin" });

  try {
    let user = await User.findOne({ email });
    if (user) return res.status(400).json({ msg: "User already exists" });

    user = new User({
      fullName,
      phone,
      email,
      address,
      password,
      role,
    });

    await user.save();

    const payload = {
      userId: user._id,
      role: user.role,
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    res.json({
      token,
      user: {
        id: user._id,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Server error" });
  }
});

// ====================
// ĐĂNG NHẬP (LOGIN)
// ====================
router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ msg: "Invalid credentials" });

    const isMatch = await user.comparePassword(password);
    if (!isMatch) return res.status(400).json({ msg: "Invalid credentials" });

    const payload = {
      userId: user._id,
      role: user.role,
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    res.json({
      token,
      fullName: user.fullName, // Trả về tên thật
      user: {
        id: user._id,
        email: user.email,
        role: user.role,
        companyName: user.companyName || "", // Trả về tên công ty (cho Transporter)
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Server error" });
  }
});

// ====================================
// LẤY THÔNG TIN USER (CURRENT USER)
// ====================================
router.get("/me", jwtAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select("-password");
    res.json({ user });
  } catch (err) {
    res.status(500).json({ msg: "Server error" });
  }
});

// ==========================================
// LẤY DANH SÁCH NÔNG DÂN (Cho Trang Chủ Consumer)
// ==========================================
router.get("/farmers", async (req, res) => {
  try {
    // Lấy tất cả user có role là 'farmer', bỏ qua password
    const farmers = await User.find({ role: "farmer" }).select("-password");
    res.json({ success: true, data: farmers });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Lỗi lấy danh sách nông dân" });
  }
});

// ==========================================
// CẬP NHẬT VÍ BLOCKCHAIN (Cho Profile)
// ==========================================
router.post("/update-wallet", jwtAuth, async (req, res) => {
  try {
    const { walletAddress } = req.body;
    // Kiểm tra format ví ETH cơ bản
    if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
      return res.status(400).json({ error: "Địa chỉ ví không hợp lệ" });
    }

    const user = await User.findByIdAndUpdate(
      req.user.userId,
      { walletAddress: walletAddress.toLowerCase() },
      { new: true }
    );

    res.json({ success: true, walletAddress: user.walletAddress });
  } catch (e) {
    // Lỗi trùng ví (do unique: true)
    if (e.code === 11000)
      return res
        .status(400)
        .json({ error: "Ví này đã được liên kết với tài khoản khác" });
    res.status(500).json({ error: e.message });
  }
});

// ==========================================
// CẬP NHẬT THÔNG TIN CÁ NHÂN (Cho Transporter nhập Công Ty)
// ==========================================
router.post("/update-profile", jwtAuth, async (req, res) => {
  try {
    const { fullName, companyName, avatar } = req.body;

    const updateData = {};
    if (fullName) updateData.fullName = fullName;
    if (companyName) updateData.companyName = companyName;

    if (avatar) updateData.avatar = avatar;
    const user = await User.findByIdAndUpdate(req.user.userId, updateData, {
      new: true,
    });

    res.json({
      success: true,
      user: {
        id: user._id,
        fullName: user.fullName,
        companyName: user.companyName,
        role: user.role,
        avatar: user.avatar,
      },
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

//=========================================
// Notifications
//=========================================
// API: Lấy danh sách thông báo của User
router.get("/notifications", jwtAuth, async (req, res) => {
  try {
    const notifications = await Notification.find({
      userId: req.user.userId,
    }).sort({ createdAt: -1 }); // Mới nhất lên đầu
    res.json({ success: true, data: notifications });
  } catch (error) {
    res.status(500).json({ error: "Lỗi lấy thông báo" });
  }
});

module.exports = router;
