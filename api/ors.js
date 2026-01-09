export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ 
            success: false,
            error: 'Method not allowed. Please use POST.' 
        });
    }

    const ORS_API_KEY = process.env.ORS_API_KEY;
    
    if (!ORS_API_KEY) {
        console.error('ORS_API_KEY environment variable is not configured');
        return res.status(500).json({ 
            success: false,
            error: 'Server configuration error: Routing service not configured'
        });
    }

    const { pickup, dropoff, vehicle } = req.body;

    if (!pickup || !dropoff) {
        return res.status(400).json({ 
            success: false,
            error: 'Both pickup and dropoff addresses are required'
        });
    }

    console.log(`📍 Route request: ${pickup} → ${dropoff}`);

    try {
        // Geocode pickup address
        const pickupGeocode = await geocodeAddress(pickup, ORS_API_KEY);
        if (!pickupGeocode) {
            return res.status(404).json({ 
                success: false,
                error: `Could not find pickup address: "${pickup}". Please check the address and try again.`
            });
        }

        // Geocode dropoff address
        const dropoffGeocode = await geocodeAddress(dropoff, ORS_API_KEY);
        if (!dropoffGeocode) {
            return res.status(404).json({ 
                success: false,
                error: `Could not find drop-off address: "${dropoff}". Please check the address and try again.`
            });
        }

        console.log(`✅ Geocoded: ${pickupGeocode.label} → ${dropoffGeocode.label}`);

        // Calculate route
        const route = await getRoute(
            pickupGeocode.coordinates,
            dropoffGeocode.coordinates,
            ORS_API_KEY
        );

        const distanceKm = route.distance / 1000;
        const durationMinutes = Math.round(route.duration / 60);

        console.log(`✅ Route calculated: ${distanceKm.toFixed(1)} km, ${durationMinutes} min`);

        return res.status(200).json({
            success: true,
            pickupAddress: pickupGeocode.label,
            dropoffAddress: dropoffGeocode.label,
            pickupCoords: pickupGeocode.coordinates,
            dropoffCoords: dropoffGeocode.coordinates,
            distance: distanceKm,
            duration: durationMinutes,
            vehicle: vehicle || 'premier-sedan',
            geometry: route.geometry,
            summary: {
                distance: `${distanceKm.toFixed(1)} km`,
                duration: `${durationMinutes} min`,
                coordinates: `From [${pickupGeocode.coordinates[1].toFixed(4)}, ${pickupGeocode.coordinates[0].toFixed(4)}] to [${dropoffGeocode.coordinates[1].toFixed(4)}, ${dropoffGeocode.coordinates[0].toFixed(4)}]`
            }
        });

    } catch (error) {
        console.error('❌ Route calculation error:', error);
        
        let userErrorMessage = 'Failed to calculate route';
        if (error.message.includes('API key') || error.message.includes('authentication')) {
            userErrorMessage = 'Routing service authentication failed. Please contact support.';
        } else if (error.message.includes('network') || error.message.includes('fetch')) {
            userErrorMessage = 'Network error. Please check your internet connection and try again.';
        } else if (error.message.includes('No route found')) {
            userErrorMessage = 'No route found between the specified addresses. Please check the addresses and try again.';
        }
        
        return res.status(500).json({ 
            success: false,
            error: userErrorMessage,
            debug: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
}

async function geocodeAddress(address, apiKey) {
    try {
        const url = `https://api.openrouteservice.org/geocode/search?api_key=${apiKey}&text=${encodeURIComponent(address)}&boundary.country=ZA&size=1`;
        
        console.log(`🔍 Geocoding: ${address}`);
        const response = await fetch(url, {
            headers: {
                'Accept': 'application/json, application/geo+json, application/gpx+xml, img/png; charset=utf-8',
            }
        });
        
        if (!response.ok) {
            console.error(`Geocoding failed for "${address}": ${response.status} ${response.statusText}`);
            return null;
        }

        const data = await response.json();
        
        if (!data.features || data.features.length === 0) {
            console.warn(`No geocoding results for: ${address}`);
            return null;
        }

        const feature = data.features[0];
        
        return {
            coordinates: feature.geometry.coordinates,
            label: feature.properties.label || address
        };
        
    } catch (error) {
        console.error(`Geocoding error for "${address}":`, error);
        return null;
    }
}

async function getRoute(startCoords, endCoords, apiKey) {
    try {
        const url = 'https://api.openrouteservice.org/v2/directions/driving-car/geojson';
        
        console.log(`🗺️ Calculating route...`);
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': apiKey,
                'Content-Type': 'application/json',
                'Accept': 'application/json, application/geo+json, application/gpx+xml, img/png; charset=utf-8'
            },
            body: JSON.stringify({
                coordinates: [startCoords, endCoords],
                instructions: false,
                units: 'km'
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`Route calculation failed: ${response.status}`, errorText);
            throw new Error(`Route calculation failed: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();

        if (!data.features || data.features.length === 0) {
            throw new Error('No route found between the specified coordinates');
        }

        const route = data.features[0];
        
        // Convert coordinates from [lng, lat] to [lat, lng] for Leaflet
        const geometry = route.geometry.coordinates.map(coord => [coord[1], coord[0]]);

        return {
            distance: route.properties.summary.distance,
            duration: route.properties.summary.duration,
            geometry: geometry
        };
        
    } catch (error) {
        console.error('Route calculation error:', error);
        throw error;
    }
}