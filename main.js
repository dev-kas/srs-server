require('dotenv').config()

const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http);
const fs = require("fs");
const mongoose = require("mongoose");
const handlebars = require("express-handlebars").engine;
const path = require("path");
const bodyParser = require("body-parser");

app.engine("handlebars", handlebars({
        layoutsDir: __dirname + "/views/layouts/",
        defaultLayout: "main",
        extname: ".handlebars",
    }));
app.set("view engine", "handlebars");
app.set("views", path.join(__dirname, "views"));
app.use(bodyParser.urlencoded({ extended: true }));

mongoose.connect(process.env.DB_URL);

const Host = mongoose.model("Hosts", {
    hostname: { required: true, type: String, unique: true },
    dateCreated: { type: Date, default: Date.now },
    status: { type: String, default: "active" },
    lastActive: { type: Date, default: Date.now },
});

const Version = mongoose.model("Versions", {
    version: { required: true, type: String, unique: true },
    url: { required: true, type: String, unique: true }
})

app.get("/", async (req,res) => {
    const opts = {
        title: "SRS Host List",
        hosts: await Host.find().lean()
    };
    console.log("SERVING WITH OPTIONS,\n", opts);
    res.render("index", opts);
});

app.get("/addHostVersion", (req, res) => {
    res.render("addHostVersion", {
        title: "New Host Version"
    });
});

app.get("/verman", async (req, res) => {
    let _verinfo = await Version.find().lean();
    let verinfo = [];
    _verinfo.forEach(ver => {
        verinfo.push({ version: ver.version, url: ver.url });
    });
    res.json(verinfo).status(200);
});

app.post("/verman", async (req, res) => {
    console.log(req.body)
    if (!req.body.apikey) {res.send("The api key is required.").status(400); return false};
    if (req.body.apikey !== "kasdev") {res.send("Incorrect api key.").status(401); return false};
    if (!req.body.version || !req.body.url) {res.send("Both `version` and `url` are required.").status(400); return false};

    if (await Version.findOne({$or: [{ version: req.body.version }, { url: req.body.url }]})) {res.send("Version or URL already exist").status(409); return false};

    let ver = await Version.create({ version: req.body.version, url: req.body.url });

    res.send("Success.").status(200);

    return true;
});

app.get("/raw", (req,res) => {
    res.sendFile(__dirname + "/knownHosts.txt");
})

io.on("connection", (socket) => {
    socket.emit("ask:client_info");
    socket.on("answer:client_info", async (client_info) => {
        if (client_info.client_type === "HOST" && !fs.readFileSync("./knownHosts.txt").toString().split("\n").includes(client_info.client_name)) {
            fs.appendFileSync("./knownHosts.txt", client_info.client_name + "\n");
            // _connected_cache[socket.id] = client_info;
        }

        let clientDBInstance = undefined;

        if (client_info.client_type === "HOST") {
            const existingHost = await Host.findOne({ hostname: client_info.client_name });
            
            if (existingHost) {
                existingHost.lastActive = Date.now();
                existingHost.status = "active";
                await existingHost.save();
                clientDBInstance = existingHost;
            } else {
                clientDBInstance = await Host.create({
                    hostname: client_info.client_name,
                    lastActive: Date.now(),
                    status: "active"
                });
            }
        }

        socket.on("term.onData", (data) => {
            // console.log(data.data, data.host);
            io.emit("to:HOST@" + data.host + "-term.onData", data.data)
        })
        socket.on("return:HOST@" + client_info.client_name + "-shell.onData", _data => {
            io.emit("to:CLIENT@connectedTO" + client_info.client_name + "-shell.onData", _data);
            // console.log(_data)
        })
        socket.on(`connect:HOST+CLIENT_as_HOST:${client_info.client_name}`, (host) => {
            io.emit(`connect:HOST+CLIENT_as_${host}:CLIENT`, (client_info.client_name))
        })
        socket.on(`disconnect:HOST+CLIENT_as_HOST:${client_info.client_name}`, (host) => {
            io.emit(`disconnect:HOST+CLIENT_as_${host}:CLIENT`, (client_info.client_name))
        })
        // console.log(client_info);

        socket.on("disconnect", async () => {
            let clientDBInstance = undefined;
        
            if (Host.findOne({ hostname: client_info.client_name })) {
                const host = await Host.findOne({ hostname: client_info.client_name });
                host.lastActive = Date.now();
                host.status = "offline";
                await host.save();
                clientDBInstance = host;
            } else {
                clientDBInstance = await Host.create({ hostname: client_info.client_name, lastActive: Date.now() });
            }
        })
    });
});

const PORT = process.env.PORT || 5500;

http.listen(PORT, () => {
    console.log("Server is running on port " + PORT);
});
