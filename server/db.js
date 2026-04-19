const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/smartcanteen';

async function connectDB() {
  await mongoose.connect(MONGO_URI);
  console.log('✅ MongoDB connected:', MONGO_URI);
}

module.exports = { connectDB };
