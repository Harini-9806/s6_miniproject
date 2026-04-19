const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  id:       { type: String, unique: true },
  name:     String,
  email:    { type: String, unique: true, lowercase: true },
  password: String,
  upiId:    String,
  phone:    String
});
module.exports = mongoose.model('Owner', schema);
