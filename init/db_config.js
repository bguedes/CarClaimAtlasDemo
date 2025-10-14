require('dotenv').config();

console.log("Tentative de Connexion MongoDB:", process.env.MONGODB_ATLAS_URI);
const dbConnectionString =  process.env.MONGODB_ATLAS_URI

module.exports = { dbConnectionString };
