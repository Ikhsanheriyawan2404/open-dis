const dgram = require('dgram');
const express = require('express');
const http = require('http');
const socketIo = require('./socket.io');
const cors = require('cors'); // Import modul CORS
const dis = require("open-dis");
const DISUtils = require('./DISUtils');
require('dotenv').config();
const projector = require('ecef-projector');

let utils = new DISUtils();

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 4000
const DEFAULT_UDP_PORT = 4000;
const DEFAULT_HTTP_PORT = 4000;

/**
 * Read host & port as commandline arguments - or take the default if not given:
 */
const host = process.env.HOST || DEFAULT_HOST
const port = process.env.PORT || DEFAULT_PORT

/**
 * Read ports as commandline arguments - or take the default if not given:
 */
const udpPort = process.env.UDP_PORT || DEFAULT_UDP_PORT;
const httpPort = process.env.HTTP_PORT || DEFAULT_HTTP_PORT;


/**
 * Create an HTTP Server:
 */
const app = express();
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST']
})); // Terapkan middleware CORS

const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
});

/**
 * Create a UDP Server:
 */
let udpServer = dgram.createSocket({ type: 'udp4', reuseAddr: true });

io.on('connection', (socket) => {
    console.log('Socket.IO client connected');
    
    socket.on('disconnect', () => {
        console.log('Socket.IO client disconnected');
    });
 
    socket.on('error', (error) => {
        console.error('Socket.IO error:', error);
    });

    socket.on('sendEntityState', (data) => {
        let result = createEntityStatePDU(
            data.site,
            data.application,
            data.entity,
            data.markingText,
            data.y,
            data.x,
            data.z,
        );
        sendEntityStatePDU(result)
    });

});

/**
 * Create a function to initialize a new EntityStatePDU for an aircraft:
 */
function createEntityStatePDU(site, application, entity, markingText = "Entity1", lat, lng, alt) {
    let disEntityStatePDU = new dis.EntityStatePdu()
    disEntityStatePDU.entityID.site = site;
    disEntityStatePDU.entityID.application = application;
    disEntityStatePDU.entityID.entity = entity;

    // Inisialisasi objek Marking
    disEntityStatePDU.marking = new dis.Marking();
    disEntityStatePDU.marking.setMarking(markingText);

    // Set entityLocation sebagai instance dari Vector3Float
    // let { x, y, z } = latLngAltToECEF(lat, lng, alt);
    // disEntityStatePDU.entityLocation = new dis.Vector3Float();
    disEntityStatePDU.entityLocation.x = lng;
    disEntityStatePDU.entityLocation.y = lat;
    disEntityStatePDU.entityLocation.z = alt;

    return disEntityStatePDU;
}

/**
 * Function to convert latitude, longitude, altitude to ECEF coordinates:
 */
function latLngAltToECEF(lat, lon, alt) {
    const a = 6378137.0; // Equatorial radius in meters
    const e2 = 6.69437999014e-3; // Square of eccentricity

    lat = lat * Math.PI / 180.0;
    lon = lon * Math.PI / 180.0;

    const N = a / Math.sqrt(1 - e2 * Math.sin(lat) * Math.sin(lat));

    const x = (N + alt) * Math.cos(lat) * Math.cos(lon);
    const y = (N + alt) * Math.cos(lat) * Math.sin(lon);
    const z = ((1 - e2) * N + alt) * Math.sin(lat);

    return { x, y, z };
}

function ecefToLatLngAlt(x, y, z) {
    const a = 6378137.0; // Equatorial radius in meters
    const e2 = 6.69437999014e-3; // Square of eccentricity

    const b = Math.sqrt(a * a * (1 - e2));
    const ep = Math.sqrt((a * a - b * b) / (b * b));
    const p = Math.sqrt(x * x + y * y);
    const th = Math.atan2(a * z, b * p);

    const lon = Math.atan2(y, x);
    const lat = Math.atan2((z + ep * ep * b * Math.pow(Math.sin(th), 3)), (p - e2 * a * Math.pow(Math.cos(th), 3)));
    const N = a / Math.sqrt(1 - e2 * Math.sin(lat) * Math.sin(lat));
    const alt = p / Math.cos(lat) - N;

    // Convert radians to degrees
    const latDeg = lat * 180.0 / Math.PI;
    const lonDeg = lon * 180.0 / Math.PI;

    return { y: latDeg, x: lonDeg, z: alt };
}

// Function to convert radians to degrees
function getOrientationFromEuler(lat, lon, psi, theta) {
    // Convert psi from radians to degrees
    let heading = psi * (180 / Math.PI);

    // Normalize the heading to be within -180 to 180 degrees
    heading = (heading + 360) % 360;
    if (heading > 180) {
        heading -= 360;
    }

    return heading;
}
  
  // Convert psi to degrees


/**
 * Function to send EntityStatePDU:
 */
function sendEntityStatePDU(entityStatePDU) {
    let message = utils.DISPduToBuffer(entityStatePDU);
    udpServer.send(message, 0, message.length, port, host, function(err, bytes) {
        if (err) throw err;
        console.log('UDP message sent to ' + host + ':' + port);
    });
}

/**
 * Message handler for UDP server
 */
udpServer.on('message', (msg, rinfo) => {
    console.log(`UDP server got message from ${rinfo.address}:${rinfo.port}`);

    try {
        let disMessage = utils.DISObjectFromBuffer(msg);
        switch(disMessage.pduType) {
            case 1: // EntityState PDU:
                let entityID = disMessage.entityID;
                let location = disMessage.entityLocation;
                let marking  = disMessage.marking.getMarking();
                var gps = projector.unproject(location.x, location.y, location.z);
                console.log("Got EntityState:", entityID, "Location", location, "Marking: \'" + marking + "\'");
                const heading = getOrientationFromEuler(
                    location.x,
                    location.y,
                    disMessage.entityOrientation.psi,
                    disMessage.entityOrientation.theta
                );
                console.log({heading})
                // Broadcast the message to all Socket.IO clients
                io.emit('receiveEntityState', {
                    entityID: entityID,
                    location: {
                        x: gps[1],
                        y: gps[0],
                        z: gps[2],
                    },
                    marking: marking,
                    heading
                });
                break;
            case 20: // Data PDU:
                console.log("Got DataPDU:");
                break;
            default:
                console.log("Got Other PDU:", disMessage.pduType);
        }
    } catch (e) {
        console.log("Exception:", e);
    }
});

/**
 * Debug messages for UDP server
 */
udpServer.on('error', (err) => {
    console.log(`UDP server error:\n${err.stack}`);
    udpServer.close();
});

/**
 * Start listening on UDP port
 */
udpServer.bind(udpPort, host, () => {
    console.log(udpServer.address())
    console.log(`UDP server listening on ${host}:${udpPort}`);
});

/**
 * Start HTTP and Socket.IO server
 */
server.listen(httpPort, () => {
    console.log(`HTTP and Socket.IO server listening on ${host}:${httpPort}`);
});
