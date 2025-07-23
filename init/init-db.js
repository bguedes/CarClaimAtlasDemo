require('dotenv').config();
const { MongoClient } = require('mongodb');
const { OpenAI } = require('openai'); // ou AzureOpenAI si Azure

const mongoUri = process.env.MONGODB_ATLAS_URI; // format mongodb+srv://user:pass@host/db
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function getEmbedding(text) {
  const resp = await openai.embeddings.create({
    model: process.env.OPENAI_MODEL,
    input: [text],
  });
  return resp.data[0].embedding;
}

async function main() {
  const client = new MongoClient(mongoUri);
  try {
    await client.connect();
    const db = client.db("vehicle_damage"); // nom équivalent à vos scripts
    const collection = db.collection("vehicle_damage");

    // ‼️ À adapter à votre format de données source
    const dataset = [
      {
        image_path: "photo1.jpg",
        title: "Impact pare-choc avant",
        description: "Choc léger sur le pare-choc avant.",
        severity: "low",
      },
      // ... autres items
    ];

    for (const doc of dataset) {
      if (!doc.embedding) {
        doc.embedding = await getEmbedding(doc.description);
      }
      // Cost estimate possible ici si besoin (via une fonction JS)
      await collection.insertOne(doc);
      console.log(`Inserted: ${doc.image_path}`);
    }
  } finally {
    await client.close();
  }
}

main().catch(console.error);
