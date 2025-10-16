export default async function handler(req, res) {
  try {
    const HF_TOKEN = process.env.HF_TOKEN;
    if (!HF_TOKEN) throw new Error("❌ HF_TOKEN belum diatur di environment variable!");

    const { message, imageBase64 } = req.body || {};

    // Helper: panggil model Hugging Face API
    async function query(model, body, isImage = false) {
      const response = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
        headers: {
          Authorization: `Bearer ${HF_TOKEN}`,
          "Content-Type": isImage ? "application/octet-stream" : "application/json"
        },
        method: "POST",
        body: isImage ? body : JSON.stringify(body)
      });

      if (!response.ok) {
        const txt = await response.text();
        throw new Error(`Model ${model} error: ${txt}`);
      }

      // Image model returns blob, text models return JSON
      try {
        return isImage ? await response.blob() : await response.json();
      } catch (e) {
        return await response.text();
      }
    }

    // === CASE 1: TEXT → IMAGE ===
    if (message?.toLowerCase().startsWith("buatkan gambar") || message?.toLowerCase().startsWith("gambar")) {
      const prompt = message.replace(/buatkan gambar:?|gambar:?/i, "").trim() || "ilustrasi pemandangan indah";
      const imgResponse = await query("stabilityai/stable-diffusion-2", { inputs: prompt });
      const arrBuf = await imgResponse.arrayBuffer();
      const base64 = Buffer.from(arrBuf).toString("base64");

      return res.status(200).json({
        type: "image",
        content: `data:image/png;base64,${base64}`
      });
    }

    // === CASE 2: IMAGE + QUESTION (VQA) ===
    if (imageBase64 && message) {
      const imgBuffer = Buffer.from(imageBase64.split(",")[1], "base64");
      const response = await query("Salesforce/blip-vqa-base", {
        inputs: {
          image: imgBuffer,
          question: message
        }
      });
      return res.status(200).json({
        type: "text",
        content: response[0]?.generated_text || "Aku tidak yakin dengan isi gambar itu."
      });
    }

    // === CASE 3: IMAGE ONLY (CAPTIONING) ===
    if (imageBase64 && !message) {
      const imgBuffer = Buffer.from(imageBase64.split(",")[1], "base64");
      const response = await query("Salesforce/blip-image-captioning-large", imgBuffer, true);
      return res.status(200).json({
        type: "text",
        content: response[0]?.generated_text || "Aku tidak bisa mendeskripsikan gambar itu."
      });
    }

    // === CASE 4: TEXT CHAT FALLBACK ===
    const chatResponse = await query("facebook/blenderbot-400M-distill", { inputs: message || "Halo!" });
    return res.status(200).json({
      type: "text",
      content: chatResponse[0]?.generated_text || "Aku tidak yakin harus menjawab apa."
    });

  } catch (err) {
    console.error("AI.js Error:", err);
    res.status(500).json({ error: err.message });
  }
}
