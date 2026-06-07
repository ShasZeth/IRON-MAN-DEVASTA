const express = require("express");
const path = require("path");
const http = require("http");
const { WebSocketServer } = require("ws");

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

const server = http.createServer(app);

const wss = new WebSocketServer({ server });

function broadcast(data) {
    const message = JSON.stringify(data);

    wss.clients.forEach((client) => {
        if (client.readyState === client.OPEN) {
            client.send(message);
        }
    });
}

app.set("broadcast", broadcast);

wss.on("connection", (ws) => {
    console.log("Klient połączony przez WebSocket");

    ws.send(JSON.stringify({
        type: "CONNECTED",
        message: "Połączono z WebSocket"
    }));

    ws.on("close", () => {
        console.log("Klient rozłączony z WebSocket");
    });
});

server.listen(PORT, () => {
    console.log(`Serwer działa na porcie ${PORT}`);
});