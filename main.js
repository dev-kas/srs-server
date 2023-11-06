require('dotenv').config()

const app = require("express")();
const http = require("http").createServer(app);
const io = require("socket.io")(http);
const fs = require("fs");
app.get("/", (req,res) => {
    res.sendFile(__dirname + "/knownHosts.txt")
});

io.on("connection", (socket) => {
    // const host = new Hosts({ udname: "tar123", sessions: [] })
    // host.save();
    socket.emit("ask:client_info");
    socket.on("answer:client_info", async (client_info) => {
        if (client_info.client_type === "HOST" && !fs.readFileSync("./knownHosts.txt").toString().split("\n").includes(client_info.client_name)) {
            fs.appendFileSync("./knownHosts.txt", client_info.client_name + "\n");
        }
        socket.on("term.onData", data => {
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

    });
});

http.listen(process.env.PORT, () => {
    // console.log("Server is running on port 5500");
});
