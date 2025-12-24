const express = require("express");
const router = express.Router();
const { readContract } = require("../blockchain/utils/signer");
const jwtAuth = require("../middleware/auth");
const User = require("../models/User");
const Product = require("../models/Product");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
    if (!user || user.role !== "farmer") {
      return res.status(403).json({ error: "Chỉ nông dân mới xem được" });
    }

    const products = await Product.find({ farmPhone: user.phone }).sort({
      updatedAt: -1,
    });

    // Map dữ liệu về format App cần
    const formatted = products.map((p) => ({
      id: p.productId,
      name: p.productName,
      image: p.plantingImageUrl,
      status:
        p.statusCode === 4
          ? "Đã bán hết"
          : p.statusCode === 3
          ? "Đang bày bán"
          : p.harvestStatus === 2
          ? "Thu hoạch bị từ chối"
          : p.harvestStatus === 1
          ? "Đã thu hoạch"
          : p.plantingStatus === 2
          ? "Gieo trồng bị từ chối"
          : p.plantingStatus === 1
          ? "Đang trồng"
          : "Chờ duyệt gieo trồng",
      statusCode: p.statusCode,
      plantingStatus: p.plantingStatus,
      harvestStatus: p.harvestStatus,
      harvestDate: p.harvestDate || 0,
    }));

    console.log(
      `--> Tải nhanh ${products.length} SP cho nông dân ${user.phone}`
    );

    // 3. Trả về ngay lập tức
    res.json({ products: formatted });
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
    const products = [];
    const rawNextId = await readContract.nextProductId();
    const nextId = toNumber(rawNextId);

    console.log("NextID (Number):", nextId);

    let count = 0;
    // Vòng lặp lấy sản phẩm
    for (let i = nextId - 1; i >= 1 && count < 10; i--) {
      try {
        const pid = await readContract.indexToProductId(i);
        const trace = await readContract.getTrace(pid);
        const price = toNumber(trace.price);

        if (price > 0) {
          // --- (Logic xử lý tên nông trại & sản phẩm GIỮ NGUYÊN) ---
          let finalFarmName = trace.farmName || "Nông trại";
          try {
            const farmer = await User.findOne({ phone: trace.creatorPhone });
            if (farmer) {
              if (farmer.companyName && farmer.companyName.trim() !== "") {
                finalFarmName = farmer.companyName;
              } else if (farmer.fullName) {
                finalFarmName = farmer.fullName;
              }
            }
          } catch (dbError) {}

          let finalProductName = trace.productName;
          try {
            const productInDB = await Product.findOne({ productId: pid });
            if (productInDB && productInDB.productName) {
              finalProductName = productInDB.productName;
            }
          } catch (e) {}

          if (!finalProductName || finalProductName.trim() === "") {
            finalProductName = "Sản phẩm nông nghiệp";
          }
          // -----------------------------------------------------------

          products.push({
            id: pid,
            name: finalProductName,
            price: price,
            image: trace.managerReceiveImageUrl || trace.plantingImageUrl || "",
            farm: finalFarmName,
          });

          count++;

          // 🔥 2. QUAN TRỌNG: Nghỉ 0.2 giây sau khi lấy thành công 1 món
          // Giúp giảm tải request, tránh bị QuickNode chặn (Limit 15 req/s)
          await sleep(200);
        }
      } catch (e) {
        console.log(`Lỗi khi đọc sản phẩm ID ${i}:`, e.message);
        // Nếu lỗi cũng nghỉ xíu cho mạng nó thở
        await sleep(200);
      }
    }

    res.json({ success: true, data: products });
  } catch (e) {
    console.error("Lỗi server /on-shelf:", e);
    res.status(500).json({ error: e.message });
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

    let finalProductName = trace.productName;
    let finalFarmName = trace.farmName;

    let harvestQty = "Chưa cập nhật";
    let harvestQuality = "Chưa kiểm định";

    try {
      // 1. Tìm trong Database để lấy dữ liệu chuẩn nhất
      const productInDB = await Product.findOne({ productId: productId });

      if (productInDB) {
        // Lấy tên tiếng Việt chuẩn (Logic cũ - Giữ nguyên)
        if (productInDB.productName) finalProductName = productInDB.productName;
        if (productInDB.farmName) finalFarmName = productInDB.farmName;

        // 🔥 LOGIC MỚI: Ưu tiên lấy Sản lượng/Chất lượng từ DB trước
        if (productInDB.quantity && productInDB.quantity > 0) {
          harvestQty = `${productInDB.quantity} ${productInDB.unit || "Kg"}`;
          harvestQuality = productInDB.quality || "Chưa kiểm định";
        }
      }

      // 🔥 LOGIC BỔ SUNG (FALLBACK):
      // Nếu DB chưa có (vẫn là "Chưa cập nhật") -> Lấy tạm từ Blockchain đắp vào
      if (harvestQty === "Chưa cập nhật" && trace.harvestQuantity > 0) {
        harvestQty = `${toNumber(trace.harvestQuantity)} Kg`;
        harvestQuality = trace.harvestQuality || "Chưa kiểm định";
      }

      // Xử lý tên Farm từ bảng User nếu cần (Logic cũ - Giữ nguyên)
      if (!finalFarmName || finalFarmName === "Nông trại") {
        const farmer = await User.findOne({ phone: trace.creatorPhone });
        if (farmer && farmer.companyName) finalFarmName = farmer.companyName;
      }
    } catch (e) {
      console.log("Lỗi tìm DB phụ trợ:", e.message);
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
      name: finalProductName,
      farm: {
        name: finalFarmName,
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
      harvestInfo: {
        quantity: harvestQty,
        quality: harvestQuality,
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
