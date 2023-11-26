require('dotenv').config()

const app = require("express")();
const http = require("http").createServer(app);
const io = require("socket.io")(http);
const fs = require("fs");
const mongoose = require("mongoose");
const handlebars = require("express-handlebars").engine;
const path = require("path");

app.engine("handlebars", handlebars({
        layoutsDir: __dirname + "/views/layouts/",
        defaultLayout: "main",
        extname: ".handlebars",
    }));
app.set("view engine", "handlebars");
app.set("views", path.join(__dirname, "views"));


mongoose.connect(process.env.DB_URL);

const Host = mongoose.model("Hosts", {
    hostname: { required: true, type: String },
    dateCreated: { type: Date, default: Date.now },
    status: { type: String, default: "active" },
    lastActive: { type: Date, default: Date.now },
});

app.get("/", async (req,res) => {
    const opts = {
        title: "SRS Host List",
        hosts: await Host.find().lean()
    };
    console.log("SERVING WITH OPTIONS,\n", opts);
    res.render("index", opts);
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
