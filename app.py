"""
Supermarket Point of Sale (POS) - Backend Server
Robust full-stack POS engine supporting MySQL (Production) and SQLite (Offline Fallback)
with atomic transactions, barcode scanning, scale readings, and ESC/POS receipt generation.
"""

import os
import datetime
import uuid
import json
import sqlite3
from flask import Flask, jsonify, render_template, request

try:
    import mysql.connector
    from mysql.connector import Error as MySQLError
    MYSQL_AVAILABLE = True
except ImportError:
    MYSQL_AVAILABLE = False
    MySQLError = Exception

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

app = Flask(__name__, static_folder="static", template_folder="templates")

# ==========================================
# DATABASE CONFIGURATION & DUAL ENGINE
# ==========================================
DB_CONFIG = {
    "host": os.getenv("DB_HOST", "localhost"),
    "user": os.getenv("DB_USER", "root"),
    "password": os.getenv("DB_PASSWORD", ""),
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


@app.route("/dashboard")
def dashboard():
    """Serves the Store Manager Backoffice & KPIs Dashboard."""
    return render_template("dashboard.html", db_type=ACTIVE_DB_TYPE)


@app.route("/inventory")
def inventory():
    """Serves the Product Catalog & Stock Inventory Manager."""
    return render_template("inventory.html", db_type=ACTIVE_DB_TYPE)


@app.route("/reports")
def reports():
    """Serves the Sales Audit Log & Z-Report Till Reconciliation."""
    return render_template("reports.html", db_type=ACTIVE_DB_TYPE)


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
                "SELECT id, barcode, name, category, price, cost_price, stock_quantity, is_weighed, unit_of_measure "
                "FROM products WHERE barcode = %s",
                (barcode,)
            )
            product = cursor.fetchone()
            cursor.close()
        else:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT id, barcode, name, category, price, cost_price, stock_quantity, is_weighed, unit_of_measure "
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


@app.route("/api/products", methods=["GET", "POST"])
def manage_products():
    """List catalog or add new product."""
    conn, db_type = get_db()
    try:
        if request.method == "GET":
            q = request.args.get("q", "").strip()
            category = request.args.get("category", "").strip()

            if db_type == "MYSQL":
                cursor = conn.cursor(dictionary=True)
                if q:
                    cursor.execute(
                        "SELECT * FROM products WHERE barcode LIKE %s OR name LIKE %s ORDER BY name LIMIT 50",
                        (f"%{q}%", f"%{q}%")
                    )
                elif category:
                    cursor.execute("SELECT * FROM products WHERE category = %s ORDER BY name", (category,))
                else:
                    cursor.execute("SELECT * FROM products ORDER BY category, name")
                rows = cursor.fetchall()
                cursor.close()
                products = [dict(r) for r in rows]
            else:
                cursor = conn.cursor()
                if q:
                    cursor.execute(
                        "SELECT * FROM products WHERE barcode LIKE ? OR name LIKE ? ORDER BY name LIMIT 50",
                        (f"%{q}%", f"%{q}%")
                    )
                elif category:
                    cursor.execute("SELECT * FROM products WHERE category = ? ORDER BY name", (category,))
                else:
                    cursor.execute("SELECT * FROM products ORDER BY category, name")
                products = [dict(r) for r in cursor.fetchall()]

            for p in products:
                p["price"] = float(p["price"])
                p["stock_quantity"] = float(p["stock_quantity"])
                p["cost_price"] = float(p.get("cost_price", 0.0))
                p["is_weighed"] = bool(p["is_weighed"])

            return jsonify({"success": True, "count": len(products), "products": products})

        elif request.method == "POST":
            data = request.json or {}
            barcode = data.get("barcode", "").strip()
            name = data.get("name", "").strip()
            category = data.get("category", "General").strip()
            price = float(data.get("price", 0.0))
            cost_price = float(data.get("cost_price", 0.0))
            stock = float(data.get("stock_quantity", 0.0))
            is_weighed = bool(data.get("is_weighed", False))
            unit = data.get("unit_of_measure", "kg" if is_weighed else "unit")

            if not barcode or not name or price <= 0:
                return jsonify({"success": False, "message": "Barcode, name, and valid price are required"}), 400

            if db_type == "MYSQL":
                cursor = conn.cursor()
                cursor.execute(
                    "INSERT INTO products (barcode, name, category, price, cost_price, stock_quantity, is_weighed, unit_of_measure) "
                    "VALUES (%s, %s, %s, %s, %s, %s, %s, %s)",
                    (barcode, name, category, price, cost_price, stock, is_weighed, unit)
                )
                conn.commit()
                new_id = cursor.lastrowid
                cursor.close()
            else:
                cursor = conn.cursor()
                cursor.execute(
                    "INSERT INTO products (barcode, name, category, price, cost_price, stock_quantity, is_weighed, unit_of_measure) "
                    "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                    (barcode, name, category, price, cost_price, stock, int(is_weighed), unit)
                )
                conn.commit()
                new_id = cursor.lastrowid

            return jsonify({"success": True, "id": new_id, "message": "Product registered successfully"})
    finally:
        conn.close()


@app.route("/api/products/<int:id>", methods=["PUT", "DELETE"])
def update_or_delete_product(id):
    conn, db_type = get_db()
    try:
        if request.method == "DELETE":
            if db_type == "MYSQL":
                cursor = conn.cursor()
                cursor.execute("DELETE FROM products WHERE id = %s", (id,))
                conn.commit()
                cursor.close()
            else:
                conn.execute("DELETE FROM products WHERE id = ?", (id,))
                conn.commit()
            return jsonify({"success": True, "message": "Product removed"})

        elif request.method == "PUT":
            data = request.json or {}
            fields = []
            values = []

            for key in ["name", "category", "price", "cost_price", "stock_quantity", "is_weighed", "unit_of_measure"]:
                if key in data:
                    fields.append(f"{key} = %s" if db_type == "MYSQL" else f"{key} = ?")
                    val = data[key]
                    if key in ("price", "cost_price", "stock_quantity"):
                        val = float(val)
                    elif key == "is_weighed":
                        val = bool(val) if db_type == "MYSQL" else int(bool(val))
                    values.append(val)

            if not fields:
                return jsonify({"success": False, "message": "No fields provided"}), 400

            values.append(id)
            sql = f"UPDATE products SET {', '.join(fields)} WHERE id = {'%s' if db_type == 'MYSQL' else '?'}"

            if db_type == "MYSQL":
                cursor = conn.cursor()
                cursor.execute(sql, tuple(values))
                conn.commit()
                cursor.close()
            else:
                conn.execute(sql, tuple(values))
                conn.commit()

            return jsonify({"success": True, "message": "Product updated successfully"})
    finally:
        conn.close()


@app.route("/api/checkout", methods=["POST"])
def checkout():
    """
    Atomic Checkout Transaction.
    Row-level locking with FOR UPDATE prevents inventory corruption.
    """
    data = request.json or {}
    cart = data.get("cart", [])
    payment_method = data.get("payment_method", "CASH").upper()
    amount_tendered = float(data.get("amount_tendered", 0))
    discount = float(data.get("discount", 0.0))
    cashier_name = data.get("cashier_name", "Lane 01 Cashier")
    terminal_id = data.get("terminal_id", "LANE-01")

    if not cart:
        return jsonify({"success": False, "message": "Transaction aborted: Cart is empty"}), 400

    conn, db_type = get_db()

    try:
        subtotal = round(sum(float(item["price"]) * float(item["quantity"]) for item in cart), 2)
        taxable = max(0.0, subtotal - discount)
        tax = round(taxable * 0.08, 2)  # Standard 8% tax
        total = round(taxable + tax, 2)

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

            cursor.execute(
                """
                INSERT INTO sales (receipt_number, terminal_id, cashier_name, subtotal, tax, discount, total, 
                                   payment_method, amount_tendered, change_due, is_synced)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, TRUE)
                """,
                (receipt_no, terminal_id, cashier_name, subtotal, tax, discount, total, payment_method, amount_tendered, change_due)
            )
            sale_id = cursor.lastrowid

            for item in cart:
                p_id = int(item["id"])
                qty = float(item["quantity"])
                unit_price = float(item["price"])
                item_total = round(qty * unit_price, 2)

                cursor.execute("SELECT stock_quantity, name, barcode FROM products WHERE id = %s FOR UPDATE", (p_id,))
                prod = cursor.fetchone()

                if not prod:
                    raise Exception(f"Product ID {p_id} no longer exists")

                if float(prod["stock_quantity"]) < qty:
                    raise Exception(f"Insufficient stock for '{prod['name']}'. Available: {prod['stock_quantity']}, Requested: {qty}")

                cursor.execute("UPDATE products SET stock_quantity = stock_quantity - %s WHERE id = %s", (qty, p_id))

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
            conn.execute("BEGIN IMMEDIATE")
            cursor = conn.cursor()

            cursor.execute(
                """
                INSERT INTO sales (receipt_number, terminal_id, cashier_name, subtotal, tax, discount, total, 
                                   payment_method, amount_tendered, change_due, is_synced)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
                """,
                (receipt_no, terminal_id, cashier_name, subtotal, tax, discount, total, payment_method, amount_tendered, change_due)
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

                cursor.execute("UPDATE products SET stock_quantity = stock_quantity - ? WHERE id = ?", (qty, p_id))

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
            "discount": discount,
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


# -----------------------------------------------------------
# HOLD & RECALL CART (LAYAWAY)
# -----------------------------------------------------------

@app.route("/api/hold", methods=["POST"])
def hold_cart():
    data = request.json or {}
    cart = data.get("cart", [])
    note = data.get("note", "Suspended Cart").strip()

    if not cart:
        return jsonify({"success": False, "message": "Cart is empty"}), 400

    ref = f"HOLD-{uuid.uuid4().hex[:6].upper()}"
    subtotal = sum(float(i["price"]) * float(i["quantity"]) for i in cart)
    cart_json = json.dumps(cart)

    conn, db_type = get_db()
    try:
        if db_type == "MYSQL":
            cursor = conn.cursor()
            cursor.execute(
                "INSERT INTO held_carts (hold_reference, customer_note, cart_json, item_count, subtotal) VALUES (%s, %s, %s, %s, %s)",
                (ref, note, cart_json, len(cart), subtotal)
            )
            conn.commit()
            cursor.close()
        else:
            conn.execute(
                "INSERT INTO held_carts (hold_reference, customer_note, cart_json, item_count, subtotal) VALUES (?, ?, ?, ?, ?)",
                (ref, note, cart_json, len(cart), subtotal)
            )
            conn.commit()

        return jsonify({"success": True, "hold_reference": ref, "message": "Cart parked successfully"})
    finally:
        conn.close()


@app.route("/api/held-carts", methods=["GET"])
def get_held_carts():
    conn, db_type = get_db()
    try:
        if db_type == "MYSQL":
            cursor = conn.cursor(dictionary=True)
            cursor.execute("SELECT id, hold_reference, customer_note, item_count, subtotal, created_at FROM held_carts ORDER BY id DESC")
            held = cursor.fetchall()
            cursor.close()
        else:
            cursor = conn.cursor()
            cursor.execute("SELECT id, hold_reference, customer_note, item_count, subtotal, created_at FROM held_carts ORDER BY id DESC")
            held = [dict(r) for r in cursor.fetchall()]

        for h in held:
            h["subtotal"] = float(h["subtotal"])

        return jsonify({"success": True, "held_carts": held})
    finally:
        conn.close()


@app.route("/api/recall/<int:id>", methods=["POST"])
def recall_cart(id):
    conn, db_type = get_db()
    try:
        if db_type == "MYSQL":
            cursor = conn.cursor(dictionary=True)
            cursor.execute("SELECT * FROM held_carts WHERE id = %s", (id,))
            held = cursor.fetchone()
            if held:
                cursor.execute("DELETE FROM held_carts WHERE id = %s", (id,))
                conn.commit()
            cursor.close()
        else:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM held_carts WHERE id = ?", (id,))
            row = cursor.fetchone()
            held = dict(row) if row else None
            if held:
                conn.execute("DELETE FROM held_carts WHERE id = ?", (id,))
                conn.commit()

        if held:
            cart_data = json.loads(held["cart_json"])
            return jsonify({"success": True, "cart": cart_data, "reference": held["hold_reference"]})
        return jsonify({"success": False, "message": "Held cart not found"}), 404
    finally:
        conn.close()


# -----------------------------------------------------------
# STATS, REPORTS & Z-REPORTS
# -----------------------------------------------------------

@app.route("/api/stats", methods=["GET"])
def get_stats():
    today = datetime.datetime.now().strftime("%Y-%m-%d")
    conn, db_type = get_db()
    try:
        if db_type == "MYSQL":
            cursor = conn.cursor(dictionary=True)
            cursor.execute(
                "SELECT COUNT(*) as total_orders, COALESCE(SUM(total), 0) as gross_revenue, "
                "COALESCE(SUM(tax), 0) as tax_collected, COALESCE(AVG(total), 0) as avg_basket "
                "FROM sales WHERE DATE(created_at) = %s",
                (today,)
            )
            today_stats = cursor.fetchone()

            cursor.execute("SELECT COUNT(*) as low_count FROM products WHERE stock_quantity <= min_stock_alert")
            low_count = cursor.fetchone()["low_count"]

            cursor.execute("SELECT COUNT(*) as total_skus, COALESCE(SUM(stock_quantity * cost_price), 0) as asset_value FROM products")
            inv_stats = cursor.fetchone()

            cursor.execute(
                "SELECT product_name, SUM(quantity) as units_sold, SUM(total_price) as revenue "
                "FROM sale_items GROUP BY product_name ORDER BY units_sold DESC LIMIT 5"
            )
            top_prods = cursor.fetchall()
            cursor.close()
        else:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT COUNT(*) as total_orders, COALESCE(SUM(total), 0) as gross_revenue, "
                "COALESCE(SUM(tax), 0) as tax_collected, COALESCE(AVG(total), 0) as avg_basket "
                "FROM sales WHERE DATE(created_at) = ?",
                (today,)
            )
            today_stats = dict(cursor.fetchone())

            cursor.execute("SELECT COUNT(*) as low_count FROM products WHERE stock_quantity <= 10.0")
            low_count = cursor.fetchone()[0]

            cursor.execute("SELECT COUNT(*) as total_skus, COALESCE(SUM(stock_quantity * cost_price), 0) as asset_value FROM products")
            r = cursor.fetchone()
            inv_stats = {"total_skus": r[0], "asset_value": r[1]}

            cursor.execute(
                "SELECT product_name, SUM(quantity) as units_sold, SUM(total_price) as revenue "
                "FROM sale_items GROUP BY product_name ORDER BY units_sold DESC LIMIT 5"
            )
            top_prods = [dict(p) for p in cursor.fetchall()]

        return jsonify({
            "success": True,
            "today": {
                "gross_revenue": round(float(today_stats["gross_revenue"]), 2),
                "total_orders": int(today_stats["total_orders"]),
                "avg_basket": round(float(today_stats["avg_basket"]), 2),
                "tax_collected": round(float(today_stats["tax_collected"]), 2),
            },
            "inventory": {
                "low_stock_count": int(low_count),
                "total_skus": int(inv_stats["total_skus"]),
                "asset_value": round(float(inv_stats["asset_value"]), 2),
            },
            "top_products": top_prods
        })
    finally:
        conn.close()


@app.route("/api/reports/sales", methods=["GET"])
def sales_report():
    limit = int(request.args.get("limit", 50))
    conn, db_type = get_db()
    try:
        if db_type == "MYSQL":
            cursor = conn.cursor(dictionary=True)
            cursor.execute("SELECT * FROM sales ORDER BY id DESC LIMIT %s", (limit,))
            sales = cursor.fetchall()
            cursor.close()
        else:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM sales ORDER BY id DESC LIMIT ?", (limit,))
            sales = [dict(r) for r in cursor.fetchall()]

        for s in sales:
            s["subtotal"] = float(s["subtotal"])
            s["tax"] = float(s["tax"])
            s["total"] = float(s["total"])
            s["amount_tendered"] = float(s["amount_tendered"])
            s["change_due"] = float(s["change_due"])

        return jsonify({"success": True, "sales": sales})
    finally:
        conn.close()


@app.route("/api/reports/z-report", methods=["GET"])
def z_report():
    today = datetime.datetime.now().strftime("%Y-%m-%d")
    conn, db_type = get_db()
    try:
        if db_type == "MYSQL":
            cursor = conn.cursor(dictionary=True)
            cursor.execute("SELECT payment_method, COUNT(*) as tx_count, SUM(total) as method_total FROM sales WHERE DATE(created_at) = %s GROUP BY payment_method", (today,))
            by_method = cursor.fetchall()

            cursor.execute("SELECT COUNT(*) as tx_total, COALESCE(SUM(subtotal), 0) as subtotal, COALESCE(SUM(tax), 0) as tax, COALESCE(SUM(discount), 0) as discount, COALESCE(SUM(total), 0) as grand_total FROM sales WHERE DATE(created_at) = %s", (today,))
            totals = cursor.fetchone()
            cursor.close()
        else:
            cursor = conn.cursor()
            cursor.execute("SELECT payment_method, COUNT(*) as tx_count, SUM(total) as method_total FROM sales WHERE DATE(created_at) = ? GROUP BY payment_method", (today,))
            by_method = [dict(r) for r in cursor.fetchall()]

            cursor.execute("SELECT COUNT(*) as tx_total, COALESCE(SUM(subtotal), 0) as subtotal, COALESCE(SUM(tax), 0) as tax, COALESCE(SUM(discount), 0) as discount, COALESCE(SUM(total), 0) as grand_total FROM sales WHERE DATE(created_at) = ?", (today,))
            totals = dict(cursor.fetchone())

        cash_sales = 0.0
        for m in by_method:
            m["method_total"] = float(m["method_total"])
            if m["payment_method"] == "CASH":
                cash_sales = float(m["method_total"])

        opening_float = 100.00
        expected_cash = opening_float + cash_sales

        return jsonify({
            "success": True,
            "report_date": today,
            "terminal_id": "LANE-01",
            "opening_float": opening_float,
            "cash_sales": cash_sales,
            "expected_cash": expected_cash,
            "payment_breakdown": by_method,
            "summary": {k: float(v) for k, v in totals.items()}
        })
    finally:
        conn.close()


@app.route("/api/receipt/<receipt_number>", methods=["GET"])
def get_receipt(receipt_number):
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
    simulated_weight = round(float(request.args.get("mock_weight", "1.450")), 3)
    return jsonify({
        "success": True,
        "weight": simulated_weight,
        "unit": "kg",
        "stable": True,
        "tare": 0.000
    })


@app.route("/api/hardware/drawer", methods=["POST"])
def kick_drawer():
    return jsonify({"success": True, "message": "Cash drawer pulse triggered (ESC p 0 25 250)"})


if __name__ == "__main__":
    port = int(os.getenv("PORT", 5000))
    print(f"[*] Starting Supermarket POS server on http://127.0.0.1:{port}")
    app.run(host="0.0.0.0", port=port, debug=True)
