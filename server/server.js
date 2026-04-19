const express  = require('express');
const cors     = require('cors');
const path     = require('path');
const bcrypt   = require('bcryptjs');
const { connectDB } = require('./db');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..')));

app.use('/api/auth',          require('./routes/auth'));
app.use('/api/menu',          require('./routes/menu'));
app.use('/api/orders',        require('./routes/orders'));
app.use('/api/notifications', require('./routes/notifications'));

app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

app.get(/.*/, (req, res) => {
    if (req.path.startsWith('/api')) {
        return res.status(404).json({ error: 'Not found' });
    }
    const fs = require('fs');
    const filePath = path.join(__dirname, '..', req.path);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        res.sendFile(filePath);
    } else {
        res.sendFile(path.join(__dirname, '..', 'index.html'));
    }
});
const PORT = process.env.PORT || 3000;

async function start() {
  try {
    await connectDB();
  } catch (e) {
    console.error('❌ MongoDB connection failed:', e.message);
    console.error('   Make sure MongoDB is running: mongod');
    process.exit(1);
  }
  await seedData();
  app.listen(PORT, () => {
    console.log(`\n🍽️  Smart Canteen Server running at http://localhost:${PORT}`);
    console.log(`📋  API Base: http://localhost:${PORT}/api`);
    console.log(`\n🔑  Demo Credentials:`);
    console.log(`    Student : arjun@college.edu  / student123`);
    console.log(`    Owner   : owner@canteen.com  / owner123\n`);
  });
}

async function seedData() {
  const Owner    = require('./models/Owner');
  const Student  = require('./models/Student');
  const MenuItem = require('./models/MenuItem');

  // Seed owner
  if (!await Owner.findOne({ id: 'o1' })) {
    await Owner.create({
      id: 'o1', name: 'Ravi Canteen',
      email: 'owner@canteen.com',
      password: await bcrypt.hash('owner123', 10),
      upiId: 'ravi@upi', phone: '9000000001'
    });
    console.log('🌱 Owner seeded');
  }

  // Seed demo student
  if (!await Student.findOne({ id: 's1' })) {
    await Student.create({
      id: 's1', name: 'Arjun Kumar',
      email: 'arjun@college.edu',
      password: await bcrypt.hash('student123', 10),
      phone: '9876543210', rollno: 'CS2021001'
    });
    console.log('🌱 Demo student seeded');
  }

  // Seed menu items
  if (await MenuItem.countDocuments() === 0) {
    await MenuItem.insertMany([
      { id: 'M001', name: 'Idly',          category: 'Breakfast',  price: 30, prepTime: 10, emoji: '🍚' },
      { id: 'M002', name: 'Dosa',          category: 'Breakfast',  price: 40, prepTime: 10, emoji: '🫓' },
      { id: 'M003', name: 'Pongal',        category: 'Breakfast',  price: 35, prepTime: 10, emoji: '🍲' },
      { id: 'M004', name: 'Upma',          category: 'Breakfast',  price: 30, prepTime: 10, emoji: '🥣' },
      { id: 'M005', name: 'Vada',          category: 'Breakfast',  price: 20, prepTime: 8,  emoji: '🍩' },
      { id: 'M006', name: 'Chapati',       category: 'Lunch',      price: 15, prepTime: 5,  emoji: '🫓' },
      { id: 'M007', name: 'Rice & Sambar', category: 'Lunch',      price: 50, prepTime: 15, emoji: '🍛' },
      { id: 'M008', name: 'Veg Meals',     category: 'Lunch',      price: 80, prepTime: 15, emoji: '🍱' },
      { id: 'M009', name: 'Fried Rice',    category: 'Lunch',      price: 70, prepTime: 15, emoji: '🍚' },
      { id: 'M010', name: 'Noodles',       category: 'Lunch',      price: 60, prepTime: 12, emoji: '🍜' },
      { id: 'M011', name: 'Samosa',        category: 'Snacks',     price: 15, prepTime: 5,  emoji: '🥟' },
      { id: 'M012', name: 'Bread Omelette',category: 'Snacks',     price: 35, prepTime: 8,  emoji: '🍳' },
      { id: 'M013', name: 'Sandwich',      category: 'Snacks',     price: 40, prepTime: 8,  emoji: '🥪' },
      { id: 'M014', name: 'Tea',           category: 'Beverages',  price: 10, prepTime: 3,  emoji: '☕' },
      { id: 'M015', name: 'Coffee',        category: 'Beverages',  price: 15, prepTime: 3,  emoji: '☕' },
      { id: 'M016', name: 'Lassi',         category: 'Beverages',  price: 30, prepTime: 5,  emoji: '🥛' },
    ]);
    console.log('🌱 Menu seeded');
  }
}

start();
