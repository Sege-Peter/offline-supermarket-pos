const fs = require('fs');
let posEngine = fs.readFileSync('static/js/pos-engine.js', 'utf8');

const oldShowToastRegex = /function showToast\(message, type = "info"\) \{[\s\S]*?setTimeout\(\(\) => \{[\s\S]*?toast\.style\.opacity = "0";[\s\S]*?toast\.style\.transform = "translateY\(10px\)";[\s\S]*?setTimeout\(\(\) => document\.body\.removeChild\(toast\), 300\);[\s\S]*?\}, 3000\);[\s\S]*?\}/;

const newShowToast = `function showToast(message, type = "info") {
  const toast = document.createElement("div");
  toast.className = \`pos-toast toast-\${type}\`;
  
  // Add icon based on type
  let icon = "<i class='fas fa-info-circle'></i>";
  if (type === "success") icon = "<i class='fas fa-check-circle'></i>";
  if (type === "error") icon = "<i class='fas fa-times-circle'></i>";
  if (type === "warning") icon = "<i class='fas fa-exclamation-triangle'></i>";

  toast.innerHTML = \`<span>\${icon}</span> <span>\${message}</span>\`;
  document.body.appendChild(toast);

  // Trigger animation
  requestAnimationFrame(() => {
    toast.classList.add("toast-show");
  });

  setTimeout(() => {
    toast.classList.remove("toast-show");
    setTimeout(() => {
      if (document.body.contains(toast)) {
        document.body.removeChild(toast);
      }
    }, 400);
  }, 3000);
}`;

posEngine = posEngine.replace(oldShowToastRegex, newShowToast);
fs.writeFileSync('static/js/pos-engine.js', posEngine, 'utf8');
