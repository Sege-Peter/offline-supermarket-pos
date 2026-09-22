# 🛒 Offline-First Supermarket POS System

[![Python](https://img.shields.io/badge/Python-3.10%2B-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://python.org)
[![Flask](https://img.shields.io/badge/Flask-3.0%2B-black?style=for-the-badge&logo=flask&logoColor=white)](https://flask.palletsprojects.com/)
[![MySQL](https://img.shields.io/badge/MySQL-8.0-4479A1?style=for-the-badge&logo=mysql&logoColor=white)](https://www.mysql.com/)
[![SQLite](https://img.shields.io/badge/SQLite-Offline%20Engine-003B57?style=for-the-badge&logo=sqlite&logoColor=white)](https://sqlite.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-purple.svg?style=for-the-badge)](LICENSE)

A clean, robust, and full-stack **Supermarket Point of Sale (POS)** engineered for high-volume retail environments. It provides **sub-second barcode lookups**, **atomic database transactions with row-level locking** (preventing inventory corruption), **keyboard-first cash register ergonomics**, **smartphone camera barcode scanning**, and **80mm ESC/POS thermal receipt printing**.

---

## 🌐 Live Interactive POS Terminal (Web Demo)

Test the complete interactive terminal directly in your browser with pre-seeded inventory, camera scanning, Web Audio cashier beeps, and receipt printing:

🔗 **[https://sege-peter.github.io/offline-supermarket-pos/](https://sege-peter.github.io/offline-supermarket-pos/)**

---

## 🏛️ System Architecture

Unlike standard boutique retail, supermarket checkout lanes require high throughput ($<200\text{ ms}$ barcode lookups), weighed produce calculations, and offline resilience during network outages.

```text
                    ┌────────────────────────────┐
                    │     POS Terminal (Lane 01) │
                    │  (Touchscreen + Cashier UI)│
                    └──────────────┬─────────────┘
                                   │
      ┌──────────────┬─────────────┼──────────────┬──────────────┐
      ▼              ▼             ▼              ▼              ▼
┌───────────┐  ┌───────────┐  ┌──────────┐  ┌───────────┐  ┌───────────┐
│Bi-Optic   │  │Integrated │  │Thermal   │  │EMV / NFC  │  │Customer   │
│Scale/     │  │Cash       │  │Receipt   │  │Payment    │  │Display    │
│Scanner    │  │Drawer     │  │Printer   │  │Terminal   │  │(2nd Screen│
└───────────┘  └───────────┘  └──────────┘  └───────────┘  └───────────┘
```

### Hybrid On-Premises + Cloud Edge Topology

```text
[ Lane 01 Terminal ]         [ Lane 02 Terminal ]        [ Mobile PDA Scanner ]
  • Local SQLite Buffer        • Local SQLite Buffer       • Camera Scanner (html5-qrcode)
  • USB/HID Barcode Scanner    • USB/HID Barcode Scanner   • Synthesized Cashier Beep
         │                            │                            │
         └───────────────────┬────────┴────────────────────────────┘
                             ▼ (Local Store LAN)
               [ In-Store Edge Server / Controller ]
               • Python (Flask) POS API Backend
               • MySQL 8.0 InnoDB Master Database
               • SELECT ... FOR UPDATE (Row Locking)
                             │
                             ▼ (Batched HTTPS Sync)
               [ Central Cloud / Enterprise ERP ]
               • Multi-Store Sales Consolidation & Inventory
```

---

## ⚡ Database Schema & Atomic Transactions

Supermarket checkouts require tracking **unit products** (packaged goods with 1D barcodes) alongside **loose produce** (sold by gross weight minus tare weight):

```sql
-- schema.sql (Products Table)
CREATE TABLE products (
    id INT AUTO_INCREMENT PRIMARY KEY,
    barcode VARCHAR(64) UNIQUE NOT NULL,
    name VARCHAR(150) NOT NULL,
    category VARCHAR(50),
    price DECIMAL(10, 2) NOT NULL,
    cost_price DECIMAL(10, 2) NOT NULL,
    stock_quantity DECIMAL(10, 3) NOT NULL DEFAULT 0.000,
    is_weighed BOOLEAN DEFAULT FALSE, -- TRUE for produce/deli (kg), FALSE for units
    unit_of_measure VARCHAR(10) DEFAULT 'unit',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### The Atomic Transaction Guarantee (`FOR UPDATE`)

To prevent race conditions where multiple cashier lanes attempt to sell the final items of inventory simultaneously, the checkout endpoint uses **pessimistic row locking** inside an atomic transaction:

```python
# app.py (Checkout Logic)
conn.start_transaction()

# Lock stock rows during checkout to prevent overselling
cursor.execute(
    "SELECT stock_quantity, name FROM products WHERE id = %s FOR UPDATE",
    (product_id,)
)
prod = cursor.fetchone()

if prod["stock_quantity"] < requested_qty:
    raise Exception(f"Insufficient stock for {prod['name']}")

# Decrement inventory
cursor.execute(
    "UPDATE products SET stock_quantity = stock_quantity - %s WHERE id = %s",
    (requested_qty, product_id)
)

conn.commit()
```

If an error or power disruption occurs mid-transaction, `conn.rollback()` executes, guaranteeing that inventory counts and sales records never corrupt.

---

## ⌨️ Desktop Keyboard-First Register

Designed for maximum cashier speed without requiring mouse interactions:

| Shortcut | Function | Description |
| :--- | :--- | :--- |
| **`Enter`** | **Scan / Add** | Any USB/Bluetooth barcode scanner emulates an HID keyboard and presses `Enter` automatically. |
| **`F12`** | **Pay & Print** | Approves the transaction, records the sale, and kicks off the thermal receipt print modal. |
| **`F8`** | **Weighed Item** | Opens the Produce PLU modal for loose fruits, vegetables, and deli meats. |
| **`F2`** | **Focus Barcode** | Instantly highlights the barcode input field from anywhere on the screen. |
| **`Esc`** | **Void / Dismiss** | Voids the active cart transaction or closes open modal windows. |

---

## 📱 Mobile Camera Barcode Scanner

For floor restocking, price checking, or mobile checkout lines, the system embeds `html5-qrcode` to scan 1D retail barcodes using a smartphone camera.

### Features
1. **1D Barcode Detection:** The scan box (`250x150px`) is shaped horizontally to instantly lock onto standard retail barcodes (UPC-A, EAN-13, Code-128).
2. **Scan Lock / Debouncing:** An active `isScanningLocked` state blocks rapid re-triggers for 1.5 seconds after a successful scan.
3. **Web Audio Cashier Beep:** Generates a real-time synthesized $1760\text{ Hz}$ sine wave tone (`Web Audio API`) to mimic authentic retail lane audio feedback.

### Connecting Your Phone to the Local Python Server
Because modern browsers enforce *Secure Contexts* for camera access, use one of the following methods to test over Wi-Fi:

* **Method 1: Secure Tunnel (Ngrok - Recommended)**
  ```bash
  ngrok http 5000
  ```
  Open the HTTPS URL on your smartphone browser. The camera will prompt for permission and work out of the box.

* **Method 2: Chrome Flags (Local IP)**
  1. Run Flask bound to all interfaces: `python app.py` (binds to `0.0.0.0:5000`).
  2. On mobile Chrome, open `chrome://flags/#unsafely-treat-insecure-origin-as-secure`.
  3. Enter `http://<YOUR_PC_IP>:5000` (e.g., `http://192.168.1.50:5000`), enable, and relaunch.

---

## 🖨️ Hardware Drivers & Peripheral Integrations

The repository includes standalone Python drivers in the `hardware/` directory:

1. **Digital Scale Integration (`hardware/scale_driver.py`):**
   * Uses `pyserial` over RS-232 COM ports.
   * Parses standard scale protocols (Mettler Toledo, CAS, Dibal, Avery Berkel).
   * Supports tare weight zeroing for containers.
2. **80mm ESC/POS Thermal Receipt Printer (`hardware/escpos_printer.py`):**
   * High-speed USB and Network socket printing via `python-escpos`.
   * **Cash Drawer Kick Pulse:** Sends `\x1b\x70\x00\x19\xfa` to automatically trigger the 24V solenoid till drawer.
   * **Paper Auto-Cut:** Sends standard ESC/POS full paper cut `\x1d\x56\x00`.

---

## 📂 Repository File Structure

```text
offline-supermarket-pos/
│
├── app.py                      # Flask backend (Dual MySQL / SQLite support)
├── schema.sql                  # MySQL InnoDB database schema & seed data
├── schema_sqlite.sql           # SQLite offline database schema
├── requirements.txt            # Python dependencies
│
├── hardware/                   # Physical Hardware Drivers
│   ├── scale_driver.py         # RS-232 Digital scale reader & tare module
│   └── escpos_printer.py       # 80mm ESC/POS thermal receipt & till kick
│
├── sync/                       # Offline-First Synchronization
│   └── offline_sync_worker.py  # Background sync daemon for offline lanes
│
├── templates/                  # Server-Rendered Jinja2 Templates
│   ├── pos.html                # Desktop keyboard-first cash register
│   └── mobile_pos.html         # Mobile camera barcode scanner terminal
│
├── static/                     # Web Assets & POS Engine
│   ├── css/style.css           # High-contrast retail theme & 80mm print CSS
│   └── js/pos-engine.js        # POS core, 1760Hz audio beep, cart engine
│
├── index.html                  # Standalone in-browser POS for GitHub Pages
├── LICENSE                     # MIT Open Source License
└── README.md                   # Master System Documentation
```

---

## 🚀 Getting Started

### 1. Clone the Repository
```bash
git clone https://github.com/Sege-Peter/offline-supermarket-pos.git
cd offline-supermarket-pos
```

### 2. Install Python Dependencies
```bash
pip install -r requirements.txt
```

### 3. Run with MySQL (Production Setup)
1. Import the schema into MySQL:
   ```bash
   mysql -u root -p < schema.sql
   ```
2. Configure credentials via environment variables or `.env`:
   ```bash
   export DB_HOST="localhost"
   export DB_USER="root"
   export DB_PASSWORD="your_password"
   export DB_NAME="supermarket_pos"
   ```
3. Start the server:
   ```bash
   python app.py
   ```

### 4. Run with SQLite (Zero-Config Offline Mode)
If MySQL is not installed, the server automatically initializes `pos_local.db` using `schema_sqlite.sql`:
```bash
python app.py
```
Open `http://127.0.0.1:5000` in your web browser.

---

## 📜 REST API Reference

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `GET /` | `GET` | Desktop keyboard-first register interface. |
| `GET /mobile` | `GET` | Mobile camera-based barcode scanning terminal. |
| `GET /api/product/<barcode>` | `GET` | Sub-second item lookup by barcode or PLU. |
| `GET /api/products` | `GET` | Search and filter catalog items (`?q=milk`). |
| `POST /api/checkout` | `POST` | Atomic transaction checkout with stock deduction. |
| `GET /api/receipt/<receipt_no>`| `GET` | Full receipt details and line items for printing. |
| `GET /api/hardware/scale` | `GET` | Reads current gross/net weight from scale. |
| `GET /api/health` | `GET` | System health and active database driver status. |

---

## 📜 License

Created by **Sege Peter ENG**. Distributed under the [MIT License](LICENSE).
