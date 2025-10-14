require('dotenv').config();
const { MongoClient } = require('mongodb');
const { processImage, estimateCost, encodeImage } = require('./describeImagesInitial');
const { getEmbedding } = require('./generateEmbeddings');
const { dbConnectionString } = require('./db_config');
const fs = require('fs');
const path = require('path');

async function processAllImages() {
  /**
   * Script principal qui traite toutes les images, génère descriptions, coûts et embeddings
   */
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

if (require.main === module) {
  processAllImages();
}
