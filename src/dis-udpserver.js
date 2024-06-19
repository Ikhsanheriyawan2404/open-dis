import dgram from 'dgram';
import dis from 'open-dis';
import DISUtils from './DISUtils.js';
import dotenv from 'dotenv';
import projector from 'ecef-projector';
import * as Colyseus from "colyseus.js";

dotenv.config()

const utils = new DISUtils();

const DEFAULT_HOST = '0.0.0.0';
const DEFAULT_UDP_PORT = 4000;

/**
 * Read host & port as commandline arguments - or take the default if not given:
 */
const host = process.env.HOST || DEFAULT_HOST

/**
 * Read ports as commandline arguments - or take the default if not given:
 */
const udpPort = process.env.UDP_PORT || DEFAULT_UDP_PORT;

const client = new Colyseus.Client('ws://localhost:2567');
let colyseusClient;

async function joinRoom() {
    try {
        const room = await client.join("wargaming", {
            id_user: "open-dis",
            nama: "WGS 3D",
            jenisUser: "open-dis"
        });

        colyseusClient = room;

        room.onMessage('onJoin', (info) => {
            console.log("Berhasil bergabung dengan room:", room.name);
        });

        room.onMessage('moveMeasure', (info) => {});

        room.onMessage('onLeave', (info) => {
            console.log("Berhasil Keluar room:", room.name);
            setTimeout(joinRoom, 5000)
        });

        room.onMessage('onDispose', (msg) => {
            console.log("Room hancur:", room.name);
            setTimeout(joinRoom, 5000)
        });
    } catch (error) {
        console.error("Room WGS Sepertinya Belum Dibuat");
        setTimeout(joinRoom, 5000); // Contoh: Coba lagi setelah 5 detik
    }
}

await joinRoom();

/**
 * Create a UDP Server:
 */
const udpServer = dgram.createSocket({ type: 'udp4', reuseAddr: true });

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
                
                let gps = projector.unproject(location.x, location.y, location.z);
                
                console.log("Got EntityState:", entityID, "Location", location, "Marking: \'" + marking + "\'");

                colyseusClient.send('movementPrepar3D', {
                    id: "satuan_11_470_497",
                    lng: gps[1],
                    lat: gps[0],
                })

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
    console.log(`UDP server listening on ${udpServer.address().address}:${udpPort}`);
});