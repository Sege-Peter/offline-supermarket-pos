"""
Supermarket Point of Sale (POS) - Backend Server
Robust full-stack POS engine supporting MySQL (Production) and SQLite (Offline Fallback)
with atomic transactions, barcode scanning, scale readings, and ESC/POS receipt generation.
"""

import os
import datetime
import uuid
import sqlite3
from flask import Flask, jsonify, render_template, request, send_from_directory

try:
    import mysql.connector
    from mysql.connector import Error as MySQLError
    MYSQL_AVAILABLE = True
except ImportError:
    MYSQL_AVAILABLE = False
    MySQLError = Exception

app = Flask(__name__, static_folder="static", template_folder="templates")

# ==========================================
# DATABASE CONFIGURATION & DUAL ENGINE
# ==========================================
DB_CONFIG = {
    "host": os.getenv("DB_HOST", "localhost"),
    "user": os.getenv("DB_USER", "root"),
    "password": os.getenv("DB_PASSWORD", "rootpassword"),
    "database": os.getenv("DB_NAME", "supermarket_pos"),
    "port": int(os.getenv("DB_PORT", "3306")),
}

USE_SQLITE = os.getenv("USE_SQLITE", "false").lower() in ("true", "1", "yes")
SQLITE_DB_PATH = os.path.join(os.path.dirname(__file__), "pos_local.db")


def is_mysql_available():
    if not MYSQL_AVAILABLE or USE_SQLITE:
        return False
    try:
        conn = mysql.connector.connect(**DB_CONFIG, connection_timeout=2)
        conn.close()
        return True
    except Exception:
        return False


ACTIVE_DB_TYPE = "MYSQL" if is_mysql_available() else "SQLITE"
print(f"[*] Supermarket POS running with database engine: {ACTIVE_DB_TYPE}")


def get_db():
    """Returns a connection and driver type ('MYSQL' or 'SQLITE')."""
    if ACTIVE_DB_TYPE == "MYSQL":
        conn = mysql.connector.connect(**DB_CONFIG)
        return conn, "MYSQL"
    else:
        conn = sqlite3.connect(SQLITE_DB_PATH)
        conn.row_factory = sqlite3.Row
        return conn, "SQLITE"


def init_sqlite_if_needed():
    """Initializes local SQLite database with schema and seed data if not present."""
    if ACTIVE_DB_TYPE == "SQLITE" and not os.path.exists(SQLITE_DB_PATH):
        schema_path = os.path.join(os.path.dirname(__file__), "schema_sqlite.sql")
        if os.path.exists(schema_path):
            with open(schema_path, "r", encoding="utf-8") as f:
                sql = f.read()
            conn = sqlite3.connect(SQLITE_DB_PATH)
            conn.executescript(sql)
            conn.close()
            print("[✓] Initialized local SQLite offline database with seed catalog.")


init_sqlite_if_needed()

# ==========================================
# WEB & TERMINAL ROUTES
# ==========================================

@app.route("/")
def index():
    """Serves the Desktop Keyboard-First POS Register."""
    return render_template("pos.html", db_type=ACTIVE_DB_TYPE)


@app.route("/mobile")
def mobile_pos():
    """Serves the Mobile Camera-Based Barcode Scanner Terminal."""
    return render_template("mobile_pos.html", db_type=ACTIVE_DB_TYPE)


# ==========================================
# REST API ENDPOINTS
# ==========================================

@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({
        "status": "healthy",
        "database": ACTIVE_DB_TYPE,
        "terminal": "LANE-01",
        "timestamp": datetime.datetime.now().isoformat()
    })


@app.route("/api/product/<barcode>", methods=["GET"])
def get_product(barcode):
    """Sub-second product lookup by 1D Barcode or PLU code."""
    barcode = barcode.strip()
    conn, db_type = get_db()
    try:
        if db_type == "MYSQL":
            cursor = conn.cursor(dictionary=True)
            cursor.execute(
                "SELECT id, barcode, name, category, price, stock_quantity, is_weighed, unit_of_measure "
                "FROM products WHERE barcode = %s",
                (barcode,)
            )
            product = cursor.fetchone()
            cursor.close()
        else:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT id, barcode, name, category, price, stock_quantity, is_weighed, unit_of_measure "
                "FROM products WHERE barcode = ?",
                (barcode,)
            )
            row = cursor.fetchone()
            product = dict(row) if row else None

        if product:
            product["price"] = float(product["price"])
            product["stock_quantity"] = float(product["stock_quantity"])
            product["is_weighed"] = bool(product["is_weighed"])
            return jsonify({"success": True, "product": product})
        
        return jsonify({"success": False, "message": f"Barcode '{barcode}' not found in inventory"}), 404
    finally:
        conn.close()


@app.route("/api/products", methods=["GET"])
def list_products():
    """List catalog products with optional search query."""
    q = request.args.get("q", "").strip()
    conn, db_type = get_db()
    try:
        if db_type == "MYSQL":
            cursor = conn.cursor(dictionary=True)
            if q:
                cursor.execute(
                    "SELECT id, barcode, name, category, price, stock_quantity, is_weighed, unit_of_measure "
                    "FROM products WHERE barcode LIKE %s OR name LIKE %s LIMIT 50",
                    (f"%{q}%", f"%{q}%")
                )
            else:
                cursor.execute(
                    "SELECT id, barcode, name, category, price, stock_quantity, is_weighed, unit_of_measure "
                    "FROM products ORDER BY category, name LIMIT 100"
                )
            rows = cursor.fetchall()
            cursor.close()
            products = [dict(r) for r in rows]
        else:
            cursor = conn.cursor()
            if q:
                cursor.execute(
                    "SELECT id, barcode, name, category, price, stock_quantity, is_weighed, unit_of_measure "
                    "FROM products WHERE barcode LIKE ? OR name LIKE ? LIMIT 50",
                    (f"%{q}%", f"%{q}%")
                )
            else:
                cursor.execute(
                    "SELECT id, barcode, name, category, price, stock_quantity, is_weighed, unit_of_measure "
                    "FROM products ORDER BY category, name LIMIT 100"
                )
            products = [dict(r) for r in cursor.fetchall()]

        for p in products:
            p["price"] = float(p["price"])
            p["stock_quantity"] = float(p["stock_quantity"])
            p["is_weighed"] = bool(p["is_weighed"])

        return jsonify({"success": True, "count": len(products), "products": products})
    finally:
        conn.close()


@app.route("/api/checkout", methods=["POST"])
def checkout():
    """
    Atomic Checkout Transaction.
    Guarantees stock integrity using row locking (FOR UPDATE / BEGIN IMMEDIATE)
    and rolls back changes completely if any validation fails.
    """
    data = request.json or {}
    cart = data.get("cart", [])
    payment_method = data.get("payment_method", "CASH").upper()
    amount_tendered = float(data.get("amount_tendered", 0))
    cashier_name = data.get("cashier_name", "Lane 01 Cashier")
    terminal_id = data.get("terminal_id", "LANE-01")

    if not cart:
        return jsonify({"success": False, "message": "Transaction aborted: Cart is empty"}), 400

    conn, db_type = get_db()

    try:
        # Calculate totals
        subtotal = round(sum(float(item["price"]) * float(item["quantity"]) for item in cart), 2)
        tax = round(subtotal * 0.08, 2)  # Standard 8% tax
        total = round(subtotal + tax, 2)

        if payment_method == "CASH" and amount_tendered < total:
            return jsonify({
                "success": False,
                "message": f"Insufficient payment: Total is ${total:.2f}, Tendered is ${amount_tendered:.2f}"
            }), 400

        change_due = round(max(0.0, amount_tendered - total), 2) if payment_method == "CASH" else 0.00
        receipt_no = f"REC-{datetime.datetime.now().strftime('%Y%m%d%H%M')}-{uuid.uuid4().hex[:6].upper()}"

        if db_type == "MYSQL":
            conn.start_transaction()
            cursor = conn.cursor(dictionary=True)

            # 1. Insert Sales Header
            cursor.execute(
                """
                INSERT INTO sales (receipt_number, terminal_id, cashier_name, subtotal, tax, total, 
                                   payment_method, amount_tendered, change_due, is_synced)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, TRUE)
                """,
                (receipt_no, terminal_id, cashier_name, subtotal, tax, total, payment_method, amount_tendered, change_due)
            )
            sale_id = cursor.lastrowid

            # 2. Process Line Items with Row Locking
            for item in cart:
                p_id = int(item["id"])
                qty = float(item["quantity"])
                unit_price = float(item["price"])
                item_total = round(qty * unit_price, 2)

                # Lock row to prevent race-condition overselling
                cursor.execute("SELECT stock_quantity, name, barcode FROM products WHERE id = %s FOR UPDATE", (p_id,))
                prod = cursor.fetchone()

                if not prod:
                    raise Exception(f"Product ID {p_id} no longer exists in database")

                if float(prod["stock_quantity"]) < qty:
                    raise Exception(f"Insufficient stock for '{prod['name']}'. Available: {prod['stock_quantity']}, Requested: {qty}")

                # Deduct stock
                cursor.execute(
                    "UPDATE products SET stock_quantity = stock_quantity - %s WHERE id = %s",
                    (qty, p_id)
                )

                # Insert line item
                cursor.execute(
                    """
                    INSERT INTO sale_items (sale_id, product_id, barcode, product_name, quantity, unit_price, total_price, is_weighed)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    (sale_id, p_id, prod["barcode"], prod["name"], qty, unit_price, item_total, item.get("is_weighed", False))
                )

            conn.commit()
            cursor.close()

        else:
            # SQLite Atomic Transaction
            conn.execute("BEGIN IMMEDIATE")
            cursor = conn.cursor()

            cursor.execute(
                """
                INSERT INTO sales (receipt_number, terminal_id, cashier_name, subtotal, tax, total, 
                                   payment_method, amount_tendered, change_due, is_synced)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
                """,
                (receipt_no, terminal_id, cashier_name, subtotal, tax, total, payment_method, amount_tendered, change_due)
            )
            sale_id = cursor.lastrowid

            for item in cart:
                p_id = int(item["id"])
                qty = float(item["quantity"])
                unit_price = float(item["price"])
                item_total = round(qty * unit_price, 2)

                cursor.execute("SELECT stock_quantity, name, barcode FROM products WHERE id = ?", (p_id,))
                prod = cursor.fetchone()

                if not prod:
                    raise Exception(f"Product ID {p_id} does not exist")

                if float(prod["stock_quantity"]) < qty:
                    raise Exception(f"Insufficient stock for '{prod['name']}'. Available: {prod['stock_quantity']}, Requested: {qty}")

                cursor.execute(
                    "UPDATE products SET stock_quantity = stock_quantity - ? WHERE id = ?",
                    (qty, p_id)
                )

                cursor.execute(
                    """
                    INSERT INTO sale_items (sale_id, product_id, barcode, product_name, quantity, unit_price, total_price, is_weighed)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (sale_id, p_id, prod["barcode"], prod["name"], qty, unit_price, item_total, int(item.get("is_weighed", False)))
                )

            conn.commit()

        return jsonify({
            "success": True,
            "receipt_number": receipt_no,
            "subtotal": subtotal,
            "tax": tax,
            "total": total,
            "amount_tendered": amount_tendered,
            "change_due": change_due,
            "payment_method": payment_method,
            "timestamp": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        })

    except Exception as e:
        conn.rollback()
        return jsonify({"success": False, "message": str(e)}), 500
    finally:
        conn.close()


@app.route("/api/receipt/<receipt_number>", methods=["GET"])
def get_receipt(receipt_number):
    """Retrieve full sale data and line items for thermal receipt printing."""
    conn, db_type = get_db()
    try:
        if db_type == "MYSQL":
            cursor = conn.cursor(dictionary=True)
            cursor.execute("SELECT * FROM sales WHERE receipt_number = %s", (receipt_number,))
            sale = cursor.fetchone()
            if not sale:
                return jsonify({"success": False, "message": "Receipt not found"}), 404

            cursor.execute("SELECT * FROM sale_items WHERE sale_id = %s", (sale["id"],))
            items = cursor.fetchall()
            cursor.close()
        else:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM sales WHERE receipt_number = ?", (receipt_number,))
            sale_row = cursor.fetchone()
            if not sale_row:
                return jsonify({"success": False, "message": "Receipt not found"}), 404
            sale = dict(sale_row)

            cursor.execute("SELECT * FROM sale_items WHERE sale_id = ?", (sale["id"],))
            items = [dict(r) for r in cursor.fetchall()]

        return jsonify({
            "success": True,
            "sale": sale,
            "items": items,
            "store_info": {
                "name": "METRO FRESH SUPERMARKET",
                "address": "100 Retail Boulevard, Sector 4",
                "tax_id": "TAX-US-99201948",
                "footer": "Thank you for shopping local! Keep receipt for returns within 14 days."
            }
        })
    finally:
        conn.close()


@app.route("/api/hardware/scale", methods=["GET"])
def read_scale():
    """Mock/Hardware Scale interface returning gross weight and unit."""
    # In production, this queries hardware/scale_driver.py over RS-232
    simulated_weight = round(float(request.args.get("mock_weight", "1.450")), 3)
    return jsonify({
        "success": True,
        "weight": simulated_weight,
        "unit": "kg",
        "stable": True,
        "tare": 0.000
    })


if __name__ == "__main__":
    port = int(os.getenv("PORT", 5000))
    print(f"[*] Starting Supermarket POS server on http://127.0.0.1:{port}")
    app.run(host="0.0.0.0", port=port, debug=True)
