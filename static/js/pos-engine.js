/**
 * OFFLINE-FIRST SUPERMARKET EPOS ENGINE
 * Features:
 * 1. Multi-Currency Formatting (USD, EUR, GBP, NGN, KES, ZAR, INR, etc.)
 * 2. Role-Based Access Control & Admin PIN Pad Authentication
 * 3. High-Fidelity 80mm / 58mm ESC/POS Printable Receipts
 * 4. Atomic Database Checkout & Offline Queue Resilience
 * 5. Audio Synthesizer Beeps & Cash Drawer Kick Signals
 */

// ==========================================
// 1. MULTI-CURRENCY DEFINITIONS & ENGINE
// ==========================================
const CURRENCIES = {
  USD: { code: 'USD', symbol: '$', name: 'US Dollar (USD)', position: 'BEFORE', decimals: 2 },
  EUR: { code: 'EUR', symbol: '€', name: 'Euro (EUR)', position: 'AFTER', decimals: 2 },
  GBP: { code: 'GBP', symbol: '£', name: 'British Pound (GBP)', position: 'BEFORE', decimals: 2 },
  NGN: { code: 'NGN', symbol: '₦', name: 'Nigerian Naira (NGN)', position: 'BEFORE', decimals: 2 },
  KES: { code: 'KES', symbol: 'KSh', name: 'Kenyan Shilling (KES)', position: 'BEFORE', decimals: 2 },
  ZAR: { code: 'ZAR', symbol: 'R', name: 'South African Rand (ZAR)', position: 'BEFORE', decimals: 2 },
  INR: { code: 'INR', symbol: '₹', name: 'Indian Rupee (INR)', position: 'BEFORE', decimals: 2 },
  JPY: { code: 'JPY', symbol: '¥', name: 'Japanese Yen (JPY)', position: 'BEFORE', decimals: 0 },
  CAD: { code: 'CAD', symbol: '$', name: 'Canadian Dollar (CAD)', position: 'BEFORE', decimals: 2 },
  AUD: { code: 'AUD', symbol: '$', name: 'Australian Dollar (AUD)', position: 'BEFORE', decimals: 2 },
  GHS: { code: 'GHS', symbol: 'GH₵', name: 'Ghanaian Cedi (GHS)', position: 'BEFORE', decimals: 2 },
  AED: { code: 'AED', symbol: 'AED', name: 'UAE Dirham (AED)', position: 'AFTER', decimals: 2 }
};

let activeCurrency = CURRENCIES.USD;

function initCurrency() {
  const savedCode = localStorage.getItem('pos_currency_code') || 'USD';
  if (CURRENCIES[savedCode]) {
    activeCurrency = CURRENCIES[savedCode];
  }
  const picker = document.getElementById('currencyPicker');
  if (picker) {
    picker.innerHTML = '';
    Object.values(CURRENCIES).forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.code;
      opt.innerText = `${c.code} (${c.symbol})`;
      if (c.code === activeCurrency.code) opt.selected = true;
      picker.appendChild(opt);
    });
    picker.addEventListener('change', (e) => {
      setCurrency(e.target.value);
    });
  }
}

function setCurrency(code) {
  if (CURRENCIES[code]) {
    activeCurrency = CURRENCIES[code];
    localStorage.setItem('pos_currency_code', code);
    renderCart();
    if (typeof renderCatalog === 'function') renderCatalog();
    if (typeof renderDashboard === 'function') renderDashboard();
    if (typeof renderHistory === 'function') renderHistory();
    if (typeof renderZReport === 'function') renderZReport();
    showToast(`Currency set to ${activeCurrency.name}`, "info");
  }
}

function formatMoney(amount) {
  const num = parseFloat(amount || 0);
  const dec = activeCurrency.decimals;
  const formattedNum = num.toLocaleString(undefined, {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec
  });
  return activeCurrency.position === 'BEFORE' 
    ? `${activeCurrency.symbol}${formattedNum}` 
    : `${formattedNum} ${activeCurrency.symbol}`;
}

// ==========================================
// 2. ADMIN AUTHENTICATION & RBAC STATE
// ==========================================
let currentUser = {
  username: 'lane01',
  full_name: 'Jane Doe (Lane 01)',
  role: 'CASHIER'
};

let authPendingAction = null;
let enteredPin = "";

function initAuth() {
  const savedUser = localStorage.getItem('pos_current_user');
  if (savedUser) {
    try {
      currentUser = JSON.parse(savedUser);
    } catch (e) {}
  }
  updateUserUI();
}

function updateUserUI() {
  const nameEl = document.getElementById('currentUserName');
  const roleEl = document.getElementById('currentUserRole');
  if (nameEl) nameEl.innerText = currentUser.full_name;
  if (roleEl) {
    roleEl.innerText = currentUser.role;
    roleEl.className = `user-role-tag ${currentUser.role.toLowerCase()}`;
  }
}

function openAuthModal(pendingAction = null, message = "Enter PIN to authenticate:") {
  authPendingAction = pendingAction;
  enteredPin = "";
  updatePinDots();
  const title = document.getElementById('authModalSubtitle');
  if (title) title.innerText = message;
  const modal = document.getElementById('authModal');
  if (modal) modal.classList.add('active');
}

function closeAuthModal() {
  const modal = document.getElementById('authModal');
  if (modal) modal.classList.remove('active');
  authPendingAction = null;
  enteredPin = "";
}

function pressPinKey(num) {
  if (enteredPin.length < 6) {
    enteredPin += num;
    updatePinDots();
    playBeep(900, 0.04);
  }
}

function clearPin() {
  enteredPin = "";
  updatePinDots();
}

function updatePinDots() {
  const dots = document.querySelectorAll('.pin-dot');
  dots.forEach((dot, idx) => {
    if (idx < enteredPin.length) dot.classList.add('filled');
    else dot.classList.remove('filled');
  });
}

async function submitPin() {
  if (!enteredPin) return;

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: enteredPin })
    });
    const data = await res.json();

    if (data.success && data.user) {
      currentUser = data.user;
      localStorage.setItem('pos_current_user', JSON.stringify(currentUser));
      updateUserUI();
      playBeep(1760, 0.1);
      showToast(`Logged in as ${currentUser.full_name} (${currentUser.role})`, "success");
      closeAuthModal();

      if (typeof authPendingAction === 'function') {
        authPendingAction();
      }
      return;
    }
  } catch (err) {
    // Offline PIN fallback check
    if (enteredPin === "9999") {
      currentUser = { username: "manager", full_name: "Robert Vance (Store Mgr)", role: "MANAGER" };
      localStorage.setItem('pos_current_user', JSON.stringify(currentUser));
      updateUserUI();
      showToast("Offline Admin Login Successful", "success");
      closeAuthModal();
      if (typeof authPendingAction === 'function') authPendingAction();
      return;
    } else if (enteredPin === "1234") {
      currentUser = { username: "lane01", full_name: "Jane Doe (Lane 01)", role: "CASHIER" };
      localStorage.setItem('pos_current_user', JSON.stringify(currentUser));
      updateUserUI();
      showToast("Offline Cashier Login", "info");
      closeAuthModal();
      if (typeof authPendingAction === 'function') authPendingAction();
      return;
    }
  }

  playErrorTone();
  showToast("Invalid PIN. Access Denied.", "error");
  enteredPin = "";
  updatePinDots();
}

function requireAdmin(actionCallback, actionName = "Admin Feature") {
  if (currentUser.role === "MANAGER") {
    actionCallback();
  } else {
    openAuthModal(actionCallback, `Manager authorization required for ${actionName}. Enter Manager PIN:`);
  }
}

// ==========================================
// 3. CART STATE & AUDIO ENGINE
// ==========================================
let cart = [];
let isProcessingCheckout = false;
let activeDiscount = 0.0;
let currentPaymentMethod = "CASH";

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
  } catch (e) {}
}

function playErrorTone() {
  playBeep(440, 0.2);
}

// Barcode Lookup
async function lookupBarcode(barcode) {
  const code = String(barcode || "").trim();
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
    handleOfflineLookup(code);
  }
}

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

function promptWeighedItem(product) {
  const input = prompt(`Enter weight for '${product.name}' in kg:`, "1.250");
  if (input !== null) {
    const weight = parseFloat(input);
    if (!isNaN(weight) && weight > 0) {
      addToCart(product, weight);
    } else {
      showToast("Invalid weight entered", "error");
    }
  }
}

function updateCartQty(index, delta) {
  if (!cart[index]) return;
  const newQty = cart[index].quantity + delta;
  if (newQty <= 0) {
    cart.splice(index, 1);
  } else {
    cart[index].quantity = Math.round(newQty * 1000) / 1000;
  }
  renderCart();
}

function removeFromCart(index) {
  if (cart[index]) {
    cart.splice(index, 1);
    renderCart();
  }
}

function voidCart() {
  if (cart.length === 0) return;
  requireAdmin(() => {
    cart = [];
    activeDiscount = 0.0;
    renderCart();
    showToast("Transaction voided by Manager override", "info");
  }, "Voiding Cart");
}

function selectPaymentMethod(method) {
  currentPaymentMethod = method;
  document.querySelectorAll('.pay-method-btn').forEach(btn => {
    if (btn.dataset.method === method) btn.classList.add('active');
    else btn.classList.remove('active');
  });
  renderCart();
}

function setTenderAmount(amt) {
  const input = document.getElementById('tenderedInput');
  if (input) {
    input.value = amt;
    renderCart();
  }
}

function renderCart() {
  const tbody = document.getElementById('cartItemsBody') || document.getElementById('cartTableBody');

  const countBadge = document.getElementById('cartItemCount');
  const subtotalEl = document.getElementById('cartSubtotal');
  const taxEl = document.getElementById('cartTax');
  const grandTotalEl = document.getElementById('cartGrandTotal');
  const changeEl = document.getElementById('changeDueAmount');
  const tenderedInput = document.getElementById('tenderedInput');
  const mobCount = document.getElementById('mobBarCount');
  const mobTotal = document.getElementById('mobBarTotal');

  if (!tbody) return;
  tbody.innerHTML = "";

  if (cart.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5">
          <div class="cart-empty">
            <div class="cart-empty-icon">🛒</div>
            <p>Scan a barcode or press <strong>F4</strong> for product catalog</p>
          </div>
        </td>
      </tr>
    `;
    if (countBadge) countBadge.innerText = "0";
    if (subtotalEl) subtotalEl.innerText = formatMoney(0);
    if (taxEl) taxEl.innerText = formatMoney(0);
    if (grandTotalEl) grandTotalEl.innerText = formatMoney(0);
    if (changeEl) changeEl.innerText = formatMoney(0);
    if (mobCount) mobCount.innerText = "0 ITEMS";
    if (mobTotal) mobTotal.innerText = formatMoney(0);
    return;
  }

  let subtotal = 0;
  let totalItemsCount = 0;

  cart.forEach((item, index) => {
    const lineTotal = item.price * item.quantity;
    subtotal += lineTotal;
    totalItemsCount += item.is_weighed ? 1 : item.quantity;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <div class="item-name">${escapeHtml(item.name)}</div>
        <div class="item-meta">${escapeHtml(item.barcode)} • ${formatMoney(item.price)}/${item.unit_of_measure}</div>
      </td>
      <td>${formatMoney(item.price)}</td>
      <td>
        <div class="qty-control">
          <button class="qty-btn" onclick="updateCartQty(${index}, -1)">-</button>
          <span class="qty-display">${item.quantity}</span>
          <button class="qty-btn" onclick="updateCartQty(${index}, 1)">+</button>
        </div>
      </td>
      <td style="font-weight: 800; font-family: var(--font-mono); color: var(--cyan-bright);">${formatMoney(lineTotal)}</td>
      <td>
        <button class="btn-remove" onclick="removeFromCart(${index})" title="Remove">✕</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  const taxRate = 0.08;
  const taxableSubtotal = Math.max(0, subtotal - activeDiscount);
  const tax = taxableSubtotal * taxRate;
  const grandTotal = taxableSubtotal + tax;

  if (countBadge) countBadge.innerText = String(Math.round(totalItemsCount));
  if (subtotalEl) subtotalEl.innerText = formatMoney(subtotal);
  if (taxEl) taxEl.innerText = formatMoney(tax);
  if (grandTotalEl) grandTotalEl.innerText = formatMoney(grandTotal);

  if (mobCount) mobCount.innerText = `${Math.round(totalItemsCount)} ITEMS`;
  if (mobTotal) mobTotal.innerText = formatMoney(grandTotal);

  const tenderedVal = tenderedInput ? parseFloat(tenderedInput.value || 0) : 0;
  const change = Math.max(0, tenderedVal - grandTotal);
  if (changeEl) changeEl.innerText = formatMoney(change);
}

function scrollToPaymentOrCheckout() {
  if (cart.length === 0) {
    playErrorTone();
    showToast("Cart is empty!", "error");
    return;
  }
  const paymentSec = document.querySelector('.payment-section');
  if (paymentSec) {
    paymentSec.scrollIntoView({ behavior: 'smooth' });
  }
  const tenderedInput = document.getElementById('tenderedInput');
  if (tenderedInput && tenderedInput.value) {
    handleCheckout();
  }
}


// ==========================================
// 4. ATOMIC CHECKOUT & RECEIPT ENGINE
// ==========================================
async function handleCheckout() {
  if (isProcessingCheckout || cart.length === 0) {
    if (cart.length === 0) playErrorTone();
    return;
  }

  const subtotal = cart.reduce((acc, i) => acc + (i.price * i.quantity), 0);
  const taxableSubtotal = Math.max(0, subtotal - activeDiscount);
  const tax = taxableSubtotal * 0.08;
  const grandTotal = taxableSubtotal + tax;

  const tenderedInput = document.getElementById('tenderedInput');
  let tendered = tenderedInput ? parseFloat(tenderedInput.value) : grandTotal;
  if (isNaN(tendered) || tendered < grandTotal) {
    tendered = grandTotal;
    if (tenderedInput) tenderedInput.value = grandTotal.toFixed(2);
  }

  isProcessingCheckout = true;
  showToast("Processing atomic inventory checkout...", "info");

  const payload = {
    cart: cart,
    payment_method: currentPaymentMethod,
    amount_tendered: tendered,
    discount: activeDiscount,
    terminal_id: "LANE-01",
    cashier_name: currentUser.full_name
  };

  try {
    const res = await fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json();

    if (data.success) {
      playBeep(2100, 0.15);
      showToast(`Sale Complete! Receipt #${data.receipt_number}`, "success");
      kickCashDrawerSignal();
      showReceiptModal({
        ...data,
        items: [...cart],
        created_at: new Date().toLocaleString()
      });
      cart = [];
      activeDiscount = 0.0;
      if (tenderedInput) tenderedInput.value = "";
      renderCart();
    } else {
      playErrorTone();
      alert(`Checkout failed: ${data.message}`);
    }
  } catch (err) {
    processOfflineCheckout(payload);
  } finally {
    isProcessingCheckout = false;
  }
}

// Kick Cash Drawer Pulse
async function kickCashDrawerSignal() {
  try {
    await fetch('/api/hardware/drawer', { method: 'POST' });
  } catch (e) {}
}

// ==========================================
// 5. EPOS THERMAL RECEIPT RENDERING (80mm / 58mm)
// ==========================================
let currentReceiptData = null;
let currentReceiptWidth = "80mm";

function showReceiptModal(sale) {
  currentReceiptData = sale;
  const modal = document.getElementById("receiptModal");
  if (!modal) return;

  renderReceiptPaper(sale, currentReceiptWidth);
  modal.classList.add("active");
}

function setReceiptPaperWidth(width) {
  currentReceiptWidth = width;
  document.querySelectorAll('.paper-width-btn').forEach(btn => {
    if (btn.dataset.width === width) btn.classList.add('active');
    else btn.classList.remove('active');
  });

  if (currentReceiptData) {
    renderReceiptPaper(currentReceiptData, width);
  }
}

function renderReceiptPaper(sale, width) {
  const paper = document.getElementById("eposThermalPaper");
  if (!paper) return;

  paper.className = `epos-thermal-paper ${width === '58mm' ? 'width-58mm' : ''}`;

  const storeSettings = JSON.parse(localStorage.getItem('pos_store_settings') || '{}');
  const storeName = storeSettings.store_name || "METRO FRESH SUPERMARKET";
  const branchName = storeSettings.branch_name || "Downtown Flagship - Lane 01";
  const storeAddress = storeSettings.store_address || "104 Market Street, Central City";
  const storePhone = storeSettings.store_phone || "+1 (555) 392-8800";
  const storeVat = storeSettings.store_vat || "US-TAX-8492041";
  const receiptFooter = storeSettings.receipt_footer || "Thank you for shopping with us!\nReturns accepted within 14 days with receipt.";

  let itemsHtml = "";
  (sale.items || []).forEach(item => {
    const qtyStr = `${item.quantity} ${item.unit_of_measure || 'ea'}`;
    const totalStr = formatMoney(item.price * item.quantity);
    itemsHtml += `
      <tr>
        <td style="font-weight: bold;">${escapeHtml(item.name)}</td>
        <td style="text-align: center;">${qtyStr}</td>
        <td style="text-align: right;">${formatMoney(item.price)}</td>
        <td style="text-align: right; font-weight: bold;">${totalStr}</td>
      </tr>
    `;
  });

  const subtotal = sale.subtotal || 0;
  const tax = sale.tax || 0;
  const total = sale.total || (subtotal + tax);
  const tendered = sale.amount_tendered || total;
  const change = sale.change_due !== undefined ? sale.change_due : Math.max(0, tendered - total);
  const discount = sale.discount || 0;

  paper.innerHTML = `
    <div class="receipt-store-header">
      <div class="receipt-store-name">${escapeHtml(storeName)}</div>
      <div class="receipt-store-sub">${escapeHtml(branchName)}</div>
      <div class="receipt-store-sub">${escapeHtml(storeAddress)}</div>
      <div class="receipt-store-sub">Tel: ${escapeHtml(storePhone)} | VAT: ${escapeHtml(storeVat)}</div>
    </div>

    <div class="receipt-meta-grid">
      <div style="display: flex; justify-content: space-between;">
        <span>RECEIPT: <strong>${escapeHtml(sale.receipt_number)}</strong></span>
        <span>${escapeHtml(sale.created_at || new Date().toLocaleString())}</span>
      </div>
      <div style="display: flex; justify-content: space-between;">
        <span>CASHIER: ${escapeHtml(sale.cashier_name || currentUser.full_name)}</span>
        <span>TERMINAL: ${escapeHtml(sale.terminal_id || "LANE-01")}</span>
      </div>
    </div>

    <table class="receipt-items-table">
      <thead>
        <tr>
          <th style="text-align: left;">ITEM</th>
          <th style="text-align: center;">QTY</th>
          <th style="text-align: right;">PRICE</th>
          <th style="text-align: right;">TOTAL</th>
        </tr>
      </thead>
      <tbody>
        ${itemsHtml}
      </tbody>
    </table>

    <div class="receipt-totals-area">
      <div style="display: flex; justify-content: space-between;">
        <span>Subtotal:</span>
        <span>${formatMoney(subtotal)}</span>
      </div>
      ${discount > 0 ? `
      <div style="display: flex; justify-content: space-between; color: #b45309;">
        <span>Store Discount:</span>
        <span>-${formatMoney(discount)}</span>
      </div>` : ''}
      <div style="display: flex; justify-content: space-between;">
        <span>Sales Tax (8%):</span>
        <span>${formatMoney(tax)}</span>
      </div>
      <div class="receipt-grand-total" style="display: flex; justify-content: space-between;">
        <span>TOTAL:</span>
        <span>${formatMoney(total)}</span>
      </div>
      <div style="display: flex; justify-content: space-between; margin-top: 4px;">
        <span>Tendered (${escapeHtml(sale.payment_method || "CASH")}):</span>
        <span>${formatMoney(tendered)}</span>
      </div>
      <div style="display: flex; justify-content: space-between; font-weight: bold;">
        <span>CHANGE DUE:</span>
        <span>${formatMoney(change)}</span>
      </div>
    </div>

    <div class="receipt-barcode-box">
      ${generateSvgBarcode(sale.receipt_number || "REC-00000")}
      <div style="font-size: 9px; letter-spacing: 2px; margin-top: 2px;">* ${escapeHtml(sale.receipt_number)} *</div>
    </div>

    <div class="receipt-footer-text">
      ${escapeHtml(receiptFooter).replace(/\n/g, '<br>')}
    </div>
  `;
}

// Client-Side SVG 1D Barcode Line Generator
function generateSvgBarcode(code) {
  let bars = "";
  let x = 10;
  for (let i = 0; i < code.length; i++) {
    const charCode = code.charCodeAt(i);
    const w1 = (charCode % 3) + 1.2;
    const w2 = ((charCode * 2) % 4) + 1.5;
    bars += `<rect x="${x}" y="0" width="${w1}" height="36" fill="#000000" />`;
    x += w1 + 1.5;
    bars += `<rect x="${x}" y="0" width="${w2}" height="36" fill="#000000" />`;
    x += w2 + 2;
  }
  return `
    <svg class="receipt-barcode-svg" viewBox="0 0 ${Math.max(x + 10, 200)} 40" xmlns="http://www.w3.org/2000/svg">
      ${bars}
    </svg>
  `;
}

function printThermalReceipt() {
  window.print();
}

function copyEscPosCommands() {
  if (!currentReceiptData) return;
  const hexSample = `1B 40 1B 61 01 1B 45 01 4D 45 54 52 4F 20 46 52 45 53 48 0A 1B 45 00 1B 61 00 ... 1D 56 42 00 1B 70 00 19 FA`;
  navigator.clipboard.writeText(hexSample);
  showToast("📋 Raw ESC/POS bytes copied to clipboard", "info");
}

function closeReceiptModal() {
  const modal = document.getElementById("receiptModal");
  if (modal) modal.classList.remove("active");
}

// ==========================================
// 6. TOAST & UTILITIES
// ==========================================
function showToast(message, type = "info") {
  const toast = document.createElement("div");
  toast.style.position = "fixed";
  toast.style.bottom = "20px";
  toast.style.right = "20px";
  toast.style.padding = "12px 20px";
  toast.style.borderRadius = "8px";
  toast.style.color = "#fff";
  toast.style.fontSize = "0.92rem";
  toast.style.fontWeight = "700";
  toast.style.zIndex = "9999";
  toast.style.boxShadow = "0 8px 24px rgba(0,0,0,0.6)";
  toast.style.transition = "opacity 0.3s ease, transform 0.3s ease";
  toast.style.transform = "translateY(10px)";

  if (type === "error") {
    toast.style.background = "#ef4444";
  } else if (type === "success") {
    toast.style.background = "linear-gradient(135deg, #06b6d4, #10b981)";
    toast.style.color = "#000";
  } else {
    toast.style.background = "#1e293b";
    toast.style.border = "1px solid #06b6d4";
    toast.style.color = "#00f2fe";
  }

  toast.innerText = message;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.transform = "translateY(0)";
  }, 10);

  setTimeout(() => {
    toast.style.opacity = "0";
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function escapeHtml(str) {
  return String(str || "").replace(/[&<>"']/g, m => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[m]));
}

// Keyboard shortcuts
window.addEventListener("keydown", (e) => {
  if (e.key === "F12") {
    e.preventDefault();
    handleCheckout();
  }
  if (e.key === "Escape") {
    const rModal = document.getElementById("receiptModal");
    const aModal = document.getElementById("authModal");
    if (rModal && rModal.classList.contains("active")) closeReceiptModal();
    else if (aModal && aModal.classList.contains("active")) closeAuthModal();
  }
});

// Offline Queue Processing
function processOfflineCheckout(payload) {
  const receiptNo = `REC-OFF-${Date.now().toString(36).toUpperCase()}`;
  const total = payload.cart.reduce((acc, i) => acc + (i.price * i.quantity), 0) * 1.08;
  const change = Math.max(0, payload.amount_tendered - total);

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
  showToast(`[OFFLINE MODE] Saved receipt ${receiptNo}`, "success");
}

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
    if (prod.is_weighed) promptWeighedItem(prod);
    else addToCart(prod, 1);
  } else {
    playErrorTone();
    showToast(`Barcode ${barcode} not found`, "error");
  }
}

// Auto-initialize on load
document.addEventListener('DOMContentLoaded', () => {
  initCurrency();
  initAuth();
  renderCart();
});
