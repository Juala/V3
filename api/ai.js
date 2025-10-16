export default async function handler(req, res) {
  try {
    const HF_TOKEN = process.env.HF_TOKEN;
    const { message, imageBase64 } = await req.json();

    // Helper fetch function
    async function query(model, body, isImage = false) {
      const response = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
        headers: {
          Authorization: `Bearer ${HF_TOKEN}`,
          "Content-Type": isImage ? "application/octet-stream" : "application/json"
        },
        method: "POST",
        body: isImage ? body : JSON.stringify(body)
      });
      if (!response.ok) throw new Error(`Model error: ${response.statusText}`);
      return isImage ? response.blob() : response.json();
    }

    // === TEXT → IMAGE ===
    if (message?.toLowerCase().startsWith("buatkan gambar") || message?.toLowerCase().startsWith("gambar")) {
      const prompt = message.replace(/buatkan gambar:?|gambar:?/i, "").trim();
      const imgResponse = await query("stabilityai/stable-diffusion-2", { inputs: prompt });
      const imageBuffer = await imgResponse.arrayBuffer();
      const base64Image = Buffer.from(imageBuffer).toString("base64");
      return res.status(200).json({
        type: "image",
        content: `data:image/png;base64,${base64Image}`
      });
    }

    // === IMAGE + QUESTION (VQA) ===
    if (imageBase64 && message) {
      const imgBuffer = Buffer.from(imageBase64.split(",")[1], "base64");
      const response = await query("Salesforce/blip-vqa-base", { inputs: { image: imgBuffer, question: message } });
      return res.status(200).json({
        type: "text",
        content: response[0]?.generated_text || "Aku tidak yakin apa yang ada di gambar itu."
      });
    }

    // === IMAGE ONLY (CAPTIONING) ===
    if (imageBase64 && !message) {
      const imgBuffer = Buffer.from(imageBase64.split(",")[1], "base64");
      const response = await query("Salesforce/blip-image-captioning-large", imgBuffer, true);
      return res.status(200).json({
        type: "text",
        content: response[0]?.generated_text || "Aku tidak bisa membuat deskripsi gambar itu."
      });
    }

    // === TEXT CHAT FALLBACK ===
    const chatResponse = await query("facebook/blenderbot-400M-distill", { inputs: message || "Halo" });
    res.status(200).json({
      type: "text",
      content: chatResponse[0]?.generated_text || "Aku tidak yakin harus menjawab apa."
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}
