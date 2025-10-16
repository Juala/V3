// netlify/functions/ai.js
// Unified handler: text chat, image captioning, visual QA, and image generation using Hugging Face Inference API.
// Requires environment variable HUGGINGFACE_TOKEN set to a (free-tier) Hugging Face API token.
const fetch = require("node-fetch");
const FormData = require("form-data");

const HF_TOKEN = process.env.HUGGINGFACE_TOKEN || "";

async function hfImageCaption(imageBuffer) {
  const url = "https://api-inference.huggingface.co/models/Salesforce/blip-image-captioning-large";
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${HF_TOKEN}`,
      // note: content-type omitted for binary
    },
    body: imageBuffer
  });
  if (!res.ok) throw new Error(`HF caption failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  // many HF image-to-text models return an array with a 'generated_text' or a plain string
  if (Array.isArray(data) && data.length && data[0].generated_text) return data[0].generated_text;
  if (data && data.generated_text) return data.generated_text;
  if (typeof data === "string") return data;
  // fallback: try to stringify
  return JSON.stringify(data);
}

async function hfTextGeneration(prompt) {
  const url = "https://api-inference.huggingface.co/models/gpt2";
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${HF_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ inputs: prompt })
  });
  if (!res.ok) throw new Error(`HF text-gen failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  // data is usually [{generated_text: "..."}]
  if (Array.isArray(data) && data.length && data[0].generated_text) return data[0].generated_text;
  if (typeof data === "string") return data;
  return JSON.stringify(data);
}

async function hfImageGeneration(prompt) {
  // Use a text-to-image model on HF (Stable Diffusion family). The inference API often returns binary image.
  // Model can be changed by environment variable; using stabilityai/stable-diffusion-2 for general availability.
  const model = process.env.HF_IMAGE_MODEL || "stabilityai/stable-diffusion-2";
  const url = `https://api-inference.huggingface.co/models/${model}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${HF_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ inputs: prompt })
  });
  if (!res.ok) throw new Error(`HF image-gen failed: ${res.status} ${await res.text()}`);
  // If response is JSON pointing to data or base64, return accordingly. If binary, convert to base64.
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const j = await res.json();
    // Many TTI models on HF return { "generated_image": "<base64...>" } or an array with urls. Return stringified JSON for frontend to handle.
    return JSON.stringify(j);
  } else {
    const arrayBuffer = await res.arrayBuffer();
    const b64 = Buffer.from(arrayBuffer).toString("base64");
    // Return as data URL (png assumed)
    return `data:image/png;base64,${b64}`;
  }
}

exports.handler = async function(event, context) {
  try {
    const method = event.httpMethod || "POST";
    // support both form-data and json; event.body may be base64 encoded when using binary.
    const query = (event.queryStringParameters) || {};
    const action = query.action || (event.headers && event.headers["x-action"]) || "chat";

    if (action === "caption" || action === "vqa" || action === "generate") {
      // handle multipart/form-data coming from browser: Netlify passes body as base64 string in event.body if binary
      // We'll try to detect base64 and decode raw bytes (this works with the current frontend that sends FormData as fetch body)
      let imageBuffer = null;
      if (event.isBase64Encoded && event.body) {
        imageBuffer = Buffer.from(event.body, "base64");
      } else if (event.body) {
        // event.body might be raw binary string; treat as utf8 fallback
        imageBuffer = Buffer.from(event.body, "utf8");
      }

      // If frontend used fetch with FormData, the netlify function receives the raw multipart body; easier approach:
      // The frontend will send the image directly as the request body (not multipart) to simplify handling.
      // Here we assume body is the binary image buffer when action in [caption,vqa]
      if (!imageBuffer) {
        return { statusCode: 400, body: JSON.stringify({ error: "No image received" }) };
      }

      if (action === "caption") {
        const caption = await hfImageCaption(imageBuffer);
        return { statusCode: 200, body: JSON.stringify({ reply: caption }) };
      }

      if (action === "vqa") {
        const question = query.q || ((event.queryStringParameters||{}).q) || JSON.parse(event.body || "{}").question || "";
        const caption = await hfImageCaption(imageBuffer);
        // combine caption + question and ask text-generation model for an answer
        const prompt = `Deskripsi gambar: ${caption}\n\nPertanyaan: ${question}\nJawaban singkat dan jelas:`;
        const answer = await hfTextGeneration(prompt);
        return { statusCode: 200, body: JSON.stringify({ reply: answer, caption }) };
      }

      if (action === "generate") {
        const prompt = query.prompt || (JSON.parse(event.body || "{}").prompt || "");
        if (!prompt) return { statusCode: 400, body: JSON.stringify({ error: "No prompt for image generation" }) };
        const img = await hfImageGeneration(prompt);
        return { statusCode: 200, body: JSON.stringify({ image: img }) };
      }
    }

    // Default: simple text chat using Hugging Face text generation model (gpt2 by default).
    const body = event.body ? JSON.parse(event.body) : {};
    const message = body.message || "";
    if (!message) return { statusCode: 400, body: JSON.stringify({ reply: "Tidak ada pesan" }) };

    const reply = await hfTextGeneration(message);
    return { statusCode: 200, body: JSON.stringify({ reply }) };

  } catch (err) {
    console.error("Error in handler:", err);
    return { statusCode: 500, body: JSON.stringify({ reply: "❌ Terjadi error: " + String(err.message) }) };
  }
};
