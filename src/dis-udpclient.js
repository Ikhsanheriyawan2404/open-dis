const dgram = require('dgram');
const dis = require("open-dis");
const DISUtils = require('./DISUtils');

var utils = new DISUtils();

var DEFAULT_HOST = 'localhost';
const DEFAULT_PORT = 4000

/**
 * Read host & port as commandline arguments - or take the default if not given:
 */
var host = DEFAULT_HOST
var port = DEFAULT_PORT


var client = dgram.createSocket('udp4');        /** Open a UDP-Client */

/**
 * Create a function to initialize a new EntityStatePDU for an aircraft:
 */
function createEntityStatePDU(site, application, entity, markingText) {
    var disEntityStatePDU= new dis.EntityStatePdu()
    disEntityStatePDU.entityID.site = site;
    disEntityStatePDU.entityID.application = application;
    disEntityStatePDU.entityID.entity = entity;
    disEntityStatePDU.marking.setMarking(markingText);
    return disEntityStatePDU;
}

/**
 * Initial positions for two aircraft:
 */
var aircraft1 = createEntityStatePDU(11, 22, 33, "F-16A");
var aircraft2 = createEntityStatePDU(11, 22, 34, "HAWK MK53");

var targetPosition1 = { x: 1000, y: 0, z: 0 };
var targetPosition2 = { x: 1100, y: 0, z: 0 };

/**
 * Function to update position towards target:
 */
function updatePosition(entity, targetPosition) {
    var speed = 10; // Units per update
    if (entity.entityLocation.x < targetPosition.x) {
        entity.entityLocation.x += speed;
    }
    if (entity.entityLocation.y < targetPosition.y) {
        entity.entityLocation.y += speed;
    }
    if (entity.entityLocation.z < targetPosition.z) {
        entity.entityLocation.z += speed;
    }
}

/**
 * Function to send EntityStatePDU:
 */
function sendEntityStatePDU(entityStatePDU) {
    var message = utils.DISPduToBuffer(entityStatePDU);
    client.send(message, 0, message.length, port, host, function(err, bytes) {
        if (err) throw err;
        console.log('UDP message sent to ' + host + ':' + port);
    });
}

/**
 * Create a Dummy EntityState-PDU and fill it with dummy data - just for testing:
 */
var disEntityStatePDU= new dis.EntityStatePdu()
disEntityStatePDU.entityID.site = 11;
disEntityStatePDU.entityID.application = 22;
disEntityStatePDU.entityID.entity = 33;
disEntityStatePDU.entityLocation = new dis.Vector3Float(1, 2, 3);
disEntityStatePDU.marking.setMarking("Example Entity")


var entityID = disEntityStatePDU.entityID;
var location = disEntityStatePDU.entityLocation;
var marking  = disEntityStatePDU.marking.getMarking();
console.log("Sending EntityState:", entityID, "Location", location, "Marking: \'" + marking + "\'" )


/**
 * Encode the PDU intoto networkbuffer:
 */
message = utils.DISPduToBuffer(disEntityStatePDU);

/**
 * Send the message on network and finish
 */
client.send(message, 0, message.length, port, host, function(err, bytes) {
    if (err) throw err;
    console.log('UDP message sent to ' + host +':'+ port);
    client.close()
});

/**
 * Function to simulate the movement and send data:
 */
function simulateMovement() {
    for (let i = 0; i < aircraft1.entityLocation.x; i++) {
        updatePosition(aircraft1, targetPosition1);
        console.log("Sending EntityState for Aircraft 1:", aircraft1.entityID, "Location", aircraft1.entityLocation, "Marking: \'" + aircraft1.marking.getMarking() + "\'");
        sendEntityStatePDU(aircraft1);
    }

    for (let i = 0; i < aircraft2.entityLocation.x; i++) {
        updatePosition(aircraft2, targetPosition2);
        console.log("Sending EntityState for Aircraft 2:", aircraft2.entityID, "Location", aircraft2.entityLocation, "Marking: \'" + aircraft2.marking.getMarking() + "\'");
        sendEntityStatePDU(aircraft2);
    }

    // client.close(() => {
    //     console.log('UDP client closed');
    // });
}

simulateMovement();

/**
 * Close the client when process is terminated:
 */
process.on('SIGINT', function() {
    clearInterval(interval); // Clear the interval to stop sending data
    client.close(() => {
        console.log('\nUDP client closed');
        process.exit();
    });
});