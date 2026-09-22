-- ==========================================================
-- SUPERMARKET POINT OF SALE (POS) DATABASE SCHEMA (MySQL)
-- High-Volume Retail with Atomic Transactions & Inventory
-- ==========================================================

CREATE DATABASE IF NOT EXISTS supermarket_pos CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE supermarket_pos;

-- 1. Product Categories
CREATE TABLE IF NOT EXISTS categories (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE,
    description VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 2. Products / Inventory Table
-- Supports both packaged unit goods (by barcode) and weighed loose produce (by kg/PLU)
CREATE TABLE IF NOT EXISTS products (
    id INT AUTO_INCREMENT PRIMARY KEY,
    barcode VARCHAR(64) UNIQUE NOT NULL,
    name VARCHAR(150) NOT NULL,
    category_id INT,
    category VARCHAR(50),
    price DECIMAL(10, 2) NOT NULL,
    cost_price DECIMAL(10, 2) NOT NULL,
    stock_quantity DECIMAL(10, 3) NOT NULL DEFAULT 0.000,
    is_weighed BOOLEAN DEFAULT FALSE, -- TRUE for produce/deli (kg), FALSE for units
    unit_of_measure VARCHAR(10) DEFAULT 'unit', -- 'unit', 'kg', 'lb', 'g'
    tax_rate DECIMAL(5, 2) DEFAULT 8.00, -- 8.00% standard retail sales tax
    min_stock_alert DECIMAL(10, 3) DEFAULT 10.000,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_barcode (barcode),
    INDEX idx_category (category)
) ENGINE=InnoDB;

-- 3. Cashier & Terminal Sessions
CREATE TABLE IF NOT EXISTS cashiers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    pin_hash VARCHAR(255) NOT NULL,
    role ENUM('CASHIER', 'HEAD_CASHIER', 'MANAGER') DEFAULT 'CASHIER',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 4. Sales Master Table (Header Record)
CREATE TABLE IF NOT EXISTS sales (
    id INT AUTO_INCREMENT PRIMARY KEY,
    receipt_number VARCHAR(64) UNIQUE NOT NULL,
    terminal_id VARCHAR(32) DEFAULT 'LANE-01',
    cashier_name VARCHAR(100) NOT NULL,
    subtotal DECIMAL(10, 2) NOT NULL,
    tax DECIMAL(10, 2) NOT NULL,
    discount DECIMAL(10, 2) DEFAULT 0.00,
    total DECIMAL(10, 2) NOT NULL,
    payment_method ENUM('CASH', 'CARD', 'MOBILE_MONEY', 'SPLIT') NOT NULL,
    amount_tendered DECIMAL(10, 2) NOT NULL,
    change_due DECIMAL(10, 2) NOT NULL,
    is_synced BOOLEAN DEFAULT TRUE, -- Flag for offline lane syncing
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_receipt (receipt_number),
    INDEX idx_created (created_at)
) ENGINE=InnoDB;

-- 5. Sale Line Items (Transaction Details)
CREATE TABLE IF NOT EXISTS sale_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    sale_id INT NOT NULL,
    product_id INT NOT NULL,
    barcode VARCHAR(64) NOT NULL,
    product_name VARCHAR(150) NOT NULL,
    quantity DECIMAL(10, 3) NOT NULL,
    unit_price DECIMAL(10, 2) NOT NULL,
    total_price DECIMAL(10, 2) NOT NULL,
    is_weighed BOOLEAN DEFAULT FALSE,
    FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id),
    INDEX idx_sale_id (sale_id),
    INDEX idx_product_id (product_id)
) ENGINE=InnoDB;

-- 6. Offline Sync Batch Audit Log
CREATE TABLE IF NOT EXISTS offline_sync_batches (
    id INT AUTO_INCREMENT PRIMARY KEY,
    batch_id VARCHAR(64) UNIQUE NOT NULL,
    terminal_id VARCHAR(32) NOT NULL,
    transaction_count INT NOT NULL,
    synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ==========================================================
-- Baseline Supermarket Seed Data
-- Packaged Goods (1D Barcodes) & Weighed Produce (PLU Codes)
-- ==========================================================

INSERT INTO categories (name, description) VALUES
('Dairy & Eggs', 'Milk, butter, cheeses, and eggs'),
('Bakery', 'Freshly baked bread, rolls, and pastries'),
('Produce', 'Fresh fruits and weighed vegetables'),
('Grains & Pasta', 'Rice, pasta, flour, and cereals'),
('Beverages', 'Juices, soda, and mineral water'),
('Meat & Poultry', 'Fresh and butchered meats');

INSERT INTO products (barcode, name, category, price, cost_price, stock_quantity, is_weighed, unit_of_measure) VALUES
('011110417001', 'Whole Milk 1L', 'Dairy & Eggs', 1.50, 1.10, 120.000, FALSE, 'unit'),
('041520000102', 'White Bread Loaf', 'Bakery', 2.20, 1.40, 45.000, FALSE, 'unit'),
('4011', 'Fresh Bananas (kg)', 'Produce', 1.80, 0.90, 85.500, TRUE, 'kg'),
('078742351864', 'Basmati Rice 2kg', 'Grains & Pasta', 5.50, 3.80, 60.000, FALSE, 'unit'),
('4065', 'Green Bell Peppers (kg)', 'Produce', 3.20, 1.90, 40.250, TRUE, 'kg'),
('049000028904', 'Coca-Cola Can 330ml', 'Beverages', 1.25, 0.75, 200.000, FALSE, 'unit'),
('021130004928', 'Fresh Chicken Breast (kg)', 'Meat & Poultry', 7.90, 5.20, 35.800, TRUE, 'kg'),
('011110824106', 'Large Brown Eggs (12-pack)', 'Dairy & Eggs', 3.40, 2.30, 80.000, FALSE, 'unit'),
('028400040112', 'Classic Potato Chips 150g', 'Snacks', 2.10, 1.30, 95.000, FALSE, 'unit'),
('4131', 'Fuji Apples (kg)', 'Produce', 2.90, 1.60, 55.000, TRUE, 'kg');
