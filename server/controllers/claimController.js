import dotenv from "dotenv";
import asyncHandler from "../middleware/asyncHandler.js";
import OpenAI from "openai";
import { MongoClient, ObjectId } from "mongodb";
import axios from "axios";
//const axios = require("axios");

dotenv.config();

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL;
const LLM_MODEL = process.env.LLM_MODEL;
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL;

// Import de la configuration de la base de données
let db, vehicleDamageCollection, unhandledClaimsCollection;

// Configuration OpenAI
//const openai = new OpenAI({
//  apiKey: process.env.OPENAI_API_KEY,
//});

// Fonction d'initialisation des collections (appelée depuis db.js)
export const initializeCollections = (
  database,
  vehicleCollection,
  claimsCollection
) => {
  db = database;
  vehicleDamageCollection = vehicleCollection;
  unhandledClaimsCollection = claimsCollection;
};

async function generateEmbedding(damageDescription) {
  try {
    //For OpenAI
    //const response = await openai.embeddings.create({
    //  model: process.env.OPENAI_MODEL,
    //  input: damageDescription,
    //});
    
    //return response.data[0].embedding;

    //For Ollama
    const response = await axios.post(`${OLLAMA_BASE_URL}/api/embed`, {
      model: EMBEDDING_MODEL,
      input: damageDescription
    });

    // CORRECTION: Extraire le vecteur du bon endroit
    console.log('Ollama embedding response:', response.data);
    
    // La réponse Ollama contient probablement une propriété 'embeddings'
    if (response.data.embeddings && Array.isArray(response.data.embeddings)) {
      return response.data.embeddings; // Premier embedding
    }
    
    // Alternative si la structure est différente
    if (response.data.embedding && Array.isArray(response.data.embedding)) {
      return response.data.embedding;
    }
    
    // Si c'est déjà un array direct (improbable)
    if (Array.isArray(response.data)) {
      return response.data;
    }
    
    throw new Error('Unexpected embedding format from Ollama');
  } catch (error) {
    console.error('Error generating embedding:', error);
    throw error;
  }
}

// Fonction pour analyser l'image avec OpenAI Vision standard
async function analyzeImage(base64Image) {
  try {
    //const response = await openai.chat.completions.create({
    //  model: "gpt-4o", // Modèle Vision OpenAI standard
    //  max_tokens: 300,
    //  messages: [
    //    {
    //      role: "user",
    //      content: [
    //        {
    //          type: "text",
    //          text: "Can you describe the damage to the vehicle, including a title and the severity (categorized as low, medium or high)? Please return json instead of text. The json structure should use the headings 'title', 'description', and 'severity'.",
    //        },
    //        {
    //          type: "image_url",
    //          image_url: { url: `data:image/jpeg;base64,${base64Image}` },
    //        },
    //      ],
    //    },
    //  ],
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
    
//      prompt: `Analyze this vehicle damage image and respond ONLY with valid JSON in this exact format:
//      {
//        "title": "Brief damage title",
//        "description": "Detailed damage description", 
//        "severity": "low"
//     }
//    
//      The severity must be exactly one of: "low", "medium", or "high".
//      Do not include any text outside the JSON object.`,
      images: [base64Image],
      // ✅ Options d'optimisation M1
      options: {
        gpu: true,
        num_thread: 8,           // Utiliser tous les cœurs
        //num_ctx: 1024,          // Contexte suffisant mais pas excessif
        //repeat_penalty: 1.1,     // Éviter répétitions
        temperature: 0.7,        // Plus déterministe = plus rapide
        top_k: 20,              // Limiter choix = plus rapide
        top_p: 0.8,
        MinP: 0,
        //num_predict: 100,    // Limiter la réponse
        //repeat_penalty: 1.1
      },
      format: "json",
      stream: false,
      //timeout: 60000  // 60 secondes
    });

    //Pour OpenAI
    //let content = response.choices[0].message.content;
    console.log('response.data.response : ', response.data.response);
    let content = response.data.response; 
    
    content = content
      .replace(/```json\s*/gi, "")
      .replace(/```\s*/g, "")
      .replace(/^\s*`+/gm, "")
      .replace(/`+\s*$/gm, "")
      .replace(/^\s*[\r\n]+/gm, "")
      .trim();

    console.log("Contenu nettoyé:", content); 

    // Vérification avant parsing
    if (!content.startsWith("{") || !content.endsWith("}")) {
      throw new Error(
        `Le contenu ne semble pas être un JSON valide: ${content.substring(
          0,
          100
        )}...`
      );
    }
    
    const parsedResponse = JSON.parse(content);

    console.log('parsedResponse : ', parsedResponse);
    console.log('description:', parsedResponse.description);
    
    //return {
    //  description: parsedResponse.description,
    //severity: parsedResponse.severity.toLowerCase(),
    parsedResponse.severity = parsedResponse.severity.toLowerCase();
    //  title: parsedResponse.title
    //};
    return parsedResponse;
  } catch (error) {
    console.error('Error analyzing image:', error);
    throw new Error(`Failed to get description from LLM: ${error.message}`);
  }
}

// Fonction d'estimation de coût par gravité
function estimateCostBySeverity(severity) {
  switch (severity) {
    case "low":
      return Math.floor(Math.random() * (1500 - 300 + 1)) + 300;
    case "medium":
      return Math.floor(Math.random() * (5000 - 1000 + 1)) + 1000;
    case "high":
      return Math.floor(Math.random() * (20000 - 3000 + 1)) + 3000;
    default:
      return 1000;
  }
}

// @desc Create a car claim with image analysis (OpenAI standard)
// @route POST /api/createClaim
// @access Public
const createClaim = asyncHandler(async (req, res) => {
  try {
    // Vérification de la connexion à la base de données
    if (!vehicleDamageCollection) {
      return res.status(503).json({ 
        success: false,
        error: 'Database not connected' 
      });
    }

    // Extraire l'image base64 du body
    let base64Image;
    if (typeof req.body === 'string') {
      base64Image = JSON.parse(req.body);
    } else if (req.body && req.body.image) {
      base64Image = req.body.image.replace(/^data:image\/\w+;base64,/, "");
    } else {
      base64Image = req.body;
    }

    console.log('Processing base64 image with OpenAI standard...');

    // 1. Analyser l'image avec OpenAI Vision
    const imageAnalysis = await analyzeImage(base64Image);
    const { description, severity, title } = imageAnalysis;

    console.log('Image analysis completed:', { description, severity, title });

    // 2. Générer l'embedding pour la description
    const embedding = await generateEmbedding(description);
    console.log('Generated embedding for description');

    // 3. Recherche vectorielle pour trouver des réclamations similaires
    const pipeline = [
      {
        $vectorSearch: {
          index: "vector_claim",
          path: "embedding",
          queryVector: embedding,
          numCandidates: 200,
          limit: 3,
        },
      },
      {
        $project: {
          _id: 0,
          description: 1,
          severity: 1,
          score: { $meta: "vectorSearchScore" },
          cost_estimate: 1,
        },
      },
    ];

    let searchResult = [];
    try {
      searchResult = await vehicleDamageCollection.aggregate(pipeline).toArray();
      console.log(`Found ${searchResult.length} similar claims`);
    } catch (err) {
      console.log("Error occurred while executing vector search:", err.message);
      // Continue sans les résultats similaires
    }

    // 4. Calculer le coût moyen basé sur les réclamations similaires
    let avgCostEstimate = 1000; // Valeur par défaut
    
    if (searchResult && searchResult.length > 0) {
      const totalCost = searchResult
        .map(item => item.cost_estimate || 1000)
        .reduce((acc, current) => acc + current, 0);
      avgCostEstimate = totalCost / searchResult.length;
    } else {
      // Estimation basée sur la gravité si pas de résultats similaires
      switch(severity) {
        case "low":
          avgCostEstimate = Math.floor(Math.random() * (1500 - 300 + 1)) + 300;
          break;
        case "medium":
          avgCostEstimate = Math.floor(Math.random() * (5000 - 1000 + 1)) + 1000;
          break;
        case "high":
          avgCostEstimate = Math.floor(Math.random() * (20000 - 3000 + 1)) + 3000;
          break;
      }
    }

    // 5. Sauvegarder la nouvelle réclamation dans la base de données
    const claimDocument = {
      title,
      description,
      severity,
      embedding,
      cost_estimate: Math.round(avgCostEstimate),
      image_base64: base64Image,
      image_path: `claim_${Date.now()}.jpg`,
      createdAt: new Date(),
      processed: true,
      similar_claims: searchResult,
      analysis_source: "openai_standard" // Marqueur pour différencier
    };

    //const insertResult = await vehicleDamageCollection.insertOne(claimDocument);
    //console.log('Claim saved with ID:', insertResult.insertedId);

    // 6. Réponse de succès (format compatible avec votre frontend)
    res.status(200).json({
      //message: "Image processed and description generated successfully",
      title,
      description,
      severity,
      //damage_location,
      //estimated_parts,
      cost_estimate: Math.round(avgCostEstimate),
      embedding,
      //claimId: insertResult.insertedId,
      similar_claims: searchResult
    });

  } catch (error) {
    console.error("Error in createClaim:", error);
    
    // Gestion d'erreurs spécifique OpenAI
    if (error.message.includes('OpenAI')) {
      return res.status(502).json({
        success: false,
        error: `OpenAI API Error: ${error.message}`
      });
    }
    
    if (error.message.includes('Failed to get description from OpenAI')) {
      return res.status(502).json({
        success: false,
        error: error.message
      });
    }
    
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});


// @desc Get similar claims based on embedding
// @route POST /api/getSimilarClaims
// @access Public
const getSimilarClaims = asyncHandler(async (req, res) => {
  try {
    if (!vehicleDamageCollection) {
      return res.status(503).json({ error: "Database not connected" });
    }

    const { embedding, skip = 0, limit = 3 } = req.body;

    console.log(`getSimilarClaims - embedding : ${embedding} used for the vector search`);

    const pipeline = [
      {
        $vectorSearch: {
          index: "semantic_search_description",
          path: "embedding",
          queryVector: embedding,
          numCandidates: 200,
          limit: limit,
        },
      },
      {
        $project: {
          _id: 0,
          description: 1,
          severity: 1,
          title: 1,
          cost_estimate: 1,
          image_base64: 1,
          score: { $meta: "vectorSearchScore" },
        },
      },
      { $skip: skip },
    ];

    const searchResult = await vehicleDamageCollection
      .aggregate(pipeline)
      .toArray();

    console.log(`getSimilarClaims - searchResult : ${searchResult} similar claims`);

    res.status(200).json({
      success: true,
      result: searchResult,
    });
  } catch (error) {
    console.error("Error in getSimilarClaims:", error);
    res.status(500).json({ error: error.message });
  }
});



// @desc Find claim by text search
// @route POST /api/similarClaims
// @access Public
const findClaim = asyncHandler(async (req, res) => {
  try {
    if (!vehicleDamageCollection) {
      return res.status(503).json({ error: "Database not connected" });
    }

    const searchTerm = req.body.searchTerm || req.body;

    const embedding = await generateEmbedding(searchTerm);
    //console.log('Generated embedding for searchTerm : ', embedding[0]);

    //const pipeline = [
    //  {
    //    $search: {
    //      index: "findClaim",
    //      text: {
    //        query: searchTerm,
    //        path: "description",
    //      },
    //    },
    //  },
    //  {
    //    $match: {
    //      embedding: { $exists: true },
    //    },
    //  },
    //  { $limit: 5 },
    //];


    const pipeline = [
      {
        $rankFusion: {
            input: {
              pipelines: {
                  searchOne: [
                      {
                        $vectorSearch: {
                          index: "semantic_search_description",
                          path: "embedding",
                          queryVector: embedding[0],
                          numCandidates: 200,
                          limit: 5,
                        }
                      }
                  ],
                  searchTwo: [
                      {
                        $search: {
                          index: "description_index",
                          text: {
                            query: searchTerm,
                            path: "description",
                          },
                        },
                      },
                      {
                        $match: {
                          embedding: { $exists: true },
                        },
                      }
                  ],
              }
            }
        }
      },
      { $limit: 7 }
    ];


    const result = await vehicleDamageCollection.aggregate(pipeline).toArray();

    //console.log(`findClaim - searchResult : ${result} similar claims`);
    //console.log(`First findClaim - searchResult : ${result[0]} similar claims`);

    res.status(200).json({
      success: true,
      result,
    });
  } catch (error) {
    console.error("Error in findClaim:", error);
    res.status(500).json({ error: error.message });
  }
});



// @desc Submit a new claim for review
// @route POST /api/submitClaim
// @access Public
const submitClaim = asyncHandler(async (req, res) => {
  try {
    if (!unhandledClaimsCollection) {
      return res.status(503).json({ error: "Database not connected" });
    }

    const claimData = req.body;
    claimData.handled = false;
    claimData.createdAt = new Date();
    claimData.status = "pending";

    //const result = await unhandledClaimsCollection.insertOne(claimData);

    //const insertResult = await vehicleDamageCollection.insertOne(claimDocument);
    const result = await unhandledClaimsCollection.insertOne(claimData);
    console.log('Claim saved with ID:', result.insertedId);

    res.status(200).json({
      success: true,
      message: "Claim submitted successfully",
      insertedId: result.insertedId,
    });
  } catch (error) {
    console.error("Error in submitClaim:", error);
    res.status(500).json({ error: error.message });
  }
});



// @desc Get all unhandled claims
// @route GET /api/unhandledClaims
// @access Public
const getUnhandledClaims = asyncHandler(async (req, res) => {
  try {
    if (!unhandledClaimsCollection) {
      return res.status(503).json({ error: "Database not connected" });
    }

    const result = await unhandledClaimsCollection.find({}).toArray();

    console.error("getUnhandledClaims - result : ", result);

    res.status(200).json({
      success: true,
      result,
    });
  } catch (error) {
    console.error("Error in getUnhandledClaims:", error);
    res.status(500).json({ error: error.message });
  }
});


// @desc Update claim status to handled
// @route PUT /api/updateClaim
// @access Public
const updateClaim = asyncHandler(async (req, res) => {
  try {
    if (!unhandledClaimsCollection) {
      return res.status(503).json({ error: "Database not connected" });
    }

    const { id } = req.body;

    const filter = { _id: new ObjectId(id) };
    const update = {
      $set: {
        handled: true,
        updatedAt: new Date(),
        status: "processed",
      },
    };

    const result = await unhandledClaimsCollection.updateOne(filter, update);

    res.status(200).json({
      success: true,
      message: "Claim updated successfully",
      modifiedCount: result.modifiedCount,
    });
  } catch (error) {
    console.error("Error in updateClaim:", error);
    res.status(500).json({ error: error.message });
  }
});

export {
  createClaim,
  getSimilarClaims,
  findClaim,
  submitClaim,
  getUnhandledClaims,
  updateClaim,
};
