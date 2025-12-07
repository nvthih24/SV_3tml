// /backend/blockchain/utils/signer.js
const { ethers } = require("ethers");
const ContractABI = require("../contract/abi.json");
const contractAddress = process.env.CONTRACT_ADDRESS;

// Lấy thông tin từ .env
const rpcUrl = process.env.RPC_URL || "https://rpc.zeroscan.org";
const relayerPrivateKey = process.env.PRIVATE_KEY;

if (!relayerPrivateKey) {
  throw new Error("PRIVATE_KEY must be set in .env for Relayer.");
}

const provider = new ethers.JsonRpcProvider(rpcUrl);

// 2. WALLET (SIGNER): Tài khoản Relayer sẽ ký giao dịch (BE)
const relayerSigner = new ethers.Wallet(relayerPrivateKey, provider);
console.log(`Relayer Wallet Address: ${relayerSigner.address}`);

// Mọi lệnh gọi hàm ghi (write) trên đối tượng này sẽ được Relayer ký
const contractInstance = new ethers.Contract(
  contractAddress,
  ContractABI,
  relayerSigner
);

const readContractInstance = new ethers.Contract(
  contractAddress,
  ContractABI,
  provider
);

module.exports = {
  // Contract dùng để gửi giao dịch (Relayer ký thay)
  contract: contractInstance,
  // Contract chỉ dùng để đọc dữ liệu (View/Public)
  readContract: readContractInstance,
  // Địa chỉ ví Relayer (có thể cần dùng để kiểm tra vai trò)
  relayerAddress: relayerSigner.address,
};
