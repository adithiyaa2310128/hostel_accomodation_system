const express = require("express");
const bodyparser = require("body-parser");
const https = require("https");
const path = require('path');
app = express();
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');
app.set('views', path.resolve('./views'));// Set views folder
app.use(express.urlencoded({ extended: true })); // Makes form data accessible via req.body.

app.get("/", function (req, res) {
    res.sendFile(__dirname + "/public/home.html");
});

app.get("/details", function (req, res) {
    const val = req.query.value;  // Getting query parameters
    res.sendFile(__dirname + "/public/details.html");
});

app.get("/location",function(req, res){
    const lat = req.query.lat;
    const lon = req.query.lon;
    const name = req.query.name;
    res.sendFile(__dirname+"/public/locate.html");
});
app.post("/details", (req, res) => {
    const ac = req.body.AC;
    const lift = req.body.lift;
    const net = req.body.internet;
    let cond;
    
    if ((ac && lift) || (ac && lift && net) || (ac) || (ac && net)) {
        cond = "internet_access,wheelchair";
    } else if (lift) {
        cond = "wheelchair";
    } else if (net) {
        cond = "internet_access";
    } else {
        cond = null;
    }

    const results = req.body.no_results || 20;
    const type = req.body.value;
    const a = req.body.address;
    const r = req.body.radius * 1000;
    const mykey = "4b5bc48ab4ab4bb1aa76d86232668660";

    const url1 = `https://api.geoapify.com/v1/geocode/search?text=${a}&limit=1&apiKey=${mykey}`;

    https.get(url1, (response) => {
        let data = "";

        response.on("data", (chunk) => {
            data += chunk;
        });

        response.on("end", () => {
            try {
                const locationData = JSON.parse(data);
                const lat = locationData.features[0]?.geometry?.coordinates[1];
                const lon = locationData.features[0]?.geometry?.coordinates[0];

                if (!lat || !lon) {
                    res.write("Could not fetch latitude and longitude.");
                    return res.end();
                }

                let url2;
                if (cond) {
                    url2 = `https://api.geoapify.com/v2/places?categories=accommodation.${type}&conditions=${cond}&filter=circle:${lon},${lat},${r}&limit=${results}&apiKey=${mykey}`;
                } else {
                    url2 = `https://api.geoapify.com/v2/places?categories=accommodation.${type}&filter=circle:${lon},${lat},${r}&limit=${results}&apiKey=${mykey}`;
                }

                console.log(url2);
                https.get(url2, (response2) => {
                    let data2 = "";

                    response2.on("data", (chunk) => {
                        data2 += chunk;
                    });

                    response2.on("end", () => {
                        try {
                            const detailsData = JSON.parse(data2);
                            let arr = detailsData.features;
                            const len = arr.length;
                            let result = [];

                            // Function to calculate distance using Haversine formula
                            for (let i = 0; i < len; i++) {
                                let baseprice = (type === "apartment") ? 14000 : 5000;
                                if (detailsData.features[i]?.properties?.facilities?.internet_access &&
                                    detailsData.features[i]?.properties?.facilities?.wheelchair) {
                                    baseprice += 5000;
                                } else if (detailsData.features[i]?.properties?.facilities?.wheelchair) {
                                    baseprice += 2000;
                                } else if (detailsData.features[i]?.properties?.facilities?.internet_access) {
                                    baseprice += 1000;
                                }

                                if (detailsData.features[i].properties.name) {
                                    const hostelLat = detailsData.features[i]?.properties?.lat;
                                    const hostelLon = detailsData.features[i]?.properties?.lon;
                                    const data = {
                                        "Name": detailsData.features[i]?.properties?.name,
                                        "Address": detailsData.features[i]?.properties?.formatted,
                                        "Email": detailsData.features[i].properties.datasource.raw.email || null,
                                        "Phone": detailsData.features[i].properties.datasource.raw.phone || null,
                                        "Website": detailsData.features[i].properties.website || null,
                                        "lat": hostelLat,
                                        "lon": hostelLon,
                                        "price_range": baseprice + "-" + (baseprice + 5000),
                                    };
                                    result.push(data);
                                }
                            }
                            class MinHeap {
                                constructor(k) {
                                    this.heap = [];
                                    this.k = k;
                                }
                            
                                push(item) {
                                    this.heap.push(item);
                                    this.heap.sort((a, b) => a.distance - b.distance); // Maintain sorted order
                                    if (this.heap.length > this.k) {
                                        this.heap.pop(); // Remove farthest item to keep only k closest
                                    }
                                }
                            
                                getKNearest() {
                                    return this.heap;
                                }
                            }
                            
                            function haversineDistance(lat1, lon1, lat2, lon2) {
                                const R = 6371; // Radius of Earth in km
                                const dLat = (lat2 - lat1) * (Math.PI / 180);
                                const dLon = (lon2 - lon1) * (Math.PI / 180);
                                const a =
                                    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                                    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
                                    Math.sin(dLon / 2) * Math.sin(dLon / 2);
                                const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
                                return R * c; // Distance in km
                            }
                            
                            // **Efficient K-Nearest Neighbors Using Min-Heap**
                            function kNearestNeighbors(locations, userLat, userLon, k) {
                                const heap = new MinHeap(k);
                            
                                locations.forEach(place => {
                                    place.distance = haversineDistance(userLat, userLon, place.lat, place.lon);
                                    heap.push(place);
                                });
                            
                                return heap.getKNearest();
                            }
                            
                            // Example: Get top K nearest accommodations
                            result = kNearestNeighbors(result, lat, lon, results);
                            
                            res.render('display', { results: result }); // Pass sorted array to EJS file
                        } catch (error) {
                            console.log(error);
                            res.write("Error parsing second API response.");
                            res.end();
                        }
                    });

                    response2.on("error", (error) => {
                        res.write(`Error with second API call: ${error.message}`);
                        res.end();
                    });
                });
            } catch (error) {
                res.write("Error parsing first API response.");
                res.end();
            }
        });

        response.on("error", (error) => {
            res.write(`Error with first API call: ${error.message}`);
            res.end();
        });
    });
});

app.listen(2000, function (req, res) {
    console.log("Port running on 2000");
});