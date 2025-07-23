require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { MongoClient } = require("mongodb");
const OpenAI = require("openai"); // ✅ Import OpenAI standard
const { dbConnectionString } = require("./db_config");

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, // ✅ Utilise OPENAI_API_KEY
});

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
  const response = await client.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text:
              "Can you describe the damage to the vehicle, including a title and the severity " +
              "(categorized as low, medium or high)? Please return json instead of text. The " +
              "json structure should use the headings 'title', 'description', and 'severity'.",
          },
          {
            type: "image_url",
            image_url: {
              url: `data:image/jpeg;base64,${base64Image}`,
            },
          },
        ],
      },
    ],
    max_tokens: 1000,
  });

  let content = response.choices[0].message.content;
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
