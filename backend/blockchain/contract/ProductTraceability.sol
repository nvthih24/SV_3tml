// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/AccessControl.sol";

contract ProductTraceability is AccessControl {
    bytes32 public constant FARMER_ROLE = keccak256("FARMER_ROLE");
    bytes32 public constant TRANSPORTER_ROLE = keccak256("TRANSPORTER_ROLE");
    bytes32 public constant MANAGER_ROLE = keccak256("MANAGER_ROLE");
    bytes32 public constant MODERATOR_ROLE = keccak256("MODERATOR_ROLE");

    // Nhật ký chăm sóc
    struct CareLog {
        string careType; // Bón phân, phun thuốc, tưới nước...
        string description;
        uint256 careDate;
        string careImageUrl;
    }

    struct TraceInfo {
        address createdBy;
        string creatorPhone;
        string creatorName;
        string productName;
        string productId;
        string farmName;
        uint256 plantingDate;
        string plantingImageUrl;
        // === MỚI: Nguồn gốc hạt giống ===
        string seedOrigin;
        string seedImageUrl;
        uint256 harvestDate;
        string harvestImageUrl;
        string transporterName;
        
        uint256 receiveDate;
        string receiveImageUrl;
        uint256 deliveryDate;
        string deliveryImageUrl;
        string transportInfo;
        uint256 managerReceiveDate;
        string managerReceiveImageUrl;
        uint256 price;
        bool isActive;
        address farmer;
        address transporter;
        uint8 plantingStatus; // 0: pending, 1: approved, 2: rejected
        uint8 harvestStatus;
        // === MỚI: Nhật ký chăm sóc ===
        CareLog[] careLogs;
        uint256 harvestQuantity;  // san luong thu hoach
        string harvestQuality;    // danh gia chat luong 
    }

    mapping(string => TraceInfo) public productTraces;
    mapping(address => string[]) public farmerProducts;
    mapping(address => string[]) public transporterProducts;
    mapping(address => string[]) public managerProducts;
    mapping(uint256 => string) public indexToProductId;
    mapping(address => string) public moderatorToFarm;
    mapping(address => string[]) public moderatedProducts;
    uint256 public nextProductId = 1;

    // ================== EVENTS ==================
    event ProductAdded(
        string indexed productId,
        string productName,
        string farmName,
        uint256 plantingDate,
        string plantingImageUrl,
        uint256 harvestDate,
        string harvestImageUrl,
        address indexed farmer
    );
    event SeedOriginAdded(string indexed productId, string seedOrigin);
    event CareLogged(
        string indexed productId,
        string careType,
        uint256 careDate,
        string description
    );
    event ProductUpdated(
        string indexed productId,
        string productName,
        string farmName,
        uint256 harvestDate,
        string harvestImageUrl
    );
    event ReceiveUpdated(
        string indexed productId,
        string transporterName,
        uint256 receiveDate,
        string receiveImageUrl,
        string transportInfo,
        address indexed transporter
    );
    event DeliveryUpdated(
        string indexed productId,
        string transporterName,
        uint256 deliveryDate,
        string deliveryImageUrl,
        string transportInfo,
        address indexed transporter
    );
    event ManagerInfoUpdated(
        string indexed productId,
        uint256 managerReceiveDate,
        string managerReceiveImageUrl,
        uint256 price
    );
    event PlantingApproved(string indexed productId);
    event PlantingRejected(string indexed productId);
    event HarvestApproved(string indexed productId);
    event HarvestRejected(string indexed productId);

    constructor(address initialOwner) {
        _grantRole(DEFAULT_ADMIN_ROLE, initialOwner);
        _grantRole(FARMER_ROLE, initialOwner);
        _grantRole(TRANSPORTER_ROLE, initialOwner);
        _grantRole(MANAGER_ROLE, initialOwner);
        _grantRole(MODERATOR_ROLE, initialOwner);
    }

    // Gán moderator cho nông trại (admin)
    function assignModerator(
        address moderator,
        string memory farmName
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _grantRole(MODERATOR_ROLE, moderator);
        moderatorToFarm[moderator] = farmName;
    }

    // ================== FARMER ==================
    function addProduct(
        string memory _productName,
        string memory _productId,
        string memory _farmName,
        uint256 _plantingDate,
        string memory _plantingImageUrl,
        uint256 _harvestDate,
        string memory _harvestImageUrl,
        string memory _seedOrigin,
        string memory _seedImageUrl,
        // THÊM 2 THAM SỐ NÀY VÀO ĐÂY
        string memory _creatorPhone,
        string memory _creatorName,
        uint256 _harvestQuantity,
        string memory _harvestQuality

    ) external onlyRole(FARMER_ROLE) returns (string memory) {
        require(
            bytes(productTraces[_productId].productId).length == 0,
            "Product ID exists"
        );

        productTraces[_productId] = TraceInfo({
            createdBy: msg.sender, // ví Relayer (backend)
            creatorPhone: _creatorPhone, // SĐT nông dân thật
            creatorName: _creatorName, // Tên nông dân thật
            productName: _productName,
            productId: _productId,
            farmName: _farmName,
            plantingDate: _plantingDate,
            plantingImageUrl: _plantingImageUrl,
            seedOrigin: _seedOrigin,
            seedImageUrl: _seedImageUrl,
            harvestDate: _harvestDate,
            harvestImageUrl: _harvestImageUrl,
            transporterName: "",
            receiveDate: 0,
            receiveImageUrl: "",
            deliveryDate: 0,
            deliveryImageUrl: "",
            transportInfo: "",
            managerReceiveDate: 0,
            managerReceiveImageUrl: "",
            price: 0,
            isActive: true,
            farmer: msg.sender, // vẫn là Relayer (đúng rồi)
            transporter: address(0),
            plantingStatus: 0,
            harvestStatus: 0,
            careLogs: new CareLog[](0),
            harvestQuantity: _harvestQuantity,
            harvestQuality: _harvestQuality
        });

        farmerProducts[msg.sender].push(_productId);
        indexToProductId[nextProductId] = _productId;
        nextProductId++;

        emit ProductAdded(
            _productId,
            _productName,
            _farmName,
            _plantingDate,
            _plantingImageUrl,
            _harvestDate,
            _harvestImageUrl,
            msg.sender
        );
        emit SeedOriginAdded(_productId, _seedOrigin);

        return _productId;
    }

    // Nhật ký chăm sóc
    function logCare(
        string memory _productId,
        string memory _careType,
        string memory _description,
        uint256 _careDate,
        string memory _careImageUrl,
        string memory _creatorPhone, // thêm
        string memory _creatorName
    ) external onlyRole(FARMER_ROLE) {
        TraceInfo storage trace = productTraces[_productId];
        require(bytes(trace.productId).length != 0, "Product not found");
        require(trace.farmer == msg.sender, "Only owner farmer");

        trace.careLogs.push(
            CareLog({
                careType: _careType,
                description: _description,
                careDate: _careDate,
                careImageUrl: _careImageUrl
            })
        );

        emit CareLogged(_productId, _careType, _careDate, _description);
    }

    function updateProduct(
        string memory _productId,
        string memory _productName,
        string memory _farmName,
        uint256 _harvestDate,
        string memory _harvestImageUrl,
        uint256 _harvestQuantity,
        string memory _harvestQuality
    ) external onlyRole(FARMER_ROLE) {
        TraceInfo storage trace = productTraces[_productId];
        require(bytes(trace.productId).length != 0, "Product not found");
        require(trace.isActive, "Product not active");
        require(
            trace.farmer == msg.sender,
            "Only the farmer who added the product can update it"
        );

        trace.productName = _productName;
        trace.farmName = _farmName;
        trace.harvestDate = _harvestDate;
        trace.harvestImageUrl = _harvestImageUrl;
        trace.harvestStatus = 0;
        trace.harvestQuantity = _harvestQuantity;
        trace.harvestQuality = _harvestQuality;


        emit ProductUpdated(
            _productId,
            _productName,
            _farmName,
            _harvestDate,
            _harvestImageUrl
        );
    }

    // ================== MODERATOR ==================
    function approvePlanting(
        string memory _productId
    ) external onlyRole(MODERATOR_ROLE) {
        TraceInfo storage trace = productTraces[_productId];
        require(bytes(trace.productId).length != 0, "Product not found");
        require(trace.plantingStatus == 0, "Planting not pending");
        trace.plantingStatus = 1;
        moderatedProducts[msg.sender].push(_productId);
        emit PlantingApproved(_productId);
    }

    function rejectPlanting(
        string memory _productId
    ) external onlyRole(MODERATOR_ROLE) {
        TraceInfo storage trace = productTraces[_productId];
        require(bytes(trace.productId).length != 0, "Product not found");
        require(trace.plantingStatus == 0, "Planting not pending");
        trace.plantingStatus = 2;
        moderatedProducts[msg.sender].push(_productId);
        emit PlantingRejected(_productId);
    }

    function approveHarvest(
        string memory _productId
    ) external onlyRole(MODERATOR_ROLE) {
        TraceInfo storage trace = productTraces[_productId];
        require(bytes(trace.productId).length != 0, "Product not found");
        require(trace.harvestStatus == 0, "Harvest not pending");
        require(trace.harvestDate > 0, "Harvest not updated");
        trace.harvestStatus = 1;
        moderatedProducts[msg.sender].push(_productId);
        emit HarvestApproved(_productId);
    }

    function rejectHarvest(
        string memory _productId
    ) external onlyRole(MODERATOR_ROLE) {
        TraceInfo storage trace = productTraces[_productId];
        require(bytes(trace.productId).length != 0, "Product not found");
        require(trace.harvestStatus == 0, "Harvest not pending");
        require(trace.harvestDate > 0, "Harvest not updated");
        trace.harvestStatus = 2;
        moderatedProducts[msg.sender].push(_productId);
        emit HarvestRejected(_productId);
    }

    // ================== TRANSPORTER ==================
    function updateReceive(
        string memory _productId,
        string memory _transporterName,
        uint256 _receiveDate,
        string memory _receiveImageUrl,
        string memory _transportInfo
    ) external onlyRole(TRANSPORTER_ROLE) {
        require(
            bytes(productTraces[_productId].productId).length != 0,
            "Product not found"
        );
        require(productTraces[_productId].isActive, "Product not active");
        require(
            productTraces[_productId].receiveDate == 0,
            "Receive info already updated"
        );

        TraceInfo storage trace = productTraces[_productId];
        trace.transporterName = _transporterName;
        trace.receiveDate = _receiveDate;
        trace.receiveImageUrl = _receiveImageUrl;
        trace.transportInfo = _transportInfo;
        trace.transporter = msg.sender;
        transporterProducts[msg.sender].push(_productId);

        emit ReceiveUpdated(
            _productId,
            _transporterName,
            _receiveDate,
            _receiveImageUrl,
            _transportInfo,
            msg.sender
        );
    }

    function updateDelivery(
        string memory _productId,
        string memory _transporterName,
        uint256 _deliveryDate,
        string memory _deliveryImageUrl,
        string memory _transportInfo
    ) external onlyRole(TRANSPORTER_ROLE) {
        require(
            bytes(productTraces[_productId].productId).length != 0,
            "Product not found"
        );
        require(productTraces[_productId].isActive, "Product not active");
        require(
            productTraces[_productId].receiveDate != 0,
            "Must update receive info first"
        );
        require(
            productTraces[_productId].transporter == msg.sender,
            "Only the transporter who updated receive info can update delivery"
        );

        TraceInfo storage trace = productTraces[_productId];
        trace.transporterName = _transporterName;
        trace.deliveryDate = _deliveryDate;
        trace.deliveryImageUrl = _deliveryImageUrl;
        trace.transportInfo = _transportInfo;

        emit DeliveryUpdated(
            _productId,
            _transporterName,
            _deliveryDate,
            _deliveryImageUrl,
            _transportInfo,
            msg.sender
        );
    }

    // ================== MANAGER ==================
    function updateManagerInfo(
        string memory _productId,
        uint256 _managerReceiveDate,
        string memory _managerReceiveImageUrl,
        uint256 _price
    ) external onlyRole(MANAGER_ROLE) {
        require(
            bytes(productTraces[_productId].productId).length != 0,
            "Product not found"
        );
        require(productTraces[_productId].isActive, "Product not active");

        TraceInfo storage trace = productTraces[_productId];
        trace.managerReceiveDate = _managerReceiveDate;
        trace.managerReceiveImageUrl = _managerReceiveImageUrl;
        trace.price = _price;
        managerProducts[msg.sender].push(_productId);

        emit ManagerInfoUpdated(
            _productId,
            _managerReceiveDate,
            _managerReceiveImageUrl,
            _price
        );
    }

    // ================== VIEW FUNCTIONS ==================
    function getTrace(
        string memory _productId
    ) external view returns (TraceInfo memory) {
        require(
            bytes(productTraces[_productId].productId).length != 0,
            "Product not found"
        );
        return productTraces[_productId];
    }

    function getCareLogs(
        string memory _productId
    ) external view returns (CareLog[] memory) {
        return productTraces[_productId].careLogs;
    }

    function getPendingProductsByFarm(
        string memory farmName
    ) external view returns (TraceInfo[] memory) {
        uint256 count = 0;
        for (uint256 i = 1; i < nextProductId; i++) {
            string memory pid = indexToProductId[i];
            TraceInfo memory trace = productTraces[pid];
            if (
                keccak256(bytes(trace.farmName)) ==
                keccak256(bytes(farmName)) &&
                (trace.plantingStatus == 0 ||
                    (trace.harvestStatus == 0 && trace.harvestDate > 0))
            ) {
                count++;
            }
        }
        TraceInfo[] memory result = new TraceInfo[](count);
        uint256 idx = 0;
        for (uint256 i = 1; i < nextProductId; i++) {
            string memory pid = indexToProductId[i];
            TraceInfo memory trace = productTraces[pid];
            if (
                keccak256(bytes(trace.farmName)) ==
                keccak256(bytes(farmName)) &&
                (trace.plantingStatus == 0 ||
                    (trace.harvestStatus == 0 && trace.harvestDate > 0))
            ) {
                result[idx] = trace;
                idx++;
            }
        }
        return result;
    }

    function getProductsByFarmer(
        address farmer
    ) external view returns (TraceInfo[] memory) {
        string[] memory productIds = farmerProducts[farmer];
        TraceInfo[] memory result = new TraceInfo[](productIds.length);
        for (uint256 i = 0; i < productIds.length; i++) {
            result[i] = productTraces[productIds[i]];
        }
        return result;
    }

    function getProductsByTransporter(
        address transporter
    ) external view returns (TraceInfo[] memory) {
        string[] memory productIds = transporterProducts[transporter];
        TraceInfo[] memory result = new TraceInfo[](productIds.length);
        for (uint256 i = 0; i < productIds.length; i++) {
            result[i] = productTraces[productIds[i]];
        }
        return result;
    }

    function getProductsByManager(
        address manager
    ) external view returns (TraceInfo[] memory) {
        string[] memory productIds = managerProducts[manager];
        TraceInfo[] memory result = new TraceInfo[](productIds.length);
        for (uint256 i = 0; i < productIds.length; i++) {
            result[i] = productTraces[productIds[i]];
        }
        return result;
    }

    function getProductIdsByManager(
        address manager
    ) external view returns (string[] memory) {
        return managerProducts[manager];
    }

    function getModeratedProducts(
        address moderator
    ) external view returns (TraceInfo[] memory) {
        string[] memory productIds = moderatedProducts[moderator];
        TraceInfo[] memory result = new TraceInfo[](productIds.length);
        for (uint256 i = 0; i < productIds.length; i++) {
            result[i] = productTraces[productIds[i]];
        }
        return result;
    }

    // Deactivate
    function deactivateProduct(
        string memory _productId
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(
            bytes(productTraces[_productId].productId).length != 0,
            "Product not found"
        );
        productTraces[_productId].isActive = false;
    }
}
