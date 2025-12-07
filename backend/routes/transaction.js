// backend/routes/transaction.routes.js
const express = require("express");
const router = express.Router();
const { contract } = require("../blockchain/utils/signer");
const jwtAuth = require("../middleware/auth");
const User = require("../models/User");
const Product = require("../models/Product");
const Notification = require("../models/Notification");

router.post("/", jwtAuth, async (req, res) => {
  try {
    const { action, ...data } = req.body;

    // LẤY THÔNG TIN USER
    const currentUser = await User.findById(req.user.userId);
    if (!currentUser) {
      return res.status(404).json({ error: "Không tìm thấy người dùng" });
    }

    let tx;

    // ======================================================
    // BƯỚC 1: GỬI LỆNH LÊN BLOCKCHAIN (Chưa ghi DB vội)
    // ======================================================
    console.log(`--> Đang thực hiện Blockchain Action: ${action}`);

    switch (action) {
      case "addProduct":
        tx = await contract.addProduct(
          data.productName,
          data.productId,
          data.farmName || currentUser.fullName + "'s Farm",
          data.plantingDate,
          data.plantingImageUrl || "",
          0,
          "",
          data.seedOrigin || data.seedSource || "",
          "",
          currentUser.phone || "0900000000",
          currentUser.fullName || "Nông dân",
          0,
          ""
        );
        break;

      case "logCare":
        // (Optional) Check quyền sở hữu tại đây nếu cần
        tx = await contract.logCare(
          data.productId,
          data.careType,
          data.description,
          data.careDate,
          data.careImageUrl || "",
          currentUser.phone || "0900000000",
          currentUser.fullName || "Nông dân"
        );
        break;

      // --- NÔNG DÂN THU HOẠCH ---
      case "harvestProduct": // HOẶC "updateProduct" (tùy tên ông thống nhất)
        tx = await contract.updateProduct(
          data.productId,
          data.productName || "Sản phẩm",
          data.farmName || "",
          data.harvestDate,
          data.harvestImageUrl || "",
          data.quantity || 0,
          data.quality || "Loại 1"
        );
        break;

      // --- INSPECTOR DUYỆT ---
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

      // --- TRANSPORTER ---
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

      // --- RETAILER ---
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
        return res.status(400).json({ error: "Action không hợp lệ" });
    }

    // ======================================================
    // BƯỚC 2: CHỜ BLOCKCHAIN XÁC NHẬN (QUAN TRỌNG)
    // ======================================================
    console.log("--> Đang chờ Blockchain xác nhận...");
    const receipt = await tx.wait();
    console.log("✅ Blockchain xác nhận thành công! Tx:", receipt.hash);

    // ======================================================
    // BƯỚC 3: ĐỒNG BỘ DỮ LIỆU VÀO MONGODB (Database Sync)
    // ======================================================
    // Chỉ khi code chạy xuống đến đây (không bị lỗi ở trên) thì mới lưu DB
    const notifyAllModerators = async (title, message) => {
      const moderators = await User.find({ role: "moderator" });
      for (const mod of moderators) {
        await Notification.create({
          userId: mod._id,
          title: title,
          message: message,
          type: "info", // Màu xanh dương
        });
      }
    };

    // --- TẠO SẢN PHẨM MỚI ---
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
      await Notification.create({
        userId: req.user.userId,
        title: "Gieo trồng thành công",
        message: `Bạn đã tạo lô hàng ${data.productName} thành công. Vui lòng chờ duyệt.`,
        type: "success",
      });
      await notifyAllModerators(
        "🌱 Yêu cầu Gieo trồng mới",
        `Nông dân ${currentUser.fullName} vừa thêm lô hàng ${data.productName}.`
      );
    }

    // --- CẬP NHẬT TRẠNG THÁI ---
    else if (action === "approvePlanting") {
      const updatedProduct = await Product.findOneAndUpdate(
        { productId: data.productId },
        { plantingStatus: 1, statusCode: 1 },
        { new: true }
      );

      // -> Tìm ông Nông dân chủ lô hàng để báo tin vui
      const farmer = await User.findOne({ phone: updatedProduct.farmPhone });
      if (farmer) {
        await Notification.create({
          userId: farmer._id,
          title: "Được phê duyệt gieo trồng",
          message: `Lô hàng ${updatedProduct.productName} của bạn đã được duyệt. Hãy bắt đầu canh tác!`,
          type: "success",
        });
      }
    } else if (action === "rejectPlanting") {
      const updatedProduct = await Product.findOneAndUpdate(
        { productId: data.productId },
        { plantingStatus: 2 },
        { new: true }
      );
      // -> Báo tin buồn cho Nông dân
      const farmer = await User.findOne({ phone: updatedProduct.farmPhone });
      if (farmer) {
        await Notification.create({
          userId: farmer._id,
          title: "Yêu cầu bị từ chối ❌",
          message: `Yêu cầu gieo trồng ${updatedProduct.productName} không đạt yêu cầu.`,
          type: "error",
        });
      }
    }

    // --- THU HOẠCH ---
    else if (action === "harvestProduct") {
      await Product.findOneAndUpdate(
        { productId: data.productId },
        {
          harvestDate: data.harvestDate,
          statusCode: 2, // Đã thu hoạch (chờ duyệt)
          harvestStatus: 0,
        }
      );
      // Báo cho chính Nông dân
      await Notification.create({
        userId: req.user.userId,
        title: "Đã gửi thu hoạch",
        message: `Đang chờ kiểm duyệt thu hoạch cho ${
          data.productName || "lô hàng"
        }.`,
        type: "info",
      });
      // Báo cho tất cả Moderator
      await notifyAllModerators(
        "✂️ Yêu cầu Thu hoạch",
        `Nông dân ${currentUser.fullName} muốn thu hoạch lô hàng ${data.productName}.`
      );
    } else if (action === "approveHarvest") {
      const updatedProduct = await Product.findOneAndUpdate(
        { productId: data.productId },
        { harvestStatus: 1 },
        { new: true }
      );
      // Báo cho Nông dân
      const farmer = await User.findOne({ phone: updatedProduct.farmPhone });
      if (farmer) {
        await Notification.create({
          userId: farmer._id,
          title: "Thu hoạch được duyệt ✅",
          message: `Lô hàng ${updatedProduct.productName} đã sẵn sàng xuất kho.`,
          type: "success",
        });
      }
      // Có thể thêm thông báo cho Bộ phận Vận chuyển ở đây nếu cần
      await notifyAllModerators(
        "🚛 Thu hoạch được duyệt",
        `Lô hàng ${updatedProduct.productName} đã được duyệt thu hoạch và sẵn sàng vận chuyển.`
      );
    } else if (action === "rejectHarvest") {
      const updatedProduct = await Product.findOneAndUpdate(
        { productId: data.productId },
        { harvestStatus: 2 },
        { new: true }
      );
      // Báo cho Nông dân
      const farmer = await User.findOne({ phone: updatedProduct.farmPhone });
      if (farmer) {
        await Notification.create({
          userId: farmer._id,
          title: "Thu hoạch bị từ chối ❌",
          message: `Vui lòng kiểm tra lại lô hàng ${updatedProduct.productName}.`,
          type: "error",
        });
      }
    }

    // --- VẬN CHUYỂN ---
    else if (action === "updateReceive") {
      await Product.findOneAndUpdate(
        { productId: data.productId },
        {
          transporterName: data.transporterName,
          isReceived: true,
          statusCode: 2, // Vẫn đang trong luồng vận chuyển
        }
      );
      // Báo cho Tài xế
      await Notification.create({
        userId: req.user.userId,
        title: "Đã nhận hàng 📦",
        message: `Bạn đã nhận vận chuyển lô hàng ${data.productId}.`,
        type: "info",
      });
      // Báo cho Retailer
      await Notification.create({
        userId: req.user.userId,
        title: "Hàng đang vận chuyển 🚚",
        message: `Lô hàng ${data.productId} đang trên đường đến cửa hàng.`,
        type: "info",
      });
    } else if (action === "updateDelivery") {
      await Product.findOneAndUpdate(
        { productId: data.productId },
        {
          isDelivered: true,
        }
      );
      // Báo cho Tài xế
      await Notification.create({
        userId: req.user.userId,
        title: "Giao hàng thành công ✅",
        message: `Cảm ơn bạn đã hoàn thành chuyến xe.`,
        type: "success",
      });
      // Báo cho Retailer
      await Notification.create({
        userId: req.user.userId,
        title: "Hàng đã đến nơi 🏬",
        message: `Lô hàng ${data.productId} đã được giao đến cửa hàng.`,
        type: "success",
      });
    }

    // --- BÁN LẺ ---
    else if (action === "updateManagerInfo") {
      await Product.findOneAndUpdate(
        { productId: data.productId },
        {
          price: data.price,
          statusCode: 3, // Đang bày bán
        }
      );
      // Báo cho Retailer
      await Notification.create({
        userId: req.user.userId,
        title: "Đã lên kệ 🏪",
        message: `Sản phẩm đã được niêm yết giá: ${data.price} VNĐ.`,
        type: "success",
      });
    } else if (action === "deactivateProduct") {
      await Product.findOneAndUpdate(
        { productId: data.productId },
        {
          statusCode: 4, // Đã bán hết
        }
      );
      // Báo cho Retailer
      await Notification.create({
        userId: req.user.userId,
        title: "Bán hết 💰",
        message: `Lô hàng đã được bán xong.`,
        type: "success",
      });
    }

    // ======================================================
    // BƯỚC 4: TRẢ VỀ KẾT QUẢ
    // ======================================================
    res.json({
      success: true,
      txHash: receipt.hash,
      message: "Giao dịch thành công và đã đồng bộ Database!",
    });
  } catch (error) {
    console.error("Relayer Error:", error);
    // Nếu lỗi ở Bước 1, code sẽ nhảy xuống đây -> Database KHÔNG BỊ GHI SAI
    res.status(500).json({
      error: "Giao dịch thất bại",
      details: error.reason || error.message || error.toString(),
    });
  }
});

module.exports = router;
