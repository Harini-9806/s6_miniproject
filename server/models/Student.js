const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  id:       { type: String, unique: true },
  name:     String,
  email:    { type: String, unique: true, lowercase: true },
  phone:    String,
  rollno:   String,
  password: String
});
module.exports = mongoose.model('Student', schema);
