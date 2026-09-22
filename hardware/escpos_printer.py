"""
Supermarket Hardware Driver: 80mm ESC/POS Thermal Receipt Printer
Handles raw byte commands for EPSON, Star, Bixolon, Citizen, and generic USB thermal printers.
Features:
- Cash drawer kick pulse (Pin 2: ESC p 0 25 250)
- Bold headers & centered logo text
- High-speed 3-column line item formatting (Item, Qty/Price, Total)
- Full paper cut (GS V 0)
"""

import datetime

try:
    from escpos.printer import Usb, Network, Dummy
    ESCPOS_AVAILABLE = True
except ImportError:
    ESCPOS_AVAILABLE = False


class ThermalReceiptPrinter:
    def __init__(self, mode="dummy", host="192.168.1.200", port=9100, vendor_id=0x04b8, product_id=0x0202):
        self.mode = mode
        self.printer = None

        if ESCPOS_AVAILABLE:
            try:
                if mode == "network":
                    self.printer = Network(host, port=port)
                elif mode == "usb":
                    self.printer = Usb(vendor_id, product_id)
                else:
                    self.printer = Dummy()
            except Exception as e:
                print(f"[!] ESC/POS printer initialization failed: {e}. Defaulting to text console.")
                self.printer = Dummy()
        else:
            self.printer = None

    def kick_cash_drawer(self):
        """Sends the standard 5-byte pulse command to kick open RJ11 connected till drawer."""
        print("[⚡] Kicking cash drawer solenoid: ESC p 0 25 250")
        if self.printer and hasattr(self.printer, "cashdraw"):
            self.printer.cashdraw(2)
        elif self.printer and hasattr(self.printer, "_raw"):
            self.printer._raw(b"\x1b\x70\x00\x19\xfa")

    def print_receipt(self, receipt_data):
        """
        Prints a standardized 48-column (80mm paper width) supermarket receipt.
        """
        sale = receipt_data.get("sale", {})
        items = receipt_data.get("items", [])
        store = receipt_data.get("store_info", {
            "name": "METRO FRESH SUPERMARKET",
            "address": "100 Retail Boulevard, Sector 4",
            "tax_id": "TAX-US-99201948",
            "footer": "Thank you for shopping with us!"
        })

        lines = []
        lines.append("=" * 44)
        lines.append(store["name"].center(44))
        lines.append(store["address"].center(44))
        lines.append(f"VAT/Tax ID: {store['tax_id']}".center(44))
        lines.append("=" * 44)
        lines.append(f"Receipt: {sale.get('receipt_number', 'N/A')}")
        lines.append(f"Date:    {sale.get('created_at', datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S'))}")
        lines.append(f"Cashier: {sale.get('cashier_name', 'Lane 01')} | Till: {sale.get('terminal_id', 'LANE-01')}")
        lines.append("-" * 44)
        lines.append(f"{'ITEM':<20} {'QTY x PRICE':<14} {'TOTAL':>8}")
        lines.append("-" * 44)

        for item in items:
            name = item["product_name"][:19]
            qty_unit = f"{item['quantity']}x{item['unit_price']:.2f}"
            tot = f"${item['total_price']:.2f}"
            lines.append(f"{name:<20} {qty_unit:<14} {tot:>8}")

        lines.append("-" * 44)
        lines.append(f"{'SUBTOTAL:':<32} ${float(sale.get('subtotal', 0)):>9.2f}")
        lines.append(f"{'TAX (8%):':<32} ${float(sale.get('tax', 0)):>9.2f}")
        lines.append(f"{'GRAND TOTAL:':<32} ${float(sale.get('total', 0)):>9.2f}")
        lines.append("-" * 44)
        lines.append(f"{sale.get('payment_method', 'CASH'):<32} ${float(sale.get('amount_tendered', 0)):>9.2f}")
        lines.append(f"{'CHANGE DUE:':<32} ${float(sale.get('change_due', 0)):>9.2f}")
        lines.append("=" * 44)
        lines.append(store["footer"].center(44))
        lines.append("=" * 44)
        lines.append("\n\n")

        full_text = "\n".join(lines)
        print(full_text)

        if self.printer:
            try:
                self.printer.text(full_text)
                self.printer.cut()
            except Exception as e:
                print(f"[!] ESC/POS hardware print failed: {e}")

        # Automatically kick drawer on Cash payments
        if sale.get("payment_method") == "CASH":
            self.kick_cash_drawer()

        return full_text


if __name__ == "__main__":
    printer = ThermalReceiptPrinter(mode="dummy")
    sample_data = {
        "sale": {
            "receipt_number": "REC-20260922-A819F0",
            "terminal_id": "LANE-01",
            "cashier_name": "Maria G.",
            "subtotal": 13.90,
            "tax": 1.11,
            "total": 15.01,
            "payment_method": "CASH",
            "amount_tendered": 20.00,
            "change_due": 4.99
        },
        "items": [
            {"product_name": "Whole Milk 1L", "quantity": 2, "unit_price": 1.50, "total_price": 3.00},
            {"product_name": "Fresh Bananas (kg)", "quantity": 1.45, "unit_price": 1.80, "total_price": 2.61},
            {"product_name": "Fresh Chicken Breast", "quantity": 1.20, "unit_price": 7.90, "total_price": 9.48}
        ]
    }
    printer.print_receipt(sample_data)
