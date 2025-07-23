import dotenv from 'dotenv';
import { MongoClient } from 'mongodb';
import { initializeCollections } from '../controllers/claimController.js';

dotenv.config();

const mongoUri = process.env.MONGODB_ATLAS_URI;
let client, db, vehicleDamageCollection, unhandledClaimsCollection;

const connectDB = async () => {
  try {
    // Connexion MongoDB
    client = await MongoClient.connect(mongoUri);
    console.log('✅ Connected to MongoDB Atlas');
    
    // Initialisation de la base de données et des collections
    db = client.db(process.env.DB_NAME);
    vehicleDamageCollection = db.collection(process.env.VEHICLE_DAMAGE_COLLECTION_NAME);
    unhandledClaimsCollection = db.collection(process.env.UNHANDLED_CLAIMS_COLLECTION_NAME);
    
    // Initialiser les collections dans le contrôleur
    initializeCollections(db, vehicleDamageCollection, unhandledClaimsCollection);
    
    return client;
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    throw error;
  }
};

const getDB = () => db;
const getVehicleDamageCollection = () => vehicleDamageCollection;
const getUnhandledClaimsCollection = () => unhandledClaimsCollection;

export { 
  connectDB, 
  getDB, 
  getVehicleDamageCollection, 
  getUnhandledClaimsCollection 
};
export default connectDB;
