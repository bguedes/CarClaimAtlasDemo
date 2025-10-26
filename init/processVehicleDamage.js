require('dotenv').config();
const { MongoClient } = require('mongodb');
const { processImage, estimateCost, encodeImage } = require('./describeImagesInitial');
const { getEmbedding } = require('./generateEmbeddings');
const { dbConnectionString } = require('./db_config');
const fs = require('fs');
const path = require('path');

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function processAllImages() {

  const mongoClient = new MongoClient(dbConnectionString);
  
  try {
    await mongoClient.connect();
    const db = mongoClient.db(process.env.DB_NAME);
    const collection = db.collection(process.env.COLLECTION_NAME);

    const datasetPath = "./dataset";
    const images = fs.readdirSync(datasetPath);

    for (const imagePath of images) {
      const existingDoc = await collection.findOne({ "image_path": imagePath });
      
      if (!existingDoc) {
        console.log(`Processing ${imagePath}...`);
        
        // 1. Encoder l'image en base64
        const relativePath = path.join(datasetPath, imagePath);
        const base64Image = encodeImage(relativePath);
        
        // 2. Générer la description avec OpenAI Vision
        const imageData = await processImage(base64Image);
        
        // 3. Estimer le coût
        imageData.cost_estimate = estimateCost(imageData.severity);
        
        // 4. Générer l'embedding
        const embeddingResponse = await getEmbedding(imageData.description);
        imageData.embedding = embeddingResponse.embeddings[0];
        
        // 5. Préparer le document final
        imageData.image_path = imagePath;
        imageData.image_base64 = base64Image;
        
        // 6. Insérer dans MongoDB
        await collection.insertOne(imageData);
        
        console.log(`✅ Completed processing: ${imagePath}`);
        console.log(`   - Title: ${imageData.title}`);
        console.log(`   - Severity: ${imageData.severity}`);
        console.log(`   - Description: ${imageData.description}`);
        console.log(`   - Cost: $${imageData.cost_estimate}`);
        
      } else {
        console.log(`⏭️  ${imagePath} already exists in database`);
      }
    }
    
    console.log("🎉 All images processed successfully!");
    
  } catch (error) {
    console.error("❌ Error processing images:", error);
  } finally {
    await mongoClient.close();
  }
}

async function createVectorIndex() {

  const mongoClient = new MongoClient(dbConnectionString);

  try {
    await mongoClient.connect();
    const collection = mongoClient.db(process.env.DB_NAME).collection(process.env.COLLECTION_NAME);

    await collection.createSearchIndex({
      name: "semantic_search_description",
      type: "vectorSearch",
      definition: {
        fields: [
          {
            type: "vector",
            path: "embedding",
            numDimensions: 1024,
            similarity: "dotProduct"
          }
        ]
      }
    });
    console.log("Index vector Search créé !");
  } finally {
    await mongoClient.close();
  }
}

async function createFullTextIndex() {

  const mongoClient = new MongoClient(dbConnectionString);

  try {
    await mongoClient.connect();
    const collection = mongoClient.db(process.env.DB_NAME).collection(process.env.COLLECTION_NAME);

    await collection.createSearchIndex({
      name: "description_index",
      definition: {
        mappings: {
          fields: {
            description: {
              type: "string"
            }
          }
        }
      }
    });
    console.log("Index full text créé !");
  } finally {
    await mongoClient.close();
  }
}

async function ensureDatabaseAndCollection() {

  console.log("Creating database and collection.");

  const mongoClient = new MongoClient(dbConnectionString);

  await mongoClient.connect();

  // Vérifier si la base existe
  const adminDb = mongoClient.db().admin();
  const dbs = await adminDb.listDatabases();
  const dbExists = dbs.databases.some(db => db.name === process.env.DB_NAME);

  const db = mongoClient.db(process.env.DB_NAME);
  let collectionExists = false;

  if (dbExists) {
    // Vérifier si la collection existe
    const collections = await db.listCollections({ name: process.env.COLLECTION_NAME }).toArray();
    collectionExists = collections.length > 0;
    if (!collectionExists) {
      await db.createCollection(process.env.COLLECTION_NAME);
      console.log(`Collection '${process.env.COLLECTION_NAME}' created in database '${process.env.DB_NAME}'.`);
    } else {
      console.log(`Database '${process.env.DB_NAME}' and collection '${process.env.COLLECTION_NAME}' already exists.`);
    }
  } else {
    // La base n’existe pas. Créer la collection va créer la base.
    await db.createCollection(process.env.COLLECTION_NAME);
    console.log(`Database '${process.env.DB_NAME}' and collection '${process.env.COLLECTION_NAME}' created.`);   
  }

  await delay(1000);

  createVectorIndex();
  createFullTextIndex();

  await mongoClient.close();
}



if (require.main === module) {
  ensureDatabaseAndCollection();
  processAllImages();
}
