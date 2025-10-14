require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { MongoClient } = require("mongodb");
const OpenAI = require("openai"); // ✅ Import OpenAI standard
const { dbConnectionString } = require("./db_config");
const axios = require("axios");

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL;
const LLM_MODEL=process.env.LLM_MODEL;

//const client = new OpenAI({
//  apiKey: process.env.OPENAI_API_KEY, // ✅ Utilise OPENAI_API_KEY
//});

function encodeImage(imagePath) {
  /**
   * Encode the image as a base64 string.
   */
  const imageFile = fs.readFileSync(imagePath);
  return Buffer.from(imageFile).toString("base64");
}

async function processImage(base64Image) {
  /**
   * Process the image using the OpenAI API and return the response as a JSON object.
   */
  //const response = await client.chat.completions.create({
  //  model: process.env.LLM_MODEL,
  //  messages: [
  //    {
  //      role: "user",
  //      content: [
  //        {
  //          type: "text",
  //          text:
  //            "Can you describe the damage to the vehicle, including a title and the severity " +
  //            "(categorized as low, medium or high)? Please return json instead of text. The " +
  //            "json structure should use the headings 'title', 'description', and 'severity'.",
  //        },
  //        {
  //          type: "image_url",
  //          image_url: {
  //            url: `data:image/jpeg;base64,${base64Image}`,
  //          },
  //        },
  //      ],
  //    },
  //  ],
  //  max_tokens: 1000,
  //});

  const response = await axios.post(`${OLLAMA_BASE_URL}/api/generate`, {
    model: LLM_MODEL,
    //prompt: "Can you describe the damage to the vehicle, including a title and the severity " +
    //        "(categorized as low, medium or high)? Please return json instead of text. The " +
    //        "json structure should use the headings 'title', 'description', and 'severity'.",
    //images: [base64Image],
      //format: "json",
    //stream: false
  //});

//    prompt: `Analyze this vehicle damage image and respond ONLY with valid JSON in this exact format:
//{
//  "title": "Brief damage title",
//  "description": "Detailed damage description", 
//  "severity": "low"
//}

//The severity must be exactly one of: "low", "medium", or "high".
//Do not include any text outside the JSON object.`,


      prompt: `You are an automotive damage assessment expert. Analyze this vehicle accident image and respond ONLY with valid JSON in this exact format:

{
  "title": "Concise damage title",
  "description": "Detailed technical description",
  "severity": "low",
  "damage_location": "Affected area(s)",
  "estimated_parts": ["List of potentially damaged parts"]
}

For the description, mandatory include:
- Precise damage location (front/rear/left side/right side, upper/lower area)
- Type of damage (deformation, scratches, cracks, breakage, detachment)
- Extent of damage (approximate dimensions if visible)
- Affected parts (body panels, lights, bumpers, glass, etc.)
- Signs of structural vs. cosmetic damage only
- Potential impact on safety or functionality

Severity must be exactly: "low", "medium", or "high" based on these criteria:
- low: superficial cosmetic damage, vehicle drivable
- medium: moderate damage affecting aesthetics or minor functionalities
- high: structural damage, safety concerns, vehicle potentially immobilized

Do not include any text outside the JSON object.`,
  images: [base64Image],
  // ✅ Options d'optimisation M1
  options: {
    gpu: true,
    num_thread: 8,           // Utiliser tous les cœurs
    //num_ctx: 4096,          // Contexte suffisant mais pas excessif
    //repeat_penalty: 1.1,     // Éviter répétitions
    temperature: 0.7,        // Plus déterministe = plus rapide
    top_k: 20,              // Limiter choix = plus rapide
    top_p: 0.8,
    MinP: 0,
    //num_predict: 200        // Limiter longueur réponse
  },
  format: "json",
  stream: false
});

  //let content = response.choices[0].message.content;
  let content = response.data.response; 
  // Nettoyer le JSON de la réponse
  //content = content.replace(/``````/g, '').trim();

  content = content
    .replace(/```json\s*/gi, "") // Supprime ```
    .replace(/```\s*/g, "") // Supprime ```
    .replace(/^\s*`+/gm, "") // Supprime les ` en début de ligne
    .replace(/`+\s*$/gm, "") // Supprime les ` en fin de ligne
    .replace(/^\s*[\r\n]+/gm, "") // Supprime les lignes vides
    .trim(); // Supprime les espaces en début/fin

  console.log("Contenu nettoyé:", content); // Pour déboguer

  // Vérification avant parsing
  if (!content.startsWith("{") || !content.endsWith("}")) {
    throw new Error(
      `Le contenu ne semble pas être un JSON valide: ${content.substring(
        0,
        100
      )}...`
    );
  }

  const respJson = JSON.parse(content);
  respJson.severity = respJson.severity.toLowerCase();

  return respJson;
}

function estimateCost(severity) {
  /**
   * Estimate the cost of the damage based on the severity.
   */
  if (severity === "low") {
    return Math.floor(Math.random() * (1500 - 300 + 1)) + 300;
  } else if (severity === "medium") {
    return Math.floor(Math.random() * (5000 - 1000 + 1)) + 1000;
  } else {
    return Math.floor(Math.random() * (20000 - 3000 + 1)) + 3000;
  }
}

async function imageExists(collection, imagePath) {
  /**
   * Check if the image already exists in the database.
   */
  const doc = await collection.findOne({ image_path: imagePath });
  return Boolean(doc);
}

async function main() {
  /**
   * Main function to process the images and store the data in the database.
   */
  const mongoClient = new MongoClient(dbConnectionString);

  try {
    await mongoClient.connect();
    const db = mongoClient.db(process.env.DB_NAME);
    const collection = db.collection(process.env.COLLECTION_NAME);

    const datasetPath = "./dataset";
    const images = fs.readdirSync(datasetPath);

    for (const imagePath of images) {
      if (await imageExists(collection, imagePath)) {
        console.log(`Image ${imagePath} already exists in the database`);
      } else {
        const relativePath = path.join(datasetPath, imagePath);
        const base64Image = encodeImage(relativePath);
        const imageData = await processImage(base64Image);

        imageData.image_path = imagePath;
        imageData.image_base64 = base64Image;
        imageData.cost_estimate = estimateCost(imageData.severity);

        await collection.insertOne(imageData);
        console.log("Processed and inserted:", imageData);
      }
    }
  } finally {
    await mongoClient.close();
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { processImage, estimateCost, encodeImage };
