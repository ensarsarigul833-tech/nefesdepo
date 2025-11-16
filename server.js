// server.js - Nefes Depo Nakliyat Backend (CORS Düzeltilmiş)
const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// ===== MIDDLEWARE =====
// CORS ayarları - TÜM ORIGIN'LERE İZİN VER
app.use(cors({
  origin: '*', // Tüm domain'lere izin ver
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-admin-password']
}));

// Preflight requests için
app.options('*', cors());

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

console.log('✅ Middleware yüklendi');

// ===== MONGODB BAĞLANTISI =====
mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('✅ MongoDB bağlantısı başarılı!');
  })
  .catch((err) => {
    console.error('❌ MongoDB bağlantı hatası:', err.message);
  });

// ===== MONGODB SCHEMA =====
const quoteSchema = new mongoose.Schema({
  quoteNumber: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  phone: { type: String, required: true },
  email: { type: String, default: null },
  service: { type: String, required: true },
  from: { type: String, required: true },
  to: { type: String, required: true },
  message: { type: String, default: null },
  status: {
    type: String,
    enum: ['pending', 'contacted', 'quoted', 'completed', 'cancelled'],
    default: 'pending'
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

const Quote = mongoose.model('Quote', quoteSchema);
console.log('✅ MongoDB Schema tanımlandı');

// ===== EMAIL TRANSPORTER =====
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});
console.log('✅ Email transporter hazır');

// ===== ADMIN AUTH MIDDLEWARE =====
const adminAuth = (req, res, next) => {
  const adminPassword = process.env.ADMIN_PASSWORD || 'nefes2024';
  const providedPassword = req.headers['x-admin-password'] || req.query.password;
  
  if (providedPassword === adminPassword) {
    next();
  } else {
    res.status(401).json({
      status: 'error',
      message: 'Yetkisiz erişim'
    });
  }
};

// ===== PUBLIC ENDPOINTS =====

// Root endpoint - ANA SAYFA
app.get('/', (req, res) => {
  console.log('🏠 Ana sayfa endpoint çağrıldı');
  res.json({
    status: 'success',
    message: '🚀 Nefes Depo Backend Çalışıyor!',
    version: '1.0.0',
    database: mongoose.connection.readyState === 1 ? 'Bağlı ✅' : 'Bağlı Değil ❌',
    endpoints: {
      test: 'GET /api/test',
      quoteRequest: 'POST /api/quote-request',
      adminLogin: 'POST /api/admin/login',
      adminStats: 'GET /api/admin/stats',
      health: 'GET /health'
    },
    timestamp: new Date().toISOString()
  });
});

// Test endpoint
app.get('/api/test', (req, res) => {
  console.log('🔍 Test endpoint çağrıldı');
  res.json({ 
    status: 'success', 
    message: 'Nefes Depo Backend çalışıyor!',
    database: mongoose.connection.readyState === 1 ? 'Bağlı ✅' : 'Bağlı Değil ❌',
    timestamp: new Date().toISOString()
  });
});

// Form gönderimi
app.post('/api/quote-request', async (req, res) => {
  console.log('📝 Yeni teklif talebi alındı');
  console.log('Request body:', req.body);
  
  try {
    const { name, phone, email, service, from, to, message } = req.body;

    // Validasyon
    if (!name || !phone || !service || !from || !to) {
      return res.status(400).json({
        status: 'error',
        message: 'Zorunlu alanları doldurun!'
      });
    }

    // Telefon numarası kontrolü
    const phoneRegex = /^05\d{9}$/;
    const cleanPhone = phone.replace(/\s/g, '');
    if (!phoneRegex.test(cleanPhone)) {
      return res.status(400).json({
        status: 'error',
        message: 'Geçerli bir telefon numarası girin (05XX XXX XX XX)'
      });
    }

    // Teklif numarası oluştur
    const quoteNumber = `NF${Date.now().toString().slice(-8)}`;

    // Veritabanına kaydet
    const newQuote = new Quote({
      quoteNumber,
      name,
      phone: cleanPhone,
      email: email || null,
      service,
      from,
      to,
      message: message || null
    });

    await newQuote.save();
    console.log('✅ Teklif kaydedildi:', quoteNumber);

    // Email gönder (hata olsa bile devam et)
    try {
      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: email || phone,
        subject: `Nefes Depo - Teklif Talebiniz Alındı (${quoteNumber})`,
        html: `<h1>Merhaba ${name}</h1><p>Teklif numaranız: ${quoteNumber}</p>`
      });
      console.log('✅ Müşteri emaili gönderildi');
    } catch (emailError) {
      console.error('⚠️ Email hatası:', emailError.message);
    }

    res.json({
      status: 'success',
      message: 'Talebiniz başarıyla alındı!',
      quoteNumber: quoteNumber,
      estimatedResponse: '24 saat içinde'
    });

  } catch (error) {
    console.error('❌ Form hatası:', error);
    res.status(500).json({
      status: 'error',
      message: 'Bir hata oluştu. Lütfen tekrar deneyin.'
    });
  }
});

// ===== ADMIN ENDPOINTS =====

// Admin Login
app.post('/api/admin/login', (req, res) => {
  console.log('🔐 Admin login denemesi');
  
  const { password } = req.body;
  const adminPassword = process.env.ADMIN_PASSWORD || 'nefes2024';
  
  if (password === adminPassword) {
    console.log('✅ Admin girişi başarılı');
    res.json({
      status: 'success',
      message: 'Giriş başarılı',
      token: 'admin-authenticated'
    });
  } else {
    console.log('❌ Yanlış şifre');
    res.status(401).json({
      status: 'error',
      message: 'Yanlış şifre'
    });
  }
});

// Admin İstatistikler
app.get('/api/admin/stats', adminAuth, async (req, res) => {
  console.log('📊 İstatistikler istendi');
  
  try {
    const total = await Quote.countDocuments();
    const pending = await Quote.countDocuments({ status: 'pending' });
    const contacted = await Quote.countDocuments({ status: 'contacted' });
    const completed = await Quote.countDocuments({ status: 'completed' });
    
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const thisMonth = await Quote.countDocuments({
      createdAt: { $gte: startOfMonth }
    });

    res.json({
      status: 'success',
      stats: {
        total,
        pending,
        contacted,
        completed,
        thisMonth
      }
    });
  } catch (error) {
    console.error('❌ İstatistik hatası:', error);
    res.status(500).json({
      status: 'error',
      message: 'İstatistikler yüklenemedi'
    });
  }
});

// Admin Tüm Teklifleri Getir
app.get('/api/admin/quotes', adminAuth, async (req, res) => {
  console.log('📋 Teklifler istendi');
  
  try {
    const { status, search, limit = 100, skip = 0 } = req.query;
    
    let filter = {};
    
    if (status && status !== 'all') {
      filter.status = status;
    }
    
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
        { quoteNumber: { $regex: search, $options: 'i' } }
      ];
    }
    
    const quotes = await Quote.find(filter)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(skip));
    
    const total = await Quote.countDocuments(filter);
    
    console.log(`✅ ${quotes.length} teklif döndürüldü`);
    
    res.json({
      status: 'success',
      quotes,
      total,
      count: quotes.length
    });
  } catch (error) {
    console.error('❌ Teklif listeleme hatası:', error);
    res.status(500).json({
      status: 'error',
      message: 'Teklifler yüklenemedi'
    });
  }
});

// Admin Tek Teklif Getir
app.get('/api/admin/quotes/:id', adminAuth, async (req, res) => {
  console.log('📄 Tek teklif istendi:', req.params.id);
  
  try {
    const quote = await Quote.findById(req.params.id);
    
    if (!quote) {
      return res.status(404).json({
        status: 'error',
        message: 'Teklif bulunamadı'
      });
    }
    
    res.json({
      status: 'success',
      quote
    });
  } catch (error) {
    console.error('❌ Teklif getirme hatası:', error);
    res.status(500).json({
      status: 'error',
      message: 'Teklif yüklenemedi'
    });
  }
});

// Admin Teklif Durumu Güncelle
app.put('/api/admin/quotes/:id', adminAuth, async (req, res) => {
  console.log('✏️ Teklif güncelleme:', req.params.id);
  
  try {
    const { status } = req.body;
    
    const validStatuses = ['pending', 'contacted', 'quoted', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        status: 'error',
        message: 'Geçersiz durum'
      });
    }

    const quote = await Quote.findByIdAndUpdate(
      req.params.id,
      { status, updatedAt: new Date() },
      { new: true }
    );

    if (!quote) {
      return res.status(404).json({
        status: 'error',
        message: 'Teklif bulunamadı'
      });
    }

    console.log('✅ Durum güncellendi:', status);

    res.json({
      status: 'success',
      message: 'Durum güncellendi',
      quote
    });
  } catch (error) {
    console.error('❌ Güncelleme hatası:', error);
    res.status(500).json({
      status: 'error',
      message: 'Durum güncellenemedi'
    });
  }
});

// Sağlık kontrolü
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use((req, res) => {
  console.log('❌ 404:', req.method, req.path);
  res.status(404).json({
    status: 'error',
    message: 'Endpoint bulunamadı',
    path: req.path
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('❌ Sunucu hatası:', err.stack);
  res.status(500).json({
    status: 'error',
    message: 'Sunucu hatası'
  });
});

// SERVER BAŞLAT
app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════╗
║   🚀 NEFES DEPO BACKEND BAŞLATILDI    ║
╠═══════════════════════════════════════╣
║  📍 Port: ${PORT}                        
║  🌐 URL: http://localhost:${PORT}       
║  📧 Email: ${process.env.EMAIL_USER || 'Yapılandırılmadı'}
║  💾 MongoDB: ${mongoose.connection.readyState === 1 ? 'Bağlı ✅' : 'Bağlanıyor... ⏳'}
║  🔐 Admin Şifre: ${process.env.ADMIN_PASSWORD || 'nefes2024'}
║  🌍 CORS: Tüm origin'lere açık ✅
╚═══════════════════════════════════════╝

🔗 Endpoint'ler:
   GET  /                    (Ana Sayfa)
   GET  /api/test
   POST /api/quote-request   ⭐ FORM GÖNDERİM
   POST /api/admin/login
   GET  /api/admin/stats
   GET  /api/admin/quotes
   GET  /api/admin/quotes/:id
   PUT  /api/admin/quotes/:id
   GET  /health

✨ Hazır!
  `);
  
  console.log('✅ Tüm endpoint\'ler yüklendi');
  console.log('✅ CORS ayarları: origin=* (tüm domain\'lere açık)');
});
