import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import multer from "multer";
import { notFound, errorHandler } from "./middleware/errorMiddleware.js";
import { connectDB } from "./config/db.js";
import claimRoutes from "./routes/claimRoutes.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 9090;

// Middleware
//app.use(cors());
app.use(cors({ origin: "http://localhost:8080" }));
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Configuration multer pour l'upload d'images
const upload = multer({ storage: multer.memoryStorage() });

// Routes
app.use("/api", claimRoutes);

// Middleware d'erreur
app.use(notFound);
app.use(errorHandler);

// Démarrage du serveur après connexion à la base de données
const startServer = async () => {
  try {
    await connectDB();
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
};

startServer();
