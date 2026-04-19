const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  id:        { type: String, unique: true },
  name:      String,
  category:  String,
  price:     Number,
  prepTime:  Number,
  emoji:     { type: String, default: '🍽️' },
  available: { type: Boolean, default: true }
});
module.exports = mongoose.model('MenuItem', schema);
