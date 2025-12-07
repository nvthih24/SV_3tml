const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  txHash: { type: String, required: true, unique: true },
  productId: { type: String, required: true },
  userAddress: { type: String, required: true },
  action: { type: String, required: true },
  timestamp: { type: Number, required: true },
  plantingImageUrl: { type: String },
  harvestImageUrl: { type: String },
  receiveImageUrl: { type: String },
  deliveryImageUrl: { type: String },
  managerReceiveImageUrl: { type: String },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Transaction', transactionSchema);