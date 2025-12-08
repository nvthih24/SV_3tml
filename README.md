# 🌾 AgriTrace Backend - Blockchain Supply Chain Server

![NodeJS](https://img.shields.io/badge/Node.js-18.x-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![Express](https://img.shields.io/badge/Express.js-4.x-000000?style=for-the-badge&logo=express&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-6.x-47A248?style=for-the-badge&logo=mongodb&logoColor=white)
![Solidity](https://img.shields.io/badge/Solidity-^0.8.0-363636?style=for-the-badge&logo=solidity&logoColor=white)

## 📖 Giới thiệu (Introduction)

**AgriTrace Backend** là hệ thống máy chủ (RESTful API) phục vụ cho ứng dụng di động **AgriTrace Mobile**. Hệ thống này đóng vai trò trung gian quan trọng:
1.  **Quản lý dữ liệu:** Lưu trữ thông tin người dùng, cache dữ liệu sản phẩm để truy xuất nhanh qua **MongoDB**.
2.  **Cổng giao tiếp Blockchain:** Tương tác trực tiếp với **Smart Contract** (Ethereum/Polygon/Hardhat) để ghi và đọc dữ liệu truy xuất nguồn gốc, đảm bảo tính minh bạch.
3.  **Xử lý Media:** Upload và quản lý hình ảnh minh chứng (Gieo trồng, Thu hoạch) lên Cloudinary.

> **Repository liên quan:**
> * 📱 **Mobile App (Flutter):** https://github.com/nvthih24/AgriTrace-Mobile

## 🚀 Tính năng chính (Key Features)

* **Authentication & Authorization:** Đăng ký/Đăng nhập bảo mật với JWT (JSON Web Token). Phân quyền người dùng (Farmer, Transporter, Retailer, Consumer).
* **Blockchain Interaction:**
    * Sử dụng `ethers.js` để kết nối với mạng Blockchain.
    * Ghi dữ liệu mùa vụ, giao dịch vận chuyển lên Smart Contract.
    * Truy xuất lịch sử sản phẩm (Traceability Timeline) từ chuỗi khối.
* **Product Management:**
    * API tạo mùa vụ mới, cập nhật nhật ký chăm sóc, thu hoạch.
    * Đồng bộ dữ liệu giữa MongoDB (để tìm kiếm/lọc nhanh) và Blockchain (để xác thực).
* **QR Code:** Tạo và quản lý mã QR định danh cho từng lô sản phẩm.
* **File Storage:** Tích hợp Cloudinary để lưu trữ ảnh chụp thực tế từ nông dân.

## 🛠️ Tech Stack

* **Runtime:** Node.js
* **Framework:** Express.js
* **Database:** MongoDB (Mongoose ODM)
* **Blockchain Lib:** Ethers.js
* **Smart Contract:** Solidity (ProductTraceability.sol)
* **Storage:** Cloudinary API

## 📂 Cấu trúc dự án (Project Structure)

```bash
AgriTrace-Backend/
├── 📁 blockchain
│   ├── 📁 contract
│   │   ├── 📄 ProductTraceability.sol
│   │   └── ⚙️ abi.json
│   └── 📁 utils
│       └── 📄 signer.js
├── 📁 middleware
│   └── 📄 auth.js
├── 📁 models
│   ├── 📄 Notification.js
│   ├── 📄 Product.js
│   ├── 📄 Transaction.js
│   ├── 📄 User.js
│   └── 📄 qrcodes.js
├── 📁 routes
│   ├── 📄 auth.js
│   ├── 📄 forgotPassword.js
│   ├── 📄 product.js
│   ├── 📄 qrcodes.js
│   ├── 📄 transaction.js
│   └── 📄 upload.js
├── ⚙️ .gitignore
├── ⚙️ package-lock.json
├── ⚙️ package.json
└── 📄 server.js
````

## ⚙️ Cài đặt & Chạy Server (Installation)

### 1\. Yêu cầu (Prerequisites)

  * Node.js (v16 trở lên)
  * MongoDB (Local hoặc Atlas)
  * Tài khoản Cloudinary (để upload ảnh)
  * Mạng Blockchain (Hardhat Local Node hoặc Testnet như Sepolia/Amoy)

### 2\. Cài đặt

1.  **Clone repository:**

    ```bash
    git clone [https://github.com/nvthih24/AgriTrace-Backend.git](https://github.com/nvthih24/AgriTrace-Backend.git)
    cd AgriTrace-Backend
    ```

2.  **Cài đặt thư viện:**

    ```bash
    npm install
    ```

3.  **Cấu hình biến môi trường:**
    Tạo file `.env` tại thư mục gốc và điền các thông số sau:

    ```env
    # Server Config
    PORT=3000
    MONGO_URI=mongodb+srv://<username>:<password>@cluster.mongodb.net/agritrace

    # JWT Secret (Chuỗi ngẫu nhiên bất kỳ)
    JWT_SECRET=biimat_khongduoc_tietlo

    # Blockchain Config
    RPC_URL=https://... (Link RPC của mạng Blockchain)
    PRIVATE_KEY=0x... (Private Key ví deploy contract - Dùng ví test, không dùng ví thật!)
    CONTRACT_ADDRESS=0x... (Địa chỉ Smart Contract sau khi deploy)

    # Cloudinary Config (Lấy trong Dashboard Cloudinary)
    CLOUDINARY_CLOUD_NAME=...
    CLOUDINARY_API_KEY=...
    CLOUDINARY_API_SECRET=...
    ```

4.  **Chạy Server:**

    ```bash
    # Chạy môi trường dev (tự động restart khi sửa code)
    npm run dev

    # Hoặc chạy lệnh thường
    node server.js
    ```

    Server sẽ chạy tại: `http://localhost:3000`

## 📡 API Endpoints chính

| Method | Endpoint | Mô tả |
| :--- | :--- | :--- |
| **AUTH** | | |
| `POST` | `/api/auth/register` | Đăng ký tài khoản mới |
| `POST` | `/api/auth/login` | Đăng nhập, nhận JWT Token |
| **PRODUCT** | | |
| `POST` | `/api/products` | Tạo mùa vụ mới (Ghi vào Blockchain + DB) |
| `GET` | `/api/products/on-shelf` | Lấy danh sách sản phẩm đang bán (Trang chủ) |
| `GET` | `/api/products/:id` | Truy xuất nguồn gốc chi tiết sản phẩm |
| **UPLOAD** | | |
| `POST` | `/api/upload/image` | Upload ảnh (Multipart Form) |

## 🤝 Đóng góp (Contributing)

Mọi đóng góp đều được hoan nghênh. Vui lòng tạo Pull Request để cùng phát triển dự án.

## 📄 Bản quyền (License)

Dự án này được cấp phép theo giấy phép MIT.

```