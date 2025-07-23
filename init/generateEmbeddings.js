require('dotenv').config();
const { MongoClient } = require('mongodb');
const OpenAI = require('openai'); // ✅ Import OpenAI standard
const { dbConnectionString } = require('./db_config');

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, // ✅ Utilise OPENAI_API_KEY
});

async function getEmbedding(damageDescription) {
  /**
   * Get the vector embedding for the damage description.
   */
  const response = await client.embeddings.create({
    input: [damageDescription], 
    model: "text-embedding-ada-002" // ✅ Modèle OpenAI standard
  });
  return response;
}

async function main() {
  /**
   * Generate embeddings for the damage descriptions.
   */
  const mongoClient = new MongoClient(dbConnectionString);
  
  try {
    await mongoClient.connect();
    const db = mongoClient.db(process.env.DB_NAME);
    const collection = db.collection(process.env.COLLECTION_NAME);

    const documents = await collection.find({}).toArray();
    
    for (const document of documents) {
      const embedding = document.embedding;
      
      if (!embedding) {
        const damageDescription = document.description;
        const embeddingResponse = await getEmbedding(damageDescription);
        const embeddingVector = embeddingResponse.data[0].embedding;
        
        await collection.updateOne(
          { "_id": document._id }, 
          { "$set": { "embedding": embeddingVector } }
        );
        
        console.log("Embedding generated for:", document.image_path);
      } else {
        console.log(`Embedding for ${document.image_path} already exists. Skipping.`);
      }
    }
  } finally {
    await mongoClient.close();
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { getEmbedding };
