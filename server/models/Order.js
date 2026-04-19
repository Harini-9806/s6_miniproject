const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  id:               { type: String, unique: true },
  token:            { type: String, default: null },
  studentId:        String,
  studentName:      String,
  items:            [{ name: String, qty: Number, price: Number }],
  total:            Number,
  payment:          String,
  paymentVerified:  { type: Boolean, default: false },
  tokenGenerated:   { type: Boolean, default: false },
  status:           { type: String, default: 'pending' },
  slot:             String,
  createdAt:        { type: Date, default: Date.now },
  completedAt:      { type: Date, default: null },
  readyAt:          { type: Date, default: null }
});
module.exports = mongoose.model('Order', schema);
