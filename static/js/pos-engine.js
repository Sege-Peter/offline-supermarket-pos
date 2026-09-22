/**
 * Supermarket POS Core Engine
 * Keyboard-first navigation, Audio Feedback, Barcode scanning,
 * and Atomic Checkout integration.
 */

// Cart State
let cart = [];
let isProcessingCheckout = false;

// Audio Synthesizer (Standard Supermarket Cashier Beep: 1760 Hz Sine Wave)
function playBeep(freq = 1760, duration = 0.08) {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.value = freq;

    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch (e) {
    console.debug("Audio play ignored:", e);
  }
}

// Error Brap Tone
function playErrorTone() {
  playBeep(440, 0.2);
}

// Sub-second Product Lookup
async function lookupBarcode(barcode) {
  const code = barcode.trim();
  if (!code) return;

  try {
    const res = await fetch(`/api/product/${encodeURIComponent(code)}`);
    const data = await res.json();

    if (data.success && data.product) {
      playBeep();
      if (data.product.is_weighed) {
        promptWeighedItem(data.product);
      } else {
        addToCart(data.product, 1);
      }
    } else {
      playErrorTone();
      showToast(`Item not found: ${code}`, "error");
    }
  } catch (err) {
    console.warn("Backend lookup failed, checking offline local catalog:", err);
    // Offline local fallback
    handleOfflineLookup(code);
  }
}

// Add or increment item in cart
function addToCart(product, quantity = 1) {
  const existing = cart.find(item => item.id === product.id);
  if (existing) {
    existing.quantity = Math.round((existing.quantity + quantity) * 1000) / 1000;
  } else {
    cart.push({
      id: product.id,
      barcode: product.barcode,
      name: product.name,
      price: parseFloat(product.price),
      quantity: quantity,
      is_weighed: Boolean(product.is_weighed),
      unit_of_measure: product.unit_of_measure || "unit"
    });
  }
  renderCart();
}

// Weighed item modal prompt / Scale simulation
function promptWeighedItem(product) {
  const input = prompt(`Enter weight for '${product.name}' in kg (or enter for 1.00 kg):`, "1.250");
  if (input !== null) {
    const weight = parseFloat(input);
    if (!isNaN(weight) && weight > 0) {
      addToCart(product, weight);
    } else {
      showToast("Invalid weight entered", "error");
    }
  }
}

// Adjust quantity
function updateQuantity(productId, delta) {
  const item = cart.find(i => i.id === productId);
  if (!item) return;

  if (item.is_weighed) {
    const newQty = Math.round((item.quantity + (delta * 0.25)) * 1000) / 1000;
    if (newQty <= 0) {
      removeFromCart(productId);
    } else {
      item.quantity = newQty;
      renderCart();
    }
  } else {
    item.quantity += delta;
    if (item.quantity <= 0) {
      removeFromCart(productId);
    } else {
      renderCart();
    }
  }
}

function removeFromCart(productId) {
  cart = cart.filter(i => i.id !== productId);
  renderCart();
}

function voidCart() {
  if (cart.length === 0) return;
  if (confirm("Are you sure you want to VOID the entire transaction?")) {
    cart = [];
    renderCart();
    showToast("Transaction voided", "info");
  }
}

// Render Cart Table & Totals
function renderCart() {
  const tbody = document.getElementById("cartBody");
  const emptyState = document.getElementById("cartEmpty");
  const subtotalEl = document.getElementById("subtotalLabel");
  const taxEl = document.getElementById("taxLabel");
  const totalEl = document.getElementById("totalLabel");
  const itemCountEl = document.getElementById("itemCountLabel");

  if (!tbody) return;

  tbody.innerHTML = "";

  if (cart.length === 0) {
    if (emptyState) emptyState.style.display = "flex";
    if (subtotalEl) subtotalEl.innerText = "$0.00";
    if (taxEl) taxEl.innerText = "$0.00";
    if (totalEl) totalEl.innerText = "$0.00";
    if (itemCountEl) itemCountEl.innerText = "0 Items";
    calculateChange();
    return;
  }

  if (emptyState) emptyState.style.display = "none";

  let subtotal = 0;
  let totalPieces = 0;

  cart.forEach(item => {
    const lineTotal = Math.round(item.price * item.quantity * 100) / 100;
    subtotal += lineTotal;
    totalPieces += item.is_weighed ? 1 : item.quantity;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>
        <div class="item-name">${escapeHtml(item.name)}</div>
        <div class="item-meta">${escapeHtml(item.barcode)} ${item.is_weighed ? '• WEIGHED (' + item.unit_of_measure + ')' : ''}</div>
      </td>
      <td>$${item.price.toFixed(2)}</td>
      <td>
        <div class="qty-control">
          <button class="qty-btn" onclick="updateQuantity(${item.id}, -1)">−</button>
          <span class="qty-display">${item.quantity} ${item.is_weighed ? item.unit_of_measure : ''}</span>
          <button class="qty-btn" onclick="updateQuantity(${item.id}, 1)">+</button>
        </div>
      </td>
      <td style="font-weight: 700; font-family: var(--font-mono);">$${lineTotal.toFixed(2)}</td>
      <td>
        <button class="btn-remove" onclick="removeFromCart(${item.id})" title="Remove item">&times;</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  const tax = Math.round(subtotal * 0.08 * 100) / 100;
  const grandTotal = Math.round((subtotal + tax) * 100) / 100;

  if (subtotalEl) subtotalEl.innerText = `$${subtotal.toFixed(2)}`;
  if (taxEl) taxEl.innerText = `$${tax.toFixed(2)}`;
  if (totalEl) totalEl.innerText = `$${grandTotal.toFixed(2)}`;
  if (itemCountEl) itemCountEl.innerText = `${totalPieces} Items`;

  calculateChange();
}

// Instant Change Calculation
function calculateChange() {
  const totalStr = document.getElementById("totalLabel")?.innerText.replace("$", "") || "0";
  const grandTotal = parseFloat(totalStr) || 0;
  const tenderedInput = document.getElementById("tenderedInput");
  const changeEl = document.getElementById("changeDueLabel");
  const payMethod = document.getElementById("payMethod")?.value || "CASH";

  if (!tenderedInput || !changeEl) return;

  if (payMethod !== "CASH") {
    tenderedInput.value = grandTotal.toFixed(2);
    tenderedInput.disabled = true;
    changeEl.innerText = "$0.00";
    return;
  }

  tenderedInput.disabled = false;
  const tendered = parseFloat(tenderedInput.value) || 0;
  const change = Math.max(0, tendered - grandTotal);
  changeEl.innerText = `$${change.toFixed(2)}`;
}

// Atomic Checkout Handler
async function handleCheckout() {
  if (isProcessingCheckout) return;
  if (cart.length === 0) {
    playErrorTone();
    showToast("Cart is empty! Scan items before checkout.", "error");
    return;
  }

  const totalStr = document.getElementById("totalLabel").innerText.replace("$", "");
  const grandTotal = parseFloat(totalStr) || 0;
  const payMethod = document.getElementById("payMethod").value;
  const tenderedInput = document.getElementById("tenderedInput");
  const tendered = payMethod === "CASH" ? (parseFloat(tenderedInput.value) || 0) : grandTotal;

  if (payMethod === "CASH" && tendered < grandTotal) {
    playErrorTone();
    showToast(`Insufficient cash: Total is $${grandTotal.toFixed(2)}, Tendered is $${tendered.toFixed(2)}`, "error");
    tenderedInput.focus();
    return;
  }

  isProcessingCheckout = true;
  const payBtn = document.getElementById("payButton");
  if (payBtn) payBtn.innerText = "Processing...";

  const payload = {
    cart: cart,
    payment_method: payMethod,
    amount_tendered: tendered,
    cashier_name: "Lane 01 Cashier",
    terminal_id: "LANE-01"
  };

  try {
    const res = await fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await res.json();

    if (data.success) {
      playBeep(2200, 0.15); // Success high-pitch ding
      showReceiptModal({
        receipt_number: data.receipt_number,
        created_at: data.timestamp || new Date().toLocaleString(),
        subtotal: data.subtotal,
        tax: data.tax,
        total: data.total,
        payment_method: data.payment_method,
        amount_tendered: data.amount_tendered,
        change_due: data.change_due,
        items: [...cart]
      });

      // Reset transaction
      cart = [];
      if (tenderedInput) tenderedInput.value = "";
      renderCart();
      showToast(`Transaction approved: ${data.receipt_number}`, "success");
    } else {
      playErrorTone();
      alert(`Checkout Failed: ${data.message}`);
    }
  } catch (err) {
    console.warn("Server checkout unreachable. Falling back to local offline queue:", err);
    processOfflineCheckout(payload);
  } finally {
    isProcessingCheckout = false;
    if (payBtn) payBtn.innerText = "PAY & PRINT RECEIPT (F12)";
    const barcodeInput = document.getElementById("barcodeInput");
    if (barcodeInput) barcodeInput.focus();
  }
}

// Receipt Modal View
function showReceiptModal(data) {
  const modal = document.getElementById("receiptModal");
  const paper = document.getElementById("receiptPaper");
  if (!modal || !paper) return;

  const subtotal = parseFloat(data.subtotal).toFixed(2);
  const tax = parseFloat(data.tax).toFixed(2);
  const total = parseFloat(data.total).toFixed(2);
  const tendered = parseFloat(data.amount_tendered).toFixed(2);
  const change = parseFloat(data.change_due).toFixed(2);

  let itemsHtml = "";
  (data.items || []).forEach(item => {
    const itemTot = (item.price * item.quantity).toFixed(2);
    itemsHtml += `
      <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
        <span>${escapeHtml(item.name.substring(0, 18))}</span>
        <span>${item.quantity} x ${item.price.toFixed(2)}</span>
        <span>$${itemTot}</span>
      </div>
    `;
  });

  paper.innerHTML = `
    <div style="text-align: center; border-bottom: 1px dashed #000; padding-bottom: 8px; margin-bottom: 8px;">
      <h3 style="margin: 0; font-size: 16px;">METRO FRESH SUPERMARKET</h3>
      <p style="margin: 2px 0;">100 Retail Boulevard, Sector 4</p>
      <p style="margin: 2px 0;">Tax ID: TAX-US-99201948</p>
    </div>
    <div style="font-size: 11px; margin-bottom: 8px;">
      <div><strong>Receipt:</strong> ${escapeHtml(data.receipt_number)}</div>
      <div><strong>Date:</strong> ${escapeHtml(data.created_at)}</div>
      <div><strong>Till:</strong> LANE-01 | <strong>Cashier:</strong> Lane 01</div>
    </div>
    <div style="border-top: 1px dashed #000; border-bottom: 1px dashed #000; padding: 6px 0; margin-bottom: 8px;">
      ${itemsHtml}
    </div>
    <div style="margin-bottom: 8px;">
      <div style="display: flex; justify-content: space-between;"><span>Subtotal:</span><span>$${subtotal}</span></div>
      <div style="display: flex; justify-content: space-between;"><span>Tax (8%):</span><span>$${tax}</span></div>
      <div style="display: flex; justify-content: space-between; font-weight: bold; font-size: 14px; margin-top: 4px;">
        <span>TOTAL:</span><span>$${total}</span>
      </div>
    </div>
    <div style="border-top: 1px dashed #000; padding-top: 6px; margin-bottom: 8px;">
      <div style="display: flex; justify-content: space-between;"><span>${escapeHtml(data.payment_method)}:</span><span>$${tendered}</span></div>
      <div style="display: flex; justify-content: space-between;"><span>CHANGE DUE:</span><span>$${change}</span></div>
    </div>
    <div style="text-align: center; font-size: 10px; margin-top: 12px; border-top: 1px dashed #000; padding-top: 8px;">
      Thank you for shopping at Metro Fresh!<br>
      Returns accepted within 14 days with receipt.
    </div>
  `;

  modal.classList.add("active");
}

function closeReceiptModal() {
  const modal = document.getElementById("receiptModal");
  if (modal) modal.classList.remove("active");
  const barcodeInput = document.getElementById("barcodeInput");
  if (barcodeInput) barcodeInput.focus();
}

function printThermalReceipt() {
  window.print();
}

// Toast Notifications
function showToast(message, type = "info") {
  const toast = document.createElement("div");
  toast.style.position = "fixed";
  toast.style.bottom = "20px";
  toast.style.right = "20px";
  toast.style.padding = "12px 20px";
  toast.style.borderRadius = "6px";
  toast.style.color = "#fff";
  toast.style.fontSize = "0.9rem";
  toast.style.zIndex = "9999";
  toast.style.boxShadow = "0 4px 12px rgba(0,0,0,0.5)";
  toast.style.transition = "opacity 0.3s ease";

  if (type === "error") {
    toast.style.background = "#ef4444";
  } else if (type === "success") {
    toast.style.background = "#22c55e";
    toast.style.color = "#000";
    toast.style.fontWeight = "bold";
  } else {
    toast.style.background = "#334155";
  }

  toast.innerText = message;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    setTimeout(() => toast.remove(), 300);
  }, 2500);
}

function escapeHtml(str) {
  return String(str || "").replace(/[&<>"']/g, m => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[m]));
}

// Keyboard shortcuts
window.addEventListener("keydown", (e) => {
  // F12: Instant Checkout
  if (e.key === "F12") {
    e.preventDefault();
    handleCheckout();
  }
  // F2: Focus Barcode Input
  if (e.key === "F2") {
    e.preventDefault();
    const input = document.getElementById("barcodeInput");
    if (input) {
      input.focus();
      input.select();
    }
  }
  // Escape: Void Cart or Close Modal
  if (e.key === "Escape") {
    const modal = document.getElementById("receiptModal");
    if (modal && modal.classList.contains("active")) {
      closeReceiptModal();
    }
  }
});

// Offline Queue Fallback (IndexedDB/localStorage)
function processOfflineCheckout(payload) {
  const receiptNo = `REC-OFFLINE-${Date.now().toString(36).toUpperCase()}`;
  const total = payload.cart.reduce((acc, i) => acc + (i.price * i.quantity), 0) * 1.08;
  const change = Math.max(0, payload.amount_tendered - total);

  // Store in offline buffer
  const queue = JSON.parse(localStorage.getItem("pos_offline_queue") || "[]");
  queue.push({
    ...payload,
    receipt_number: receiptNo,
    total: total,
    change_due: change,
    queued_at: new Date().toISOString()
  });
  localStorage.setItem("pos_offline_queue", JSON.stringify(queue));

  showReceiptModal({
    receipt_number: receiptNo,
    created_at: new Date().toLocaleString(),
    subtotal: total / 1.08,
    tax: total - (total / 1.08),
    total: total,
    payment_method: payload.payment_method,
    amount_tendered: payload.amount_tendered,
    change_due: change,
    items: payload.cart
  });

  cart = [];
  renderCart();
  showToast(`[OFFLINE MODE] Saved receipt ${receiptNo} to local buffer`, "success");
}

// Fallback catalog for full offline demo
const OFFLINE_SEED_CATALOG = {
  "011110417001": { id: 1, barcode: "011110417001", name: "Whole Milk 1L", price: 1.50, is_weighed: false },
  "041520000102": { id: 2, barcode: "041520000102", name: "White Bread Loaf", price: 2.20, is_weighed: false },
  "4011": { id: 3, barcode: "4011", name: "Fresh Bananas (kg)", price: 1.80, is_weighed: true, unit_of_measure: "kg" },
  "078742351864": { id: 4, barcode: "078742351864", name: "Basmati Rice 2kg", price: 5.50, is_weighed: false },
  "4065": { id: 5, barcode: "4065", name: "Green Bell Peppers (kg)", price: 3.20, is_weighed: true, unit_of_measure: "kg" },
  "049000028904": { id: 6, barcode: "049000028904", name: "Coca-Cola Can 330ml", price: 1.25, is_weighed: false },
  "021130004928": { id: 7, barcode: "021130004928", name: "Fresh Chicken Breast (kg)", price: 7.90, is_weighed: true, unit_of_measure: "kg" },
  "011110824106": { id: 8, barcode: "011110824106", name: "Large Brown Eggs (12-pack)", price: 3.40, is_weighed: false },
  "028400040112": { id: 9, barcode: "028400040112", name: "Classic Potato Chips 150g", price: 2.10, is_weighed: false },
  "4131": { id: 10, barcode: "4131", name: "Fuji Apples (kg)", price: 2.90, is_weighed: true, unit_of_measure: "kg" }
};

function handleOfflineLookup(barcode) {
  const prod = OFFLINE_SEED_CATALOG[barcode];
  if (prod) {
    playBeep();
    if (prod.is_weighed) {
      promptWeighedItem(prod);
    } else {
      addToCart(prod, 1);
    }
  } else {
    playErrorTone();
    showToast(`Barcode ${barcode} not found in offline catalog`, "error");
  }
}
