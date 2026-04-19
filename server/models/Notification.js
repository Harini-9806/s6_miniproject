const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  id:      { type: String, unique: true },
  userId:  String,
  message: String,
  type:    String,
  read:    { type: Boolean, default: false },
  time:    { type: Date, default: Date.now }
});
module.exports = mongoose.model('Notification', schema);
