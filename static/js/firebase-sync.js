// static/js/firebase-sync.js
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

if (firebaseConfig.apiKey !== "YOUR_API_KEY") {
  firebase.initializeApp(firebaseConfig);
  const db = firebase.firestore();
  console.log("🔥 Firebase initialized successfully.");

  window.posDb = db;

  window.loadProductsFromFirebase = async function() {
    try {
      const snapshot = await db.collection("products").get();
      if (!snapshot.empty) {
        const fbProducts = [];
        snapshot.forEach(doc => fbProducts.push(doc.data()));
        localStorage.setItem("pos_products", JSON.stringify(fbProducts));
        window.products = fbProducts;
        if (typeof renderCatalog === 'function') renderCatalog();
        console.log("Products synced from Firebase.");
      }
    } catch (e) {
      console.error("Firebase products sync error:", e);
    }
  };

  window.backupSaleToFirebase = async function(saleData) {
    try {
      await db.collection("sales").doc(saleData.receipt_number).set(saleData);
      console.log("Sale backed up to Firebase:", saleData.receipt_number);
    } catch (e) {
      console.error("Firebase sale backup error:", e);
    }
  };

  window.syncOfflineQueue = async function() {
    const queue = JSON.parse(localStorage.getItem("pos_offline_queue") || "[]");
    if (queue.length > 0) {
      for (const sale of queue) {
        await window.backupSaleToFirebase(sale);
      }
      localStorage.setItem("pos_offline_queue", "[]");
      console.log("Offline sales queue synced to Firebase.");
    }
  };

  window.addEventListener('online', () => {
    window.loadProductsFromFirebase();
    window.syncOfflineQueue();
  });

  // Initial load
  window.loadProductsFromFirebase();
  window.syncOfflineQueue();

} else {
  console.warn("<i class="fas fa-exclamation-triangle"></i> Firebase is not configured. Please add your credentials to static/js/firebase-sync.js");
  window.backupSaleToFirebase = async function() {}; // No-op
}
