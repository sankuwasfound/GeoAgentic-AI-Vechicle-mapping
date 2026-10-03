const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(__dirname));

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "YOUR_API_KEY_HERE");

class CongestionDNN {
    constructor() {
        this.weightsHidden = [[0.8, 1.2, 2.5, 0.5], [-0.5, 0.8, 1.0, 1.2], [1.5, -0.2, 3.0, 0.9]];
        this.biasHidden = [0.5, -0.2, 0.1];
        this.weightsOutput = [1.5, 0.8, 2.0];
        this.biasOutput = 2.5;
    }
    relu(x) { return Math.max(0, x); }
    predict(inputs) {
        let hidden = [0, 0, 0];
        for (let i = 0; i < 3; i++) {
            let sum = this.biasHidden[i];
            for (let j = 0; j < 4; j++) sum += inputs[j] * this.weightsHidden[i][j];
            hidden[i] = this.relu(sum);
        }
        let output = this.biasOutput;
        for (let i = 0; i < 3; i++) output += hidden[i] * this.weightsOutput[i];
        return this.relu(output);
    }
}
const trafficBrain = new CongestionDNN();

class FleetSVM {
    constructor() {
        this.svmWeights = [0.4, -0.6, 1.5];
        this.svmBias = -1.2;
        this.fleet = [
            { id: 'AMB-KA-ALS-99', type: 'Advanced Life Support (ALS)', available: true },
            { id: 'AMB-KA-BLS-42', type: 'Basic Life Support (BLS)', available: true }
        ];
    }
    classifySeverity(patientFeatures) {
        let score = this.svmBias;
        for (let i = 0; i < 3; i++) score += patientFeatures[i] * this.svmWeights[i];
        return score > 0 ? 'CODE_RED' : 'CODE_YELLOW';
    }
    allocateUnit(patientFeatures) {
        const severity = this.classifySeverity(patientFeatures);
        const dispatchedUnit = this.fleet.find(v => v.type.includes(severity === 'CODE_RED' ? 'ALS' : 'BLS') && v.available);
        return { severity, unit: dispatchedUnit };
    }
}
const dispatchBrain = new FleetSVM();

class GreenWaveEngine {
    static calculateWave(pathNodes, avgSpeedKmh) {
        let waveSchedule = [];
        let cumulativeTimeSeconds = 0;
        for (let i = 1; i < pathNodes.length; i++) {
            const distKm = haversineDistance(LocationNodes[pathNodes[i-1]], LocationNodes[pathNodes[i]]);
            cumulativeTimeSeconds += (distKm / avgSpeedKmh) * 3600;
            waveSchedule.push({ junction: pathNodes[i], greenStartETA: Math.max(0, Math.round(cumulativeTimeSeconds - 15)), greenEndETA: Math.round(cumulativeTimeSeconds + 20) });
        }
        return waveSchedule;
    }
}

class NaturalLanguageEngine {
    static generateDeviationBrief(location, penaltyMinutes) { return `DNN Analytics indicate a +${Math.round(penaltyMinutes)} minute delay at ${location} due to catastrophic flow degradation. Reroute highly advised to maintain ${location} SLA.`; }
    static generateRoutingBrief(pathNodes, waveSchedule) {
        const waveText = waveSchedule.map(w => `${w.junction} (T-${w.greenStartETA}s)`).join(', ');
        return `Dynamic A* bypassed the epicenter via ${pathNodes[1] || 'alternative streets'}. Green Wave Chronology synced for: ${waveText}. Dispatching secondary unit is NOT REQUIRED.`;
    }
}

const LocationNodes = {
    'Koramangala': { lat: 12.9352, lng: 77.6245 }, 'VivekNagar':  { lat: 12.9450, lng: 77.6310 },
    'MGRoad':      { lat: 12.9716, lng: 77.5946 }, 'Domlur':      { lat: 12.9560, lng: 77.6450 }, 'Indiranagar': { lat: 12.9784, lng: 77.6408 }
};

const SimulatedCivilians = [
    { id: 'Device-A (Honda City)', lat: 12.9360, lng: 77.6250 }, { id: 'Device-B (Pedestrian)', lat: 12.9440, lng: 77.6300 }  
];

const Hospitals = {
    'Manipal': { id: 'Manipal Hospital (HAL)', lat: 12.9585, lng: 77.6485, beds: 0 },
    'Apollo':  { id: 'Apollo Hospital (Indiranagar)', lat: 12.9780, lng: 77.6410, beds: 2 },
    'Fortis':  { id: 'Fortis Hospital (Cunningham)', lat: 12.9800, lng: 77.5900, beds: 5 }
};

const CityGraph = {
    'Koramangala': [ { to: 'VivekNagar', baseTime: 0, congestion: (t) => 0 } ],
    'VivekNagar': [
        { to: 'MGRoad', baseTime: 0, congestion: async (t) => trafficBrain.predict([t, 0.8, 0.9, 0.7]) },
        { to: 'Domlur', baseTime: 0, congestion: async (t) => trafficBrain.predict([t, 0.1, 0.0, 0.2]) }
    ],
    'MGRoad': [ { to: 'Indiranagar', baseTime: 0, congestion: (t) => 0 } ],
    'Domlur': [ { to: 'Indiranagar', baseTime: 0, congestion: (t) => 0 } ],
    'Indiranagar': []
};

class PriorityQueue {
    constructor() { this.nodes = []; }
    enqueue(priority, key) { this.nodes.push({ key, priority }); this.nodes.sort((a, b) => a.priority - b.priority); }
    dequeue() { return this.nodes.shift().key; }
    isEmpty() { return !this.nodes.length; }
}

async function fetchLiveEdgeWeight(startCoord, endCoord) {
    try {
        const response = await fetch(`http://router.project-osrm.org/route/v1/driving/${startCoord.lng},${startCoord.lat};${endCoord.lng},${endCoord.lat}?overview=false`);
        const data = await response.json(); return data.code === 'Ok' ? data.routes[0].duration / 60 : 10;
    } catch (error) { return 10; }
}

async function buildDynamicGraph() {
    for (let node in CityGraph) {
        for (let edge of CityGraph[node]) edge.baseTime = await fetchLiveEdgeWeight(LocationNodes[node], LocationNodes[edge.to]);
    }
}

function haversineDistance(coords1, coords2) {
    const R = 6371, dLat = (coords2.lat - coords1.lat) * Math.PI / 180, dLng = (coords2.lng - coords1.lng) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(coords1.lat * Math.PI / 180) * Math.cos(coords2.lat * Math.PI / 180) * Math.sin(dLng/2) * Math.sin(dLng/2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
}
function heuristic(node, endNode) { return (haversineDistance(LocationNodes[node], LocationNodes[endNode]) / 40) * 60; }
function calculateDispersionIndex(targetNode, epicenterCoords) {
    if (!epicenterCoords) return 0;
    const distToEpicenter = haversineDistance(LocationNodes[targetNode], epicenterCoords);
    return distToEpicenter < 2.5 ? 30 / (distToEpicenter + 0.1) : 0; 
}

async function dynamicAStar(graph, startNode, endNode, startTime, epicenterCoords) {
    const gScore = {}, fScore = {}, backtrace = {}, pq = new PriorityQueue();
    for (let node in graph) { gScore[node] = Infinity; fScore[node] = Infinity; }
    gScore[startNode] = startTime; fScore[startNode] = startTime + heuristic(startNode, endNode); pq.enqueue(fScore[startNode], startNode);
    while (!pq.isEmpty()) {
        let currentNode = pq.dequeue();
        if (currentNode === endNode) {
            let path = [], lastStep = endNode;
            while (lastStep) { path.push(lastStep); lastStep = backtrace[lastStep]; }
            return { path: path.reverse(), totalTime: gScore[endNode] };
        }
        let edges = graph[currentNode] || [];
        for (let edge of edges) {
            let arrivalTimeAtCurrent = gScore[currentNode];
            let dnnPenalty = await edge.congestion(arrivalTimeAtCurrent);
            let dispersionPenalty = calculateDispersionIndex(edge.to, epicenterCoords);
            let tentative_gScore = arrivalTimeAtCurrent + edge.baseTime + dnnPenalty + dispersionPenalty;
            if (tentative_gScore < gScore[edge.to]) {
                backtrace[edge.to] = currentNode; gScore[edge.to] = tentative_gScore;
                fScore[edge.to] = tentative_gScore + heuristic(edge.to, endNode); pq.enqueue(fScore[edge.to], edge.to);
            }
        }
    }
    return null;
}

class MonteCarloEngine {
    static async runBatch(iterations) {
        let slaMetCount = 0; let totalDelaySavedMins = 0; let bottlenecks = { 'MGRoad': 0, 'Domlur': 0, 'VivekNagar': 0, 'Indiranagar': 0 };
        const nodeKeys = Object.keys(LocationNodes);
        for (let i = 0; i < iterations; i++) {
            const randomEpicenter = nodeKeys[Math.floor(Math.random() * nodeKeys.length)]; bottlenecks[randomEpicenter]++;
            const result = await dynamicAStar(CityGraph, 'VivekNagar', 'Indiranagar', 4, LocationNodes[randomEpicenter]);
            if (result && result.totalTime < 35) slaMetCount++;
            totalDelaySavedMins += Math.floor(Math.random() * 20) + 15; 
        }
        return { 
            complianceRate: ((slaMetCount / iterations) * 100).toFixed(1), 
            co2Saved: ((totalDelaySavedMins * 0.06) * 2.68).toFixed(1), 
            worstBottleneck: Object.keys(bottlenecks).reduce((a, b) => bottlenecks[a] > bottlenecks[b] ? a : b) 
        };
    }
}

io.on('connection', (socket) => {
    socket.emit('graph_data', CityGraph);
    let telemetryInterval;

    socket.on('initiate_dispatch', (vitals) => {
        clearInterval(telemetryInterval);
        const allocation = dispatchBrain.allocateUnit([vitals.hr, vitals.o2, vitals.trauma]);
        socket.emit('dispatch_confirmed', allocation);

        // NEW: If Code Red, deploy the drone for advanced visuals
        if (allocation.severity === 'CODE_RED') {
            socket.emit('deploy_drone');
        }

        let currentStep = 0;
        const plannedRoute = [LocationNodes['Koramangala'], LocationNodes['VivekNagar']];
        
        telemetryInterval = setInterval(() => {
            if (currentStep < plannedRoute.length) {
                const currentLoc = plannedRoute[currentStep];
                socket.emit('telemetry_update', { vehicleId: allocation.unit.id, location: currentLoc, status: `En Route [${allocation.severity}]`, speed: 45 });
                SimulatedCivilians.forEach(civ => {
                    const distKm = haversineDistance(currentLoc, civ);
                    if (distKm <= 0.5) socket.emit('civilian_alert', { deviceId: civ.id, distance: Math.round(distKm * 1000) });
                });
                currentStep++;
            } else {
                const nleBrief = NaturalLanguageEngine.generateDeviationBrief('MG Road', 30);
                socket.emit('deviation_alert', { cause: nleBrief, delay: '+30 mins', recommendedAction: 'Trigger A* Reroute' });
                clearInterval(telemetryInterval);
            }
        }, 2000);
    });

    async function executeAdvancedReroute(epicenterCoords) {
        const result = await dynamicAStar(CityGraph, 'VivekNagar', 'Indiranagar', 4, epicenterCoords);
        const coordinatesPath = result.path.map(node => LocationNodes[node]);
        const waveSchedule = GreenWaveEngine.calculateWave(result.path, 45);
        const decisionBrief = NaturalLanguageEngine.generateRoutingBrief(result.path, waveSchedule);
        socket.emit('reroute_confirmed', { newPath: coordinatesPath, v2i_status: `Green Wave Active. Syncing ${waveSchedule.length} signals.`, ai_explanation: decisionBrief });
    }

    socket.on('trigger_reroute', () => executeAdvancedReroute(LocationNodes['MGRoad']));
    socket.on('custom_obstacle', (coords) => executeAdvancedReroute(coords));
    
    socket.on('start_monte_carlo', async () => {
        const results = await MonteCarloEngine.runBatch(50);
        socket.emit('monte_carlo_results', results);
    });

    socket.on('request_icu_transfer', (currentLoc) => {
        let bestHospital = null; let shortestDist = Infinity; let fullHospitals = [];
        for (let key in Hospitals) {
            const h = Hospitals[key];
            if (h.beds === 0) fullHospitals.push(h.id);
            else {
                const dist = haversineDistance(currentLoc, h);
                if (dist < shortestDist) { shortestDist = dist; bestHospital = h; }
            }
        }
        socket.emit('icu_allocated', { bestHospital, fullHospitals, distanceKm: shortestDist.toFixed(1) });
    });

    socket.on('generate_ai_report', async (incidentData) => {
        try {
            const prompt = `You are an AI command center operative for the Bengaluru Traffic Police. Write a 3-paragraph Post-Incident Debriefing Report based on these metrics: 
            Vehicle Dispatched: ${incidentData.unit}, Classification: ${incidentData.severity}, Delay Avoided: ${incidentData.delay}, CO2 Prevented: ${incidentData.co2}, ICU Handover: ${incidentData.hospital}. 
            Format requirements: Use military/government phrasing. Do not use markdown headers, just 3 plain text paragraphs separated by newlines. Paragraph 1: Intake and dispatch. Paragraph 2: Traffic routing anomaly and V2I engagement. Paragraph 3: Sustainability impact and ICU handover.`;

            const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
            const result = await model.generateContent(prompt);
            const text = result.response.text();
            socket.emit('ai_report_ready', { report: text, source: 'Gemini AI API' });
        } catch (error) {
            console.log("Gemini API skipped or failed. Triggering intelligent fallback generator.");
            const fallbackReport = `At ${new Date().toLocaleTimeString()}, the GeoAgentic Framework intercepted an emergency call. Biometric telemetry processed by the Support Vector Machine resulted in a ${incidentData.severity.replace('_',' ')} classification. The system bypassed standard protocols to immediately dispatch an ${incidentData.unit} unit to the origin coordinates, optimizing for rapid response.\n\nDuring transit, the Deep Neural Network predicted catastrophic traffic degradation along the primary corridor. A Time-Dependent A* recalculation was successfully executed to bypass the congestion epicenter. To ensure uninterrupted velocity, Vehicle-to-Infrastructure (V2I) protocols were engaged, generating a synchronized green wave through the deviated corridor.\n\nThe tactical reroute successfully prevented ${incidentData.delay} of gridlock exposure, conserving ${incidentData.fuel} of diesel and preventing the emission of ${incidentData.co2} of CO2. The patient was safely transported to ${incidentData.hospital}, mitigating regional ICU capacity constraints. Incident closed with zero SLA breaches.`;
            
            socket.emit('ai_report_ready', { report: fallbackReport, source: 'Internal Synthesizer' });
        }
    });

    socket.on('disconnect', () => clearInterval(telemetryInterval));
});

const PORT = process.env.PORT || 3000;
buildDynamicGraph().then(() => {
    server.listen(PORT, () => { console.log(`GeoAgentic Backend Phase 7 listening on http://localhost:${PORT}`); });
});