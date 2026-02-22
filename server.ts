import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import multer from "multer";

const db = new Database("database.sqlite");

// Initialize Database
db.exec(`
  CREATE TABLE IF NOT EXISTS bookings (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    mobile TEXT NOT NULL,
    village TEXT NOT NULL,
    service_type TEXT NOT NULL,
    service_details TEXT,
    document_url TEXT,
    preferred_date TEXT,
    preferred_time TEXT,
    status TEXT DEFAULT 'Pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_suspicious INTEGER DEFAULT 0
  )
`);

const app = express();
app.use(express.json());

// Setup file upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = "uploads";
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir);
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname));
  },
});
const upload = multer({ storage });

// API Routes
app.post("/api/bookings", upload.single("document"), (req, res) => {
  const { name, mobile, village, serviceType, serviceDetails, preferredDate, preferredTime } = req.body;
  const documentUrl = req.file ? `/uploads/${req.file.filename}` : null;
  const id = "DDS-" + Math.random().toString(36).substr(2, 9).toUpperCase();

  // Fraud Control: Check if same mobile number has > 3 bookings
  const countStmt = db.prepare("SELECT COUNT(*) as count FROM bookings WHERE mobile = ?");
  const { count } = countStmt.get(mobile) as { count: number };
  
  const isSuspicious = count >= 3 ? 1 : 0;

  try {
    const insertStmt = db.prepare(`
      INSERT INTO bookings (id, name, mobile, village, service_type, service_details, document_url, preferred_date, preferred_time, is_suspicious)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertStmt.run(id, name, mobile, village, serviceType, serviceDetails, documentUrl, preferredDate, preferredTime, isSuspicious);
    
    res.json({ success: true, requestId: id, isSuspicious });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to create booking" });
  }
});

app.get("/api/admin/bookings", (req, res) => {
  try {
    const bookings = db.prepare("SELECT * FROM bookings ORDER BY created_at DESC").all();
    res.json(bookings);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch bookings" });
  }
});

app.patch("/api/admin/bookings/:id", (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  try {
    const updateStmt = db.prepare("UPDATE bookings SET status = ? WHERE id = ?");
    updateStmt.run(status, id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to update status" });
  }
});

// Serve uploaded files
app.use("/uploads", express.static("uploads"));

async function startServer() {
  const PORT = 3000;

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
