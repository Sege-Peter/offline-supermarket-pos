<?php
/**
 * Supermarket POS - Native PHP REST API Engine
 * Connects directly to local XAMPP MySQL (supermarket_pos)
 * Provides atomic transactions, sub-second barcode lookups,
 * cart parking, inventory management, and Z-Reports.
 */

header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");

if ($_SERVER["REQUEST_METHOD"] === "OPTIONS") {
    http_response_code(200);
    exit();
}

$db_host = getenv("DB_HOST") ?: "localhost";
$db_port = getenv("DB_PORT") ?: "3306";
$db_name = getenv("DB_NAME") ?: "supermarket_pos";
$db_user = getenv("DB_USER") ?: "root";
$db_pass = getenv("DB_PASSWORD") ?: "";

try {
    $dsn = "mysql:host={$db_host};port={$db_port};dbname={$db_name};charset=utf8mb4";
    $pdo = new PDO($dsn, $db_user, $db_pass, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(["success" => false, "message" => "Database connection error: " . $e->getMessage()]);
    exit();
}

$action = $_GET["action"] ?? "";
$input = json_decode(file_get_contents("php://input"), true) ?? [];

// -----------------------------------------------------------
// 1. FAST BARCODE LOOKUP
// -----------------------------------------------------------
if ($action === "product") {
    $barcode = trim($_GET["barcode"] ?? "");
    if (!$barcode) {
        http_response_code(400);
        echo json_encode(["success" => false, "message" => "Barcode is required"]);
        exit();
    }

    $stmt = $pdo->prepare("SELECT id, barcode, name, category, price, cost_price, stock_quantity, is_weighed, unit_of_measure FROM products WHERE barcode = ?");
    $stmt->execute([$barcode]);
    $prod = $stmt->fetch();

    if ($prod) {
        $prod["price"] = (float)$prod["price"];
        $prod["stock_quantity"] = (float)$prod["stock_quantity"];
        $prod["is_weighed"] = (bool)$prod["is_weighed"];
        echo json_encode(["success" => true, "product" => $prod]);
    } else {
        http_response_code(404);
        echo json_encode(["success" => false, "message" => "Barcode '{$barcode}' not found in inventory"]);
    }
    exit();
}

// -----------------------------------------------------------
// 2. LIST / SEARCH CATALOG
// -----------------------------------------------------------
if ($action === "products") {
    $method = $_SERVER["REQUEST_METHOD"];

    if ($method === "GET") {
        $q = trim($_GET["q"] ?? "");
        $category = trim($_GET["category"] ?? "");

        if ($q !== "") {
            $stmt = $pdo->prepare("SELECT * FROM products WHERE barcode LIKE ? OR name LIKE ? ORDER BY name LIMIT 50");
            $stmt->execute(["%{$q}%", "%{$q}%"]);
        } elseif ($category !== "") {
            $stmt = $pdo->prepare("SELECT * FROM products WHERE category = ? ORDER BY name");
            $stmt->execute([$category]);
        } else {
            $stmt = $pdo->query("SELECT * FROM products ORDER BY category, name");
        }
        $products = $stmt->fetchAll();
        foreach ($products as &$p) {
            $p["price"] = (float)$p["price"];
            $p["stock_quantity"] = (float)$p["stock_quantity"];
            $p["is_weighed"] = (bool)$p["is_weighed"];
        }
        echo json_encode(["success" => true, "count" => count($products), "products" => $products]);
        exit();
    }

    if ($method === "POST") {
        // Add new product
        $barcode = trim($input["barcode"] ?? "");
        $name = trim($input["name"] ?? "");
        $category = trim($input["category"] ?? "General");
        $price = (float)($input["price"] ?? 0.0);
        $cost_price = (float)($input["cost_price"] ?? 0.0);
        $stock = (float)($input["stock_quantity"] ?? 0.0);
        $is_weighed = !empty($input["is_weighed"]) ? 1 : 0;
        $unit = $input["unit_of_measure"] ?? ($is_weighed ? "kg" : "unit");

        if (!$barcode || !$name || $price <= 0) {
            http_response_code(400);
            echo json_encode(["success" => false, "message" => "Valid barcode, name, and price are required"]);
            exit();
        }

        try {
            $stmt = $pdo->prepare("INSERT INTO products (barcode, name, category, price, cost_price, stock_quantity, is_weighed, unit_of_measure) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
            $stmt->execute([$barcode, $name, $category, $price, $cost_price, $stock, $is_weighed, $unit]);
            echo json_encode(["success" => true, "id" => $pdo->lastInsertId(), "message" => "Product added successfully"]);
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(["success" => false, "message" => "Error adding product: " . $e->getMessage()]);
        }
        exit();
    }

    if ($method === "PUT") {
        $id = (int)($_GET["id"] ?? $input["id"] ?? 0);
        if (!$id) {
            http_response_code(400);
            echo json_encode(["success" => false, "message" => "Product ID is required"]);
            exit();
        }

        $fields = [];
        $params = [];
        if (isset($input["name"])) { $fields[] = "name = ?"; $params[] = trim($input["name"]); }
        if (isset($input["category"])) { $fields[] = "category = ?"; $params[] = trim($input["category"]); }
        if (isset($input["price"])) { $fields[] = "price = ?"; $params[] = (float)$input["price"]; }
        if (isset($input["cost_price"])) { $fields[] = "cost_price = ?"; $params[] = (float)$input["cost_price"]; }
        if (isset($input["stock_quantity"])) { $fields[] = "stock_quantity = ?"; $params[] = (float)$input["stock_quantity"]; }
        if (isset($input["is_weighed"])) { $fields[] = "is_weighed = ?"; $params[] = !empty($input["is_weighed"]) ? 1 : 0; }

        if (empty($fields)) {
            echo json_encode(["success" => false, "message" => "No fields to update"]);
            exit();
        }

        $params[] = $id;
        $sql = "UPDATE products SET " . implode(", ", $fields) . " WHERE id = ?";
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        echo json_encode(["success" => true, "message" => "Product updated successfully"]);
        exit();
    }

    if ($method === "DELETE") {
        $id = (int)($_GET["id"] ?? 0);
        if (!$id) {
            http_response_code(400);
            echo json_encode(["success" => false, "message" => "Product ID is required"]);
            exit();
        }
        $stmt = $pdo->prepare("DELETE FROM products WHERE id = ?");
        $stmt->execute([$id]);
        echo json_encode(["success" => true, "message" => "Product deleted successfully"]);
        exit();
    }
}

// -----------------------------------------------------------
// 3. ATOMIC CHECKOUT TRANSACTION
// -----------------------------------------------------------
if ($action === "checkout") {
    $cart = $input["cart"] ?? [];
    $payment_method = strtoupper($input["payment_method"] ?? "CASH");
    $tendered = (float)($input["amount_tendered"] ?? 0.0);
    $discount = (float)($input["discount"] ?? 0.0);
    $cashier = $input["cashier_name"] ?? "Lane 01 Cashier";
    $terminal = $input["terminal_id"] ?? "LANE-01";

    if (empty($cart)) {
        http_response_code(400);
        echo json_encode(["success" => false, "message" => "Cart is empty"]);
        exit();
    }

    try {
        $pdo->beginTransaction();

        $subtotal = 0.0;
        foreach ($cart as $item) {
            $subtotal += (float)$item["price"] * (float)$item["quantity"];
        }
        $subtotal = round($subtotal, 2);
        $taxable = max(0.0, $subtotal - $discount);
        $tax = round($taxable * 0.08, 2); // 8% standard tax
        $total = round($taxable + $tax, 2);

        if ($payment_method === "CASH" && $tendered < $total) {
            $pdo->rollBack();
            http_response_code(400);
            echo json_encode(["success" => false, "message" => "Insufficient payment: Total is {$total}, Tendered is {$tendered}"]);
            exit();
        }

        $change_due = $payment_method === "CASH" ? round(max(0.0, $tendered - $total), 2) : 0.0;
        $receipt_no = "REC-" . date("YmdHi") . "-" . strtoupper(substr(bin2hex(random_bytes(4)), 0, 6));

        // 1. Insert Sales Header
        $stmt = $pdo->prepare("INSERT INTO sales (receipt_number, terminal_id, cashier_name, subtotal, tax, discount, total, payment_method, amount_tendered, change_due, is_synced) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)");
        $stmt->execute([$receipt_no, $terminal, $cashier, $subtotal, $tax, $discount, $total, $payment_method, $tendered, $change_due]);
        $sale_id = $pdo->lastInsertId();

        // 2. Lock Rows & Decrement Stock (FOR UPDATE)
        $lockStmt = $pdo->prepare("SELECT stock_quantity, name, barcode FROM products WHERE id = ? FOR UPDATE");
        $deductStmt = $pdo->prepare("UPDATE products SET stock_quantity = stock_quantity - ? WHERE id = ?");
        $itemStmt = $pdo->prepare("INSERT INTO sale_items (sale_id, product_id, barcode, product_name, quantity, unit_price, total_price, is_weighed) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");

        foreach ($cart as $item) {
            $p_id = (int)$item["id"];
            $qty = (float)$item["quantity"];
            $unit_price = (float)$item["price"];
            $item_total = round($qty * $unit_price, 2);

            $lockStmt->execute([$p_id]);
            $prod = $lockStmt->fetch();

            if (!$prod) {
                throw new Exception("Product ID {$p_id} no longer exists in database");
            }
            if ((float)$prod["stock_quantity"] < $qty) {
                throw new Exception("Insufficient stock for '{$prod['name']}'. Available: {$prod['stock_quantity']}, Requested: {$qty}");
            }

            $deductStmt->execute([$qty, $p_id]);
            $itemStmt->execute([$sale_id, $p_id, $prod["barcode"], $prod["name"], $qty, $unit_price, $item_total, !empty($item["is_weighed"]) ? 1 : 0]);
        }

        $pdo->commit();

        echo json_encode([
            "success" => true,
            "receipt_number" => $receipt_no,
            "subtotal" => $subtotal,
            "discount" => $discount,
            "tax" => $tax,
            "total" => $total,
            "amount_tendered" => $tendered,
            "change_due" => $change_due,
            "payment_method" => $payment_method,
            "timestamp" => date("Y-m-d H:i:s")
        ]);
    } catch (Exception $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        http_response_code(500);
        echo json_encode(["success" => false, "message" => $e->getMessage()]);
    }
    exit();
}

// -----------------------------------------------------------
// 4. HOLD & RECALL CARTS (LAYAWAY)
// -----------------------------------------------------------
if ($action === "hold") {
    $cart = $input["cart"] ?? [];
    $note = trim($input["note"] ?? "Customer Suspended Cart");
    if (empty($cart)) {
        http_response_code(400);
        echo json_encode(["success" => false, "message" => "Cannot hold empty cart"]);
        exit();
    }

    $subtotal = 0.0;
    foreach ($cart as $i) { $subtotal += (float)$i["price"] * (float)$i["quantity"]; }
    $ref = "HOLD-" . strtoupper(substr(bin2hex(random_bytes(3)), 0, 6));

    $stmt = $pdo->prepare("INSERT INTO held_carts (hold_reference, customer_note, cart_json, item_count, subtotal) VALUES (?, ?, ?, ?, ?)");
    $stmt->execute([$ref, $note, json_encode($cart), count($cart), $subtotal]);

    echo json_encode(["success" => true, "hold_reference" => $ref, "message" => "Cart parked successfully"]);
    exit();
}

if ($action === "held_carts") {
    $stmt = $pdo->query("SELECT id, hold_reference, customer_note, item_count, subtotal, created_at FROM held_carts ORDER BY id DESC");
    echo json_encode(["success" => true, "held_carts" => $stmt->fetchAll()]);
    exit();
}

if ($action === "recall") {
    $id = (int)($_GET["id"] ?? 0);
    $stmt = $pdo->prepare("SELECT * FROM held_carts WHERE id = ?");
    $stmt->execute([$id]);
    $held = $stmt->fetch();

    if ($held) {
        $cartData = json_decode($held["cart_json"], true);
        $pdo->prepare("DELETE FROM held_carts WHERE id = ?")->execute([$id]);
        echo json_encode(["success" => true, "cart" => $cartData, "reference" => $held["hold_reference"]]);
    } else {
        http_response_code(404);
        echo json_encode(["success" => false, "message" => "Held cart not found"]);
    }
    exit();
}

// -----------------------------------------------------------
// 5. RECEIPT RETRIEVAL
// -----------------------------------------------------------
if ($action === "receipt") {
    $receipt_no = trim($_GET["receipt_number"] ?? "");
    $stmt = $pdo->prepare("SELECT * FROM sales WHERE receipt_number = ?");
    $stmt->execute([$receipt_no]);
    $sale = $stmt->fetch();

    if (!$sale) {
        http_response_code(404);
        echo json_encode(["success" => false, "message" => "Receipt not found"]);
        exit();
    }

    $itemStmt = $pdo->prepare("SELECT * FROM sale_items WHERE sale_id = ?");
    $itemStmt->execute([$sale["id"]]);
    $items = $itemStmt->fetchAll();

    echo json_encode([
        "success" => true,
        "sale" => $sale,
        "items" => $items,
        "store_info" => [
            "name" => "METRO FRESH SUPERMARKET",
            "address" => "100 Retail Boulevard, Sector 4",
            "tax_id" => "TAX-US-99201948",
            "footer" => "Thank you for shopping local! Keep receipt for returns within 14 days."
        ]
    ]);
    exit();
}

// -----------------------------------------------------------
// 6. DASHBOARD STATS & KPIS
// -----------------------------------------------------------
if ($action === "stats") {
    $today = date("Y-m-d");

    // Today's Sales
    $stmt = $pdo->prepare("SELECT COUNT(*) as total_orders, COALESCE(SUM(total), 0) as gross_revenue, COALESCE(SUM(tax), 0) as tax_collected, COALESCE(AVG(total), 0) as avg_basket FROM sales WHERE DATE(created_at) = ?");
    $stmt->execute([$today]);
    $todayStats = $stmt->fetch();

    // Low Stock Alert Count (< 10)
    $lowStock = $pdo->query("SELECT COUNT(*) as low_count FROM products WHERE stock_quantity <= min_stock_alert")->fetch()["low_count"];

    // Total Inventory Value
    $invStats = $pdo->query("SELECT COUNT(*) as total_skus, COALESCE(SUM(stock_quantity * cost_price), 0) as asset_value FROM products")->fetch();

    // Top 5 Products
    $topProd = $pdo->query("SELECT product_name, SUM(quantity) as units_sold, SUM(total_price) as revenue FROM sale_items GROUP BY product_name ORDER BY units_sold DESC LIMIT 5")->fetchAll();

    echo json_encode([
        "success" => true,
        "today" => [
            "gross_revenue" => round((float)$todayStats["gross_revenue"], 2),
            "total_orders" => (int)$todayStats["total_orders"],
            "avg_basket" => round((float)$todayStats["avg_basket"], 2),
            "tax_collected" => round((float)$todayStats["tax_collected"], 2)
        ],
        "inventory" => [
            "low_stock_count" => (int)$lowStock,
            "total_skus" => (int)$invStats["total_skus"],
            "asset_value" => round((float)$invStats["asset_value"], 2)
        ],
        "top_products" => $topProd
    ]);
    exit();
}

// -----------------------------------------------------------
// 7. Z-REPORT & TILL CLOSE RECONCILIATION
// -----------------------------------------------------------
if ($action === "z_report") {
    $today = date("Y-m-d");
    $stmt = $pdo->prepare("SELECT payment_method, COUNT(*) as tx_count, SUM(total) as method_total FROM sales WHERE DATE(created_at) = ? GROUP BY payment_method");
    $stmt->execute([$today]);
    $byMethod = $stmt->fetchAll();

    $totStmt = $pdo->prepare("SELECT COUNT(*) as tx_total, COALESCE(SUM(subtotal), 0) as subtotal, COALESCE(SUM(tax), 0) as tax, COALESCE(SUM(discount), 0) as discount, COALESCE(SUM(total), 0) as grand_total FROM sales WHERE DATE(created_at) = ?");
    $totStmt->execute([$today]);
    $totals = $totStmt->fetch();

    // Calculate expected cash in drawer (Opening Float $100 + Cash Sales)
    $cashSales = 0.0;
    foreach ($byMethod as $m) {
        if ($m["payment_method"] === "CASH") {
            $cashSales = (float)$m["method_total"];
        }
    }
    $openingFloat = 100.00;
    $expectedCash = $openingFloat + $cashSales;

    echo json_encode([
        "success" => true,
        "report_date" => $today,
        "terminal_id" => "LANE-01",
        "opening_float" => $openingFloat,
        "cash_sales" => $cashSales,
        "expected_cash" => $expectedCash,
        "payment_breakdown" => $byMethod,
        "summary" => $totals
    ]);
    exit();
}

// -----------------------------------------------------------
// 8. RECENT SALES AUDIT LOG
// -----------------------------------------------------------
if ($action === "sales_report") {
    $limit = (int)($_GET["limit"] ?? 50);
    $stmt = $pdo->prepare("SELECT id, receipt_number, terminal_id, cashier_name, subtotal, tax, discount, total, payment_method, amount_tendered, change_due, created_at FROM sales ORDER BY id DESC LIMIT ?");
    $stmt->execute([$limit]);
    echo json_encode(["success" => true, "sales" => $stmt->fetchAll()]);
    exit();
}

// Default Fallback
echo json_encode([
    "status" => "online",
    "engine" => "PHP 8.2 PDO (MySQL)",
    "database" => $db_name,
    "timestamp" => date("Y-m-d H:i:s")
]);
