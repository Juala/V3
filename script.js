// Minimal JS changes: capture image paste into textarea, detect image-generation commands,
// and call backend endpoints implemented in api/ai.js. Layout, buttons, and appearance unchanged.

const API_BASE = "/.netlify/functions/ai"; // netlify function entry
let conversationHistory = [];

const textarea = document.getElementById("user-input");
textarea.addEventListener("input", () => {
  textarea.style.height = "auto";
  textarea.style.height = textarea.scrollHeight + "px";
});

// handle paste (image paste)
textarea.addEventListener("paste", async (ev) => {
  const items = (ev.clipboardData || ev.originalEvent.clipboardData).items;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.type.indexOf("image") !== -1) {
      const file = item.getAsFile();
      // if there's existing text in textarea, treat as question for the image (VQA)
      const question = textarea.value.trim();
      addMessage("Mengirim gambar...", "user");
      const arrayBuffer = await file.arrayBuffer();
      const res = await fetch(API_BASE + "?action=vqa&q=" + encodeURIComponent(question), {
        method: "POST",
        headers: {
          // send binary image as body; Netlify/Serverless will receive as base64
        },
        body: arrayBuffer
      });
      const data = await res.json();
      addMessage(data.reply || "Tidak ada jawaban", "bot");
      // clear textarea
      textarea.value = "";
      return;
    }
  }
});

async function sendMessage() {
  const input = document.getElementById("user-input");
  const message = input.value.trim();
  if (!message) return;

  // detect image generation commands, e.g. starts with "buatkan gambar:" or "/gambar "
  const genMatch = message.match(/^(?:buatkan gambar:|/gambar |/gen |gambar:)(.*)/i);
  if (genMatch) {
    const prompt = (genMatch[1] || "").trim() || message;
    addMessage("Membuat gambar... (memakai layanan gratis Hugging Face)", "user");
    try {
      const res = await fetch(API_BASE + "?action=generate&prompt=" + encodeURIComponent(prompt), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt })
      });
      const data = await res.json();
      if (data.image) {
        // data.image could be a data URL or JSON with base64; try to display
        let imgSrc = data.image;
        if (typeof imgSrc === "string" && imgSrc.startsWith("{")) {
          // JSON string: try parse and find base64 fields
          try {
            const j = JSON.parse(imgSrc);
            // heuristics to find base64 image or url
            if (j[0] && j[0].generated_image) imgSrc = j[0].generated_image;
            else if (j.image_base64) imgSrc = j.image_base64;
            else if (j.data && j.data[0] && j.data[0].url) imgSrc = j.data[0].url;
            else imgSrc = JSON.stringify(j);
          } catch(e) {
            imgSrc = imgSrc;
          }
        }
        addImageMessage(imgSrc, "bot");
      } else {
        addMessage("Gagal membuat gambar.", "bot");
      }
    } catch (err) {
      addMessage("Error membuat gambar: " + err.message, "bot");
    }
    input.value = "";
    return;
  }

  addMessage(message, "user");
  conversationHistory.push({ role: "user", text: message });

  // send to backend chat
  try {
    const res = await fetch(API_BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message })
    });
    const data = await res.json();
    addMessage(data.reply || "Maaf, tidak ada jawaban.", "bot");
  } catch (err) {
    addMessage("❌ Terjadi error saat mengirim pesan: " + err.message, "bot");
  }
  input.value = "";
}

function addMessage(text, who) {
  const container = document.getElementById("chat");
  const div = document.createElement("div");
  div.className = "message " + (who === "user" ? "user-msg" : "bot-msg");
  const content = document.createElement("div");
  content.className = "content";
  content.innerText = text;
  div.appendChild(content);
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function addImageMessage(src, who) {
  const container = document.getElementById("chat");
  const div = document.createElement("div");
  div.className = "message " + (who === "user" ? "user-msg" : "bot-msg");
  const img = document.createElement("img");
  img.src = src;
  img.style.maxWidth = "90%";
  img.style.borderRadius = "8px";
  div.appendChild(img);
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

// keep existing helper (typing effect) if present in original project; simplified here
