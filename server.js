const express = require("express");
const path = require("path");

try {
    require("./database/db");
    console.log("db.js załadowany");
} catch (err) {
    console.error("Błąd ładowania db.js:");
    console.error(err);
}

const authRoutes = require("./routes/auth");
const adminRoutes = require("./routes/admin");
const tileRoutes = require("./routes/tiles");

const app = express();
const PORT = process.env.PORT || 3000;

app.disable("x-powered-by");

app.use(express.json({
    limit: "1mb"
}));

app.get("/api/status", (req, res) => {
    res.json({
        success: true,
        message: "IRON MAN DEVASTA działa!"
    });
});

app.use("/api", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/tiles", tileRoutes);

app.use(express.static(path.join(__dirname, "public")));

app.listen(PORT, () => {
    console.log(`Serwer działa na porcie ${PORT}`);
});