// === ROJA AI V3 - Versi dengan Upload/Paste Gambar ===
// Tetap mempertahankan tata letak, tombol, dan tampilan UI lama

const API_BASE = "/api/ai"; // endpoint backend Vercel kamu
let conversationHistory = [];
let selectedFileBase64 = null;

const input = document.getElementById("userInput");
const chatBox = document.getElementById("chatBox");

// ==== Tombol Upload Gambar (tanpa ubah tata letak) ====
const uploadBtn = document.createElement("button");
uploadBtn.textContent = "📎";
uploadBtn.title = "Lampirkan Gambar";
uploadBtn.style.marginRight = "6px";
uploadBtn.style.border = "none";
uploadBtn.style.background = "#1f2745";
uploadBtn.style.color = "#fff";
uploadBtn.style.borderRadius = "6px";
uploadBtn.style.cursor = "pointer";
uploadBtn.style.fontSize = "18px";
uploadBtn.style.padding = "4px 8px";

const chatInputBar = document.querySelector(".chat-input");
chatInputBar.insertBefore(uploadBtn, input);

const fileInput = document.createElement("input");
fileInput.type = "file";
fileInput.accept = "image/*";
fileInput.style.display = "none";
chatInputBar.appendChild(fileInput);

uploadBtn.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    selectedFileBase64 = reader.result;
    appendUser("[📎 Gambar dilampirkan]");
  };
  reader.readAsDataURL(file);
});

// ==== Paste gambar langsung (Ctrl+V) ====
input.addEventListener("paste", (e) => {
  const items = e.clipboardData?.items;
  for (const item of items) {
    if (item.type.indexOf("image") !== -1) {
      const file = item.getAsFile();
      const reader = new FileReader();
      reader.onload = () => {
        selectedFileBase64 = reader.result;
        appendUser("[📋 Gambar ditempel]");
      };
      reader.readAsDataURL(file);
      e.preventDefault();
    }
  }
});

// ==== Kirim Pesan ====
async function sendMessage() {
  const message = input.value.trim();
  if (!message && !selectedFileBase64) return;

  appendUser(message || "[Gambar dikirim]");
  input.value = "";

  const typingDiv = appendTyping();

  try {
    let payload = { message };
    if (selectedFileBase64) payload.image = selectedFileBase64;

    // kirim ke backend
    const res = await fetch(API_BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    typingDiv.remove();

    if (data.image) {
      appendImage(data.image);
    } else {
      appendBot(data.reply || "⚠️ Tidak ada respons dari AI.");
    }

  } catch (err) {
    typingDiv.remove();
    appendBot("❌ Gagal memproses permintaan: " + err.message);
  }

  selectedFileBase64 = null;
  fileInput.value = "";
}

// ==== Fungsi Tambahan ====
function appendUser(text) {
  const div = document.createElement("div");
  div.className = "message user";
  div.innerHTML = `${text}<div class='time'>${getTime()}</div>`;
  chatBox.appendChild(div);
  chatBox.scrollTop = chatBox.scrollHeight;
}

function appendBot(text) {
  const div = document.createElement("div");
  div.className = "message bot";
  div.innerHTML = `<div class="markdown">${text}</div><div class='time'>${getTime()}</div>`;
  chatBox.appendChild(div);
  chatBox.scrollTop = chatBox.scrollHeight;
}

function appendTyping() {
  const div = document.createElement("div");
  div.className = "message bot";
  div.innerHTML = `<div class="typing"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div>`;
  chatBox.appendChild(div);
  chatBox.scrollTop = chatBox.scrollHeight;
  return div;
}

function appendImage(base64) {
  const div = document.createElement("div");
  div.className = "message bot";
  const img = document.createElement("img");
  img.src = base64;
  img.style.maxWidth = "80%";
  img.style.borderRadius = "10px";
  img.style.marginTop = "8px";
  div.appendChild(img);
  chatBox.appendChild(div);
  chatBox.scrollTop = chatBox.scrollHeight;
}

function getTime() {
  const now = new Date();
  return now.getHours().toString().padStart(2, '0') + '.' + now.getMinutes().toString().padStart(2, '0');
}

// enter kirim pesan
input.addEventListener("keypress", e => { if (e.key === "Enter") sendMessage(); });
