require('dotenv').config();

const dbConnectionString =  process.env.MONGODB_ATLAS_URI

module.exports = { dbConnectionString };
