
if (typeof File === "undefined") {
    global.File = class {};
}

import express from "express";
import morgan from "morgan";
import path from "path";
import passport from "passport";
import cors from "cors";
import { fileURLToPath } from "url";

// ==============================
// __dirname en ESM
// ==============================

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ==============================
// Passport config
// ==============================

import "./lib/passport.js";

// ==============================
// Routes
// ==============================

import indexRoutes from "./routes/index.js";
import authRoutes from "./routes/authentication.js";
import administracionRoutes from "./routes/administracion.js";
import clinicaRoutes from "./routes/clinica.js";
import v1Routes from "./routes/v1.js";

// ==============================
// App init
// ==============================

const app = express();

const PUERTO = 4000;

app.set("port", PUERTO);
app.set("view engine", ".hbs");

// ==============================
// Middlewares
// ==============================

app.use(morgan("dev"));

app.use(express.urlencoded({ extended: false }));
app.use(express.json());

app.use(passport.initialize());

// ==============================
// CORS
// ==============================

const corsOptions = {
    origin: "*",
    methods: ["GET", "POST", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
    optionsSuccessStatus: 200
};

app.use(cors(corsOptions));

// ==============================
// Routes
// ==============================

app.use(indexRoutes);
app.use("/authentication", authRoutes);
app.use("/administracion", administracionRoutes);
app.use("/clinica", clinicaRoutes);
app.use("/v1", v1Routes);

// ==============================
// Public
// ==============================

app.use(express.static(path.join(__dirname, "public")));

// ==============================
// Start server
// ==============================

app.listen(app.get("port"), () => {
    console.log("✅ Server on port", app.get("port"));
});
