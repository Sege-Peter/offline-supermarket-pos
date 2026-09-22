-- ==========================================================
-- SUPERMARKET POS SQLITE SCHEMA (Offline Local Database)
-- ==========================================================

CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    barcode TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    category TEXT,
    price REAL NOT NULL,
    cost_price REAL NOT NULL,
    stock_quantity REAL NOT NULL DEFAULT 0.0,
    is_weighed INTEGER DEFAULT 0,
    unit_of_measure TEXT DEFAULT 'unit',
    tax_rate REAL DEFAULT 8.0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    receipt_number TEXT UNIQUE NOT NULL,
    terminal_id TEXT DEFAULT 'LANE-01',
    cashier_name TEXT NOT NULL,
    subtotal REAL NOT NULL,
    tax REAL NOT NULL,
    discount REAL DEFAULT 0.0,
    total REAL NOT NULL,
    payment_method TEXT NOT NULL,
    amount_tendered REAL NOT NULL,
    change_due REAL NOT NULL,
    is_synced INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sale_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sale_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    barcode TEXT NOT NULL,
    product_name TEXT NOT NULL,
    quantity REAL NOT NULL,
    unit_price REAL NOT NULL,
    total_price REAL NOT NULL,
    is_weighed INTEGER DEFAULT 0,
    FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE TABLE IF NOT EXISTS offline_sync_batches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    batch_id TEXT UNIQUE NOT NULL,
    terminal_id TEXT NOT NULL,
    transaction_count INTEGER NOT NULL,
    synced_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Seed Baseline Data if not already present
INSERT OR IGNORE INTO products (barcode, name, category, price, cost_price, stock_quantity, is_weighed, unit_of_measure) VALUES
('011110417001', 'Whole Milk 1L', 'Dairy & Eggs', 1.50, 1.10, 120.0, 0, 'unit'),
('041520000102', 'White Bread Loaf', 'Bakery', 2.20, 1.40, 45.0, 0, 'unit'),
('4011', 'Fresh Bananas (kg)', 'Produce', 1.80, 0.90, 85.5, 1, 'kg'),
('078742351864', 'Basmati Rice 2kg', 'Grains & Pasta', 5.50, 3.80, 60.0, 0, 'unit'),
('4065', 'Green Bell Peppers (kg)', 'Produce', 3.20, 1.90, 40.25, 1, 'kg'),
('049000028904', 'Coca-Cola Can 330ml', 'Beverages', 1.25, 0.75, 200.0, 0, 'unit'),
('021130004928', 'Fresh Chicken Breast (kg)', 'Meat & Poultry', 7.90, 5.20, 35.8, 1, 'kg'),
('011110824106', 'Large Brown Eggs (12-pack)', 'Dairy & Eggs', 3.40, 2.30, 80.0, 0, 'unit'),
('028400040112', 'Classic Potato Chips 150g', 'Snacks', 2.10, 1.30, 95.0, 0, 'unit'),
('4131', 'Fuji Apples (kg)', 'Produce', 2.90, 1.60, 55.0, 1, 'kg');
