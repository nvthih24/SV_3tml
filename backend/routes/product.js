const express = require("express");
const router = express.Router();
const { readContract } = require("../blockchain/utils/signer");
const jwtAuth = require("../middleware/auth");
const User = require("../models/User");
const Product = require("../models/Product");

// HÀM CHUYỂN BigInt/Number/string → number an toàn
const toNumber = (value) => {
  if (!value) return 0;
  if (typeof value === "string") return parseInt(value) || 0;
  if (value._isBigNumber || value.toString) return Number(value.toString());
  return Number(value);
};

router.get("/my-products", jwtAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    // Query MongoDB: Tìm sản phẩm có SĐT trùng với user
    const products = await Product.find({ farmPhone: user.phone }).sort({
      updatedAt: -1,
    });

    // Map dữ liệu về format App cần
    const formatted = products.map((p) => ({
      id: p.productId,
      name: p.productName,
      image: p.plantingImageUrl,
      status:
        p.statusCode === 3
          ? "Đang bày bán"
          : p.statusCode === 4
          ? "Đã bán hết"
          : p.harvestStatus === 1
          ? "Đã thu hoạch"
          : p.plantingStatus === 1
          ? "Đang trồng"
          : "Chờ duyệt gieo trồng",
      statusCode: p.statusCode,
      plantingStatus: p.plantingStatus,
      harvestStatus: p.harvestStatus,
      harvestDate: p.harvestDate || 0,
    }));

    res.json({ success: true, products: formatted }); // Lưu ý: App đang đọc data['products']
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API CHO MODERATOR: Lấy danh sách chờ duyệt
router.get("/pending-requests", jwtAuth, async (req, res) => {
  try {
    // Query MongoDB: Lấy status = 0 (Gieo) hoặc (Gieo=1 & Thu=0 & Có ngày thu)
    const allPending = await Product.find({
      $or: [
        { plantingStatus: 0 },
        { plantingStatus: 1, harvestStatus: 0, harvestDate: { $gt: 0 } },
      ],
    }).sort({ updatedAt: -1 });

    const planting = [];
    const harvest = [];

    allPending.forEach((p) => {
      const item = {
        id: p.productId,
        name: p.productName,
        farm: p.farmName || "Nông trại",
        image: p.plantingImageUrl,
        date: p.plantingDate,
        quantity: p.quantity || "N/A",
      };
      if (p.plantingStatus === 0) {
        planting.push({ ...item, type: "planting" });
      } else {
        harvest.push({ ...item, type: "harvest", quantity: "N/A" });
      }
    });

    res.json({ success: true, data: { planting, harvest } });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API: Lấy lịch sử kiểm duyệt (Đã duyệt / Từ chối)
router.get("/moderated-requests", jwtAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user || user.role !== "moderator")
      return res.status(403).json({ error: "Cấm" });

    const historyPlanting = [];
    const historyHarvest = [];
    const nextId = await readContract.nextProductId();

    for (let i = 1; i < nextId; i++) {
      try {
        const pid = await readContract.indexToProductId(i);
        if (!pid) continue;
        const trace = await readContract.getTrace(pid);

        const pStatus = toNumber(trace.plantingStatus); // 1: Approved, 2: Rejected
        const hStatus = toNumber(trace.harvestStatus);

        const item = {
          id: pid,
          name: trace.productName,
          farm: trace.farmName,
          image: trace.plantingImageUrl || "",
          date: toNumber(trace.plantingDate),
          status: "Unknown",
        };

        // Lọc danh sách Gieo trồng đã xử lý (Khác 0)
        if (pStatus !== 0) {
          let statusText = pStatus === 1 ? "Đã duyệt" : "Từ chối";
          historyPlanting.push({
            ...item,
            status: statusText,
            statusCode: pStatus,
          });
        }

        // Lọc danh sách Thu hoạch đã xử lý (Khác 0)
        if (hStatus !== 0) {
          let statusText = hStatus === 1 ? "Đã duyệt" : "Từ chối";
          historyHarvest.push({
            ...item,
            status: statusText,
            statusCode: hStatus,
            image: trace.harvestImageUrl || item.image,
            type: "harvest",
          });
        }
      } catch (e) {}
    }

    res.json({
      success: true,
      data: { planting: historyPlanting, harvest: historyHarvest },
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// API: Lấy danh sách hàng hóa của Tài xế (Đang chở hoặc Đã giao)
router.get("/my-shipments", jwtAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    const filterName = user.companyName || user.fullName;

    // Query MongoDB
    const shipments = await Product.find({
      isReceived: true,
      transporterName: filterName,
    }).sort({ updatedAt: -1 });

    const formatted = shipments.map((p) => ({
      id: p.productId,
      name: p.productName,
      image: p.plantingImageUrl,
      location: p.isDelivered ? "Đã giao xong" : "Đang vận chuyển",
      time: p.plantingDate, // Tạm dùng plantingDate hoặc thêm field updateDate
      statusCode: p.isDelivered ? 2 : 1,
      farmName: p.farmName,
    }));

    res.json({ success: true, data: formatted });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API: Lấy danh sách hàng hóa của Siêu thị (Retailer)
router.get("/retailer-products", jwtAuth, async (req, res) => {
  try {
    // Query MongoDB: Lấy hàng đã giao (isDelivered = true)
    const products = await Product.find({ isDelivered: true }).sort({
      updatedAt: -1,
    });

    const formatted = products.map((p) => ({
      id: p.productId,
      name: p.productName,
      farm: p.farmName,
      image: p.plantingImageUrl,
      price: p.price > 0 ? `${p.price}` : "",
      statusCode: p.statusCode === 4 ? 4 : p.price > 0 ? 3 : 2,
      status:
        p.statusCode === 4
          ? "Đã bán hết"
          : p.price > 0
          ? "Đang bày bán"
          : "Chờ lên kệ",
      time: p.harvestDate, // Tạm dùng field này hoặc thêm deliveryDate vào DB
    }));

    res.json({ success: true, data: formatted });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API CÔNG KHAI: Lấy danh sách sản phẩm MỚI LÊN KỆ (Status = 3)
router.get("/on-shelf", async (req, res) => {
  try {
    // Query MongoDB: Lấy hàng đang bán (statusCode = 3)
    const products = await Product.find({ statusCode: 3 })
      .sort({ updatedAt: -1 })
      .limit(10);

    const formatted = products.map((p) => ({
      id: p.productId,
      name: p.productName,
      price: p.price,
      image: p.plantingImageUrl,
      farm: p.farmName,
    }));

    res.json({ success: true, data: formatted });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API CÔNG KHAI: Lấy danh sách sản phẩm của 1 nông dân cụ thể (qua SĐT)
router.get("/by-farmer/:phone", async (req, res) => {
  try {
    const farmerPhone = req.params.phone;
    const products = await Product.find({
      farmPhone: farmerPhone,
      plantingStatus: 1,
    }).sort({
      updatedAt: -1,
    });

    const formatted = products.map((p) => ({
      id: p.productId,
      name: p.productName,
      image: p.plantingImageUrl,
      status: p.statusCode >= 2 ? "Đã thu hoạch" : "Đang trồng",
    }));

    res.json({ success: true, data: formatted });
  } catch (error) {
    res.status(500).json({ error: "Lỗi server" });
  }
});

// API CÔNG KHAI: Lấy chi tiết sản phẩm & Nhật ký chăm sóc theo ID
// GET /api/products/:id
router.get("/:id", async (req, res) => {
  try {
    const productId = req.params.id;
    console.log("🔍 Đang truy xuất sản phẩm:", productId);

    // 1. Lấy thông tin cơ bản (TraceInfo)
    const trace = await readContract.getTrace(productId);

    // Kiểm tra xem sản phẩm có tồn tại không
    if (
      !trace ||
      trace.productId === "" ||
      trace.productId === "0x0000000000000000000000000000000000000000"
    ) {
      return res
        .status(404)
        .json({ error: "Sản phẩm không tồn tại trên Blockchain" });
    }

    // 2. Lấy nhật ký chăm sóc (CareLogs) - Vì mảng trong struct đôi khi trả về lỗi, nên gọi hàm riêng nếu có
    // Nếu trong contract ông có hàm getCareLogs thì dùng, không thì dùng trace.careLogs
    let careLogs = [];
    try {
      careLogs = await readContract.getCareLogs(productId);
    } catch (e) {
      console.log("⚠️ Không lấy được CareLogs hoặc rỗng:", e.message);
      careLogs = trace.careLogs || [];
    }

    // 3. Format dữ liệu cho đẹp (BigInt -> Number)
    const formattedProduct = {
      id: trace.productId,
      name: trace.productName,
      farm: {
        name: trace.farmName,
        owner: trace.creatorName,
        phone: trace.creatorPhone,
        seed: trace.seedOrigin || "Không rõ nguồn gốc",
      },
      dates: {
        planting: toNumber(trace.plantingDate),
        harvest: toNumber(trace.harvestDate),
        receive: toNumber(trace.receiveDate),
        delivery: toNumber(trace.deliveryDate),
      },
      images: {
        planting: trace.plantingImageUrl,
        harvest: trace.harvestImageUrl,
        receive: trace.receiveImageUrl,
        delivery: trace.deliveryImageUrl,
      },
      status: {
        planting: toNumber(trace.plantingStatus), // 0: Pending, 1: Approved
        harvest: toNumber(trace.harvestStatus),
      },
      transporter: {
        name: trace.transporterName,
        info: trace.transportInfo,
      },
      retailer: {
        price: toNumber(trace.price),
        image: trace.managerReceiveImageUrl,
      },
      // Format lại CareLogs
      careLogs: careLogs.map((log) => ({
        type: log.careType,
        desc: log.description,
        date: toNumber(log.careDate),
        image: log.careImageUrl,
      })),
    };

    res.json({ success: true, data: formattedProduct });
  } catch (error) {
    console.error("Lỗi truy xuất:", error);
    res.status(500).json({ error: "Lỗi server khi truy xuất Blockchain" });
  }
});

module.exports = router;
