const express = require("express");
const router = express.Router();
const { contract } = require("../blockchain/utils/signer");
const jwtAuth = require("../middleware/auth");
const User = require("../models/User");
const Product = require("../models/Product");
const Notification = require("../models/Notification");
const { sendPushNotification } = require("../models/firebaseConfig");

// ==========================================
// CÁC HÀM HỖ TRỢ (HELPER FUNCTIONS) - Đưa lên đầu để tránh lỗi
// ==========================================
const notifyAllModerators = async (title, message) => {
  try {
    const moderators = await User.find({ role: "moderator" });
    for (const mod of moderators) {
      await Notification.create({
        userId: mod._id,
        title: title,
        message: message,
        type: "info",
      });
    }
  } catch (e) {
    console.error("Lỗi notifyAllModerators", e);
  }
};

const notifyRole = async (roleName, title, body) => {
  try {
    const users = await User.find({ role: roleName });
    users.forEach((user) => {
      if (user.fcmToken) sendPushNotification(user.fcmToken, title, body);
    });
  } catch (e) {
    console.error("Lỗi notifyRole", e);
  }
};

const notifyUser = async (userId, title, body) => {
  try {
    const user = await User.findById(userId);
    if (user && user.fcmToken) sendPushNotification(user.fcmToken, title, body);
  } catch (e) {
    console.error("Lỗi notifyUser", e);
  }
};

// ==========================================
// API XỬ LÝ GIAO DỊCH
// ==========================================
router.post("/", jwtAuth, async (req, res) => {
  try {
    const { action, ...data } = req.body;
    const currentUser = await User.findById(req.user.userId);
    if (!currentUser) return res.status(404).json({ error: "User not found" });

    let tx;
    console.log(`--> [Blockchain] Action: ${action}`);

    // 1. TẠO GIAO DỊCH BLOCKCHAIN
    switch (action) {
      case "addProduct":
        tx = await contract.addProduct(
          data.productName,
          data.productId,
          data.farmName || currentUser.fullName,
          data.plantingDate,
          data.plantingImageUrl || "",
          0,
          "",
          data.seedOrigin || "",
          "",
          currentUser.phone || "",
          currentUser.fullName || "",
          0,
          ""
        );
        break;
      case "logCare":
        tx = await contract.logCare(
          data.productId,
          data.careType,
          data.description,
          data.careDate,
          data.careImageUrl || "",
          currentUser.phone || "",
          currentUser.fullName || ""
        );
        break;
      case "harvestProduct":
        tx = await contract.updateProduct(
          data.productId,
          data.productName || "",
          data.farmName || "",
          data.harvestDate,
          data.harvestImageUrl || "",
          data.quantity || 0,
          data.quality || "Loại 1"
        );
        break;
      case "approvePlanting":
        tx = await contract.approvePlanting(data.productId);
        break;
      case "rejectPlanting":
        tx = await contract.rejectPlanting(data.productId);
        break;
      case "approveHarvest":
        tx = await contract.approveHarvest(data.productId);
        break;
      case "rejectHarvest":
        tx = await contract.rejectHarvest(data.productId);
        break;
      case "updateReceive":
        tx = await contract.updateReceive(
          data.productId,
          data.transporterName,
          data.receiveDate,
          data.receiveImageUrl || "",
          data.transportInfo || ""
        );
        break;
      case "updateDelivery":
        tx = await contract.updateDelivery(
          data.productId,
          data.transporterName,
          data.deliveryDate,
          data.deliveryImageUrl || "",
          data.transportInfo || ""
        );
        break;
      case "updateManagerInfo":
        tx = await contract.updateManagerInfo(
          data.productId,
          data.managerReceiveDate,
          data.managerReceiveImageUrl || "",
          data.price
        );
        break;
      case "deactivateProduct":
        tx = await contract.deactivateProduct(data.productId);
        break;
      default:
        return res.status(400).json({ error: "Invalid action" });
    }

    console.log("🚀 Đã gửi Blockchain, Hash:", tx.hash);

    // 🔥 2. TRẢ VỀ NGAY CHO APP (Optimistic Response)
    // App sẽ nhận được phản hồi ngay lập tức, không cần đợi DB/Blockchain
    res.json({
      success: true,
      txHash: tx.hash,
      message: "Giao dịch đang được xử lý ngầm!",
    });

    // 🔥 3. XỬ LÝ NGẦM (Lưu DB & Thông báo) - Chạy sau khi đã trả lời App
    (async () => {
      try {
        // Đợi Blockchain xác nhận (chỉ log, không ảnh hưởng App)
        tx.wait().then((r) => console.log("✅ Block đào xong:", r.hash));

        // --- XỬ LÝ DATABASE ---
        if (action === "addProduct") {
          await Product.create({
            productId: data.productId,
            productName: data.productName,
            farmName: data.farmName || currentUser.fullName + "'s Farm",
            farmOwner: currentUser.fullName,
            farmPhone: currentUser.phone,
            plantingDate: data.plantingDate,
            plantingImageUrl: data.plantingImageUrl,
            seedSource: data.seedOrigin || data.seedSource,
            statusCode: 0,
            plantingStatus: 0,
            harvestStatus: 0,
          });
          // Thông báo
          await notifyAllModerators(
            "🌱 Yêu cầu Gieo trồng mới",
            `Nông dân ${currentUser.fullName} vừa thêm lô hàng ${data.productName}.`
          );
          await notifyRole(
            "moderator",
            "🌱 Yêu cầu Gieo trồng mới",
            `Vào duyệt ngay!`
          );
        } else if (action === "approvePlanting") {
          const p = await Product.findOneAndUpdate(
            { productId: data.productId },
            { plantingStatus: 1, statusCode: 1 },
            { new: true }
          );
          const farmer = await User.findOne({ phone: p.farmPhone });
          if (farmer)
            await notifyUser(
              farmer._id,
              "✅ Đã duyệt gieo trồng",
              `Lô hàng ${p.productName} đã được duyệt.`
            );
        } else if (action === "rejectPlanting") {
          const p = await Product.findOneAndUpdate(
            { productId: data.productId },
            { plantingStatus: 2 },
            { new: true }
          );
          const farmer = await User.findOne({ phone: p.farmPhone });
          if (farmer)
            await notifyUser(
              farmer._id,
              "❌ Từ chối gieo trồng",
              `Vui lòng kiểm tra lại lô hàng ${p.productName}.`
            );
        } else if (action === "harvestProduct") {
          await Product.findOneAndUpdate(
            { productId: data.productId },
            {
              harvestDate: data.harvestDate,
              statusCode: 2,
              harvestStatus: 0,
              quantity: data.quantity || 0,
              unit: data.unit || "Kg",
              quality: data.quality || "Loại 1",
            }
          );
          await notifyAllModerators(
            "✂️ Yêu cầu Thu hoạch",
            `Nông dân ${currentUser.fullName} thu hoạch ${data.productName}.`
          );
          await notifyRole(
            "moderator",
            "✂️ Thu hoạch mới",
            `Cần kiểm định chất lượng!`
          );
        } else if (action === "approveHarvest") {
          const p = await Product.findOneAndUpdate(
            { productId: data.productId },
            { harvestStatus: 1 },
            { new: true }
          );
          const farmer = await User.findOne({ phone: p.farmPhone });
          if (farmer)
            await notifyUser(
              farmer._id,
              "✅ Thu hoạch đạt chuẩn",
              `Sản phẩm ${p.productName} đã sẵn sàng xuất kho.`
            );
          await notifyRole(
            "transporter",
            "🚛 Có đơn hàng mới",
            `Lô hàng ${p.productName} cần vận chuyển.`
          );
        } else if (action === "rejectHarvest") {
          const p = await Product.findOneAndUpdate(
            { productId: data.productId },
            { harvestStatus: 2 },
            { new: true }
          );
          const farmer = await User.findOne({ phone: p.farmPhone });
          if (farmer)
            await notifyUser(
              farmer._id,
              "❌ Thu hoạch không đạt",
              `Chất lượng không đạt yêu cầu.`
            );
        } else if (action === "updateReceive") {
          await Product.findOneAndUpdate(
            { productId: data.productId },
            {
              transporterName: data.transporterName,
              isReceived: true,
              statusCode: 2,
            }
          );
          await notifyRole(
            "manager",
            "🚚 Hàng đang tới",
            `Lô hàng ${data.productId} đang được vận chuyển.`
          );
        } else if (action === "updateDelivery") {
          await Product.findOneAndUpdate(
            { productId: data.productId },
            { isDelivered: true }
          );
          await notifyRole(
            "manager",
            "📦 Hàng đã đến nơi",
            `Lô hàng ${data.productId} đã giao xong.`
          );
        } else if (action === "updateManagerInfo") {
          await Product.findOneAndUpdate(
            { productId: data.productId },
            { price: data.price, statusCode: 3 }
          );
          await notifyRole(
            "admin",
            "💰 Sản phẩm lên kệ",
            `Sản phẩm ${data.productId} đang bán với giá ${data.price}.`
          );
        }

        console.log("✅ [Background] Đã đồng bộ DB xong!");
      } catch (err) {
        console.error("❌ [Background Error]:", err);
      }
    })();
  } catch (error) {
    console.error("Tx Error:", error);
    res
      .status(500)
      .json({ error: "Giao dịch thất bại", details: error.message });
  }
});

module.exports = router;
