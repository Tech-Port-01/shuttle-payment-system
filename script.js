// ===== CONFIGURATION =====
const API_BASE_URL = window.location.origin;
const VEHICLE_RATES = {
    'premier-sedan': 8,
    'luxury-sedan': 12,
    'suv': 15,
    'van-7-seater': 18,
    'van-14-seater': 25,
    'minibus': 30
};
const BASE_FEE = 50;
const VEHICLE_NAMES = {
    'premier-sedan': 'Premier Sedan',
    'luxury-sedan': 'Luxury Sedan',
    'suv': 'SUV',
    'van-7-seater': 'Van (7 Seater)',
    'van-14-seater': 'Van (14 Seater)',
    'minibus': 'Minibus'
};

// ===== GLOBAL VARIABLES =====
let map = null;
let routeLayer = null;
let pickupMarker = null;
let dropoffMarker = null;
let currentRoute = null;
let selectedVehicle = 'premier-sedan';

// ===== INITIALIZATION =====
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 Payment System Initialized');
    
    // Initialize map first
    try {
        initMap();
    } catch (error) {
        console.warn('Map initialization warning:', error);
        showStatus('Map service loading...', 'info');
        setTimeout(initMap, 1000);
    }
    
    // Setup event listeners
    setupEventListeners();
    
    // Check for URL parameters from booking site
    checkURLParameters();
    
    // Setup trip type listeners
    setupTripTypeListeners();
    
    // Setup vehicle selection
    setupVehicleSelection();
    
    // Update today's date as minimum for date inputs
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('date').min = today;
    document.getElementById('returnDate').min = today;
    
    console.log('✅ System ready');
});

// ===== URL PARAMETER HANDLING =====
function checkURLParameters() {
    try {
        const urlParams = new URLSearchParams(window.location.search);
        
        // Only auto-fill if coming from booking site
        if (urlParams.has('from') && urlParams.get('from') === 'booking') {
            console.log('📋 Loading data from booking website...');
            
            // Map URL parameters to form fields
            const fieldMap = {
                'name': 'name',
                'email': 'email',
                'phone': 'phone',
                'pickup': 'pickup',
                'dropoff': 'dropoff',
                'date': 'date',
                'time': 'time',
                'tripType': 'tripType',
                'passengers': 'passengers'
            };
            
            let loadedFields = [];
            
            for (const [param, fieldId] of Object.entries(fieldMap)) {
                if (urlParams.has(param)) {
                    const value = decodeURIComponent(urlParams.get(param));
                    const field = document.getElementById(fieldId);
                    
                    if (field) {
                        if (field.type === 'select-one') {
                            const option = field.querySelector(`option[value="${value}"]`);
                            if (option) {
                                field.value = value;
                                loadedFields.push(param);
                            }
                        } else {
                            field.value = value;
                            loadedFields.push(param);
                        }
                    }
                }
            }
            
            // Handle vehicle selection
            if (urlParams.has('vehicle')) {
                const vehicle = urlParams.get('vehicle');
                if (VEHICLE_RATES[vehicle]) {
                    selectedVehicle = vehicle;
                    const vehicleInput = document.querySelector(`input[name="vehicleType"][value="${vehicle}"]`);
                    if (vehicleInput) {
                        vehicleInput.checked = true;
                        const vehicleOption = vehicleInput.closest('.vehicle-option');
                        if (vehicleOption) {
                            document.querySelectorAll('.vehicle-option').forEach(opt => {
                                opt.classList.remove('selected');
                            });
                            vehicleOption.classList.add('selected');
                        }
                        loadedFields.push('vehicle');
                    }
                }
            }
            
            // Show success message if we loaded data
            if (loadedFields.length > 0) {
                showStatus(`✓ Loaded ${loadedFields.length} fields from booking. Ready to calculate route.`, 'success');
                
                // Auto-calculate if we have pickup and dropoff
                setTimeout(() => {
                    const pickup = document.getElementById('pickup').value.trim();
                    const dropoff = document.getElementById('dropoff').value.trim();
                    
                    if (pickup && dropoff) {
                        showStatus('Auto-calculating route from booking details...', 'info');
                        setTimeout(() => calculateRoute(), 500);
                    }
                }, 1000);
            }
        }
    } catch (error) {
        console.error('❌ Error loading URL parameters:', error);
    }
}

// ===== MAP INITIALIZATION =====
function initMap() {
    try {
        // Default to Johannesburg coordinates
        const defaultCenter = [-26.2041, 28.0473];
        const defaultZoom = 11;
        
        // Initialize map
        map = L.map('map', {
            zoomControl: false,
            attributionControl: true
        }).setView(defaultCenter, defaultZoom);
        
        // Add OpenStreetMap tiles
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            maxZoom: 19
        }).addTo(map);
        
        // Create route layer group
        routeLayer = L.layerGroup().addTo(map);
        
        // Add zoom control
        L.control.zoom({
            position: 'topright'
        }).addTo(map);
        
        console.log('✅ Map initialized successfully');
        
    } catch (error) {
        console.error('❌ Map initialization failed:', error);
        document.getElementById('map').innerHTML = `
            <div style="height:100%;display:flex;align-items:center;justify-content:center;background:#f1f5f9;border-radius:8px;">
                <div style="text-align:center;padding:20px;">
                    <i class="fas fa-map-marked-alt" style="font-size:48px;color:#94a3b8;margin-bottom:16px;"></i>
                    <h3 style="color:#475569;margin-bottom:8px;">Map Service Temporarily Unavailable</h3>
                    <p style="color:#64748b;">You can still proceed with booking. Route calculation will work.</p>
                </div>
            </div>
        `;
    }
}

// ===== EVENT LISTENERS =====
function setupEventListeners() {
    // Calculate button
    const calculateBtn = document.getElementById('calculateBtn');
    if (calculateBtn) {
        calculateBtn.addEventListener('click', calculateRoute);
    }
    
    // Form submission
    const bookingForm = document.getElementById('bookingForm');
    if (bookingForm) {
        bookingForm.addEventListener('submit', handleBooking);
    }
    
    // Required field validation
    document.querySelectorAll('input[required], select[required]').forEach(input => {
        input.addEventListener('blur', function() {
            validateField(this);
        });
        input.addEventListener('input', function() {
            if (this.value.trim()) {
                this.style.borderColor = '#10b981';
            }
        });
    });
    
    // Terms checkbox
    const termsCheckbox = document.getElementById('terms');
    if (termsCheckbox) {
        termsCheckbox.addEventListener('change', function() {
            updateSubmitButton();
        });
    }
    
    // Map controls
    const zoomInBtn = document.getElementById('zoomIn');
    const zoomOutBtn = document.getElementById('zoomOut');
    const resetMapBtn = document.getElementById('resetMap');
    const locateMeBtn = document.getElementById('locateMe');
    
    if (zoomInBtn) zoomInBtn.addEventListener('click', () => map && map.zoomIn());
    if (zoomOutBtn) zoomOutBtn.addEventListener('click', () => map && map.zoomOut());
    if (resetMapBtn) resetMapBtn.addEventListener('click', resetMapView);
    if (locateMeBtn) locateMeBtn.addEventListener('click', locateUser);
    
    // Passenger controls
    document.querySelectorAll('.passenger-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const action = this.dataset.action;
            const input = document.getElementById('passengers');
            let value = parseInt(input.value) || 1;
            
            if (action === 'increase' && value < 50) {
                value++;
            } else if (action === 'decrease' && value > 1) {
                value--;
            }
            
            input.value = value;
            validateField(input);
            
            // Update price if route exists
            if (currentRoute) {
                updatePriceDisplay();
            }
        });
    });
}

function setupTripTypeListeners() {
    const tripType = document.getElementById('tripType');
    const returnDetails = document.getElementById('returnDetails');
    const sameDayReturn = document.getElementById('sameDayReturn');
    const returnDateTimeFields = document.getElementById('returnDateTimeFields');
    
    if (!tripType) return;
    
    tripType.addEventListener('change', function() {
        if (this.value === 'return') {
            returnDetails.style.display = 'block';
            sameDayReturn.value = 'yes';
            returnDateTimeFields.style.display = 'none';
        } else {
            returnDetails.style.display = 'none';
        }
        
        // Update price if route exists
        if (currentRoute) {
            updatePriceDisplay();
        }
    });
    
    if (sameDayReturn) {
        sameDayReturn.addEventListener('change', function() {
            if (this.value === 'no') {
                returnDateTimeFields.style.display = 'block';
            } else {
                returnDateTimeFields.style.display = 'none';
            }
        });
    }
}

function setupVehicleSelection() {
    // Radio button changes
    document.querySelectorAll('input[name="vehicleType"]').forEach(radio => {
        radio.addEventListener('change', function() {
            if (this.checked) {
                selectedVehicle = this.value;
                
                // Update visual selection
                document.querySelectorAll('.vehicle-option').forEach(option => {
                    option.classList.remove('selected');
                });
                this.closest('.vehicle-option').classList.add('selected');
                
                // Update price if route exists
                if (currentRoute) {
                    updatePriceDisplay();
                }
            }
        });
    });
    
    // Click on vehicle option
    document.querySelectorAll('.vehicle-option').forEach(option => {
        option.addEventListener('click', function() {
            const radio = this.querySelector('input[type="radio"]');
            if (radio) {
                radio.checked = true;
                radio.dispatchEvent(new Event('change'));
            }
        });
    });
}

// ===== VALIDATION =====
function validateField(field) {
    if (!field.value.trim()) {
        field.style.borderColor = '#ef4444';
        return false;
    }
    
    // Email validation
    if (field.type === 'email') {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(field.value.trim())) {
            field.style.borderColor = '#ef4444';
            return false;
        }
    }
    
    // Phone validation (basic)
    if (field.type === 'tel') {
        const phone = field.value.replace(/\D/g, '');
        if (phone.length < 10) {
            field.style.borderColor = '#ef4444';
            return false;
        }
    }
    
    // Number validation
    if (field.type === 'number') {
        const value = parseInt(field.value);
        if (isNaN(value) || value < parseInt(field.min) || value > parseInt(field.max)) {
            field.style.borderColor = '#ef4444';
            return false;
        }
    }
    
    field.style.borderColor = '#10b981';
    return true;
}

function validateForm() {
    let isValid = true;
    const requiredFields = document.querySelectorAll('input[required], select[required]');
    
    requiredFields.forEach(field => {
        if (!validateField(field)) {
            isValid = false;
            // Scroll to first invalid field
            if (isValid === false) {
                field.scrollIntoView({ behavior: 'smooth', block: 'center' });
                field.focus();
            }
        }
    });
    
    return isValid;
}

// ===== ROUTE CALCULATION =====
async function calculateRoute() {
    // Validate form first
    if (!validateForm()) {
        showStatus('Please fill in all required fields correctly', 'error');
        return;
    }
    
    const pickup = document.getElementById('pickup').value.trim();
    const dropoff = document.getElementById('dropoff').value.trim();
    const passengers = document.getElementById('passengers').value;
    
    // Additional validation
    if (!pickup || !dropoff) {
        showStatus('Please enter both pickup and drop-off addresses', 'error');
        return;
    }
    
    if (!passengers || passengers < 1 || passengers > 50) {
        showStatus('Please enter a valid number of passengers (1-50)', 'error');
        document.getElementById('passengers').focus();
        return;
    }
    
    // Show loading state
    const calculateBtn = document.getElementById('calculateBtn');
    const originalText = calculateBtn.innerHTML;
    calculateBtn.classList.add('loading');
    calculateBtn.disabled = true;
    calculateBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Calculating...';
    
    showStatus('Calculating optimal route and price...', 'info');
    
    try {
        console.log('📍 Calculating route from:', pickup, 'to:', dropoff);
        
        const response = await fetch(`${API_BASE_URL}/api/ors`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({ 
                pickup, 
                dropoff, 
                vehicle: selectedVehicle 
            })
        });
        
        if (!response.ok) {
            let errorMessage = 'Route calculation failed';
            try {
                const errorData = await response.json();
                errorMessage = errorData.error || errorMessage;
            } catch (e) {
                errorMessage = `Server error (${response.status})`;
            }
            throw new Error(errorMessage);
        }
        
        const data = await response.json();
        console.log('✅ Route data received:', data);
        
        if (!data.distance || !data.pickupAddress || !data.dropoffAddress) {
            throw new Error('Incomplete route data received from server');
        }
        
        // Store route data
        currentRoute = {
            ...data,
            pickup: pickup,
            dropoff: dropoff,
            timestamp: new Date().toISOString()
        };
        
        // Display route on map
        displayRoute(data);
        
        // Update price display
        updatePriceDisplay();
        
        // Update map stats
        updateMapStats(data);
        
        // Enable submit button if terms are accepted
        updateSubmitButton();
        
        // Show success
        showStatus(`✓ Route calculated! Distance: ${data.distance.toFixed(1)} km`, 'success');
        
        // Update form field borders
        document.getElementById('pickup').style.borderColor = '#10b981';
        document.getElementById('dropoff').style.borderColor = '#10b981';
        document.getElementById('passengers').style.borderColor = '#10b981';
        
    } catch (error) {
        console.error('❌ Route calculation error:', error);
        
        let errorMessage = error.message;
        if (errorMessage.includes('pickup') || errorMessage.includes('Pickup')) {
            document.getElementById('pickup').style.borderColor = '#ef4444';
            errorMessage = 'Please check pickup address and try again';
        } else if (errorMessage.includes('drop-off') || errorMessage.includes('Dropoff')) {
            document.getElementById('dropoff').style.borderColor = '#ef4444';
            errorMessage = 'Please check drop-off address and try again';
        }
        
        showStatus(`Route calculation failed: ${errorMessage}`, 'error');
        
        // Display error on map
        displayErrorOnMap();
        
        // Disable submit button
        document.getElementById('submitBtn').disabled = true;
        
    } finally {
        // Restore button state
        calculateBtn.classList.remove('loading');
        calculateBtn.disabled = false;
        calculateBtn.innerHTML = originalText;
    }
}

// ===== PRICE CALCULATION =====
function updatePriceDisplay() {
    if (!currentRoute) return;
    
    const distance = currentRoute.distance;
    const tripType = document.getElementById('tripType').value;
    const vehicleRate = VEHICLE_RATES[selectedVehicle];
    const vehicleName = VEHICLE_NAMES[selectedVehicle];
    
    // Calculate distance charge
    let distanceCharge = distance * vehicleRate;
    let isReturnTrip = false;
    
    if (tripType === 'return') {
        distanceCharge *= 2;
        isReturnTrip = true;
    }
    
    // Calculate total price
    const totalPrice = BASE_FEE + distanceCharge;
    
    // Update display elements
    document.getElementById('distanceText').textContent = `${distance.toFixed(1)} km`;
    document.getElementById('distanceNote').textContent = isReturnTrip ? 'one way × 2 for return' : '';
    
    document.getElementById('vehicleRateText').textContent = `R${vehicleRate}/km`;
    document.getElementById('vehicleName').textContent = vehicleName;
    
    document.getElementById('baseFeeText').textContent = `R${BASE_FEE.toFixed(2)}`;
    
    document.getElementById('distanceCharge').textContent = `R${distanceCharge.toFixed(2)}`;
    document.getElementById('tripTypeHint').textContent = isReturnTrip ? 'return trip (double distance)' : 'single trip';
    
    document.getElementById('priceText').textContent = `R${totalPrice.toFixed(2)}`;
    
    // Show price display
    const priceDisplay = document.getElementById('priceDisplay');
    priceDisplay.style.display = 'block';
    
    // Store calculated prices
    currentRoute.price = totalPrice;
    currentRoute.distanceCharge = distanceCharge;
    currentRoute.vehicleRate = vehicleRate;
    currentRoute.isReturnTrip = isReturnTrip;
    
    console.log('💰 Price updated:', {
        distance,
        vehicleRate,
        distanceCharge,
        totalPrice,
        isReturnTrip
    });
}

// ===== MAP FUNCTIONS =====
function displayRoute(data) {
    if (!map) return;
    
    // Clear previous route
    routeLayer.clearLayers();
    
    try {
        // Add pickup marker
        if (data.pickupCoords) {
            const pickupLatLng = [data.pickupCoords[1], data.pickupCoords[0]];
            pickupMarker = L.marker(pickupLatLng, {
                icon: L.divIcon({
                    className: 'custom-marker',
                    html: `<div class="map-marker pickup"><i class="fas fa-map-marker-alt"></i></div>`,
                    iconSize: [40, 40],
                    iconAnchor: [20, 40]
                })
            }).bindPopup(`<b>Pickup:</b><br>${data.pickupAddress}`);
            routeLayer.addLayer(pickupMarker);
        }
        
        // Add dropoff marker
        if (data.dropoffCoords) {
            const dropoffLatLng = [data.dropoffCoords[1], data.dropoffCoords[0]];
            dropoffMarker = L.marker(dropoffLatLng, {
                icon: L.divIcon({
                    className: 'custom-marker',
                    html: `<div class="map-marker dropoff"><i class="fas fa-flag-checkered"></i></div>`,
                    iconSize: [40, 40],
                    iconAnchor: [20, 40]
                })
            }).bindPopup(`<b>Drop-off:</b><br>${data.dropoffAddress}`);
            routeLayer.addLayer(dropoffMarker);
        }
        
        // Add route line
        if (data.geometry && data.geometry.length > 0) {
            const routeLine = L.polyline(data.geometry, {
                color: '#3b82f6',
                weight: 5,
                opacity: 0.8,
                smoothFactor: 1
            });
            routeLayer.addLayer(routeLine);
            
            // Fit bounds to show entire route
            const bounds = routeLine.getBounds();
            map.fitBounds(bounds, {
                padding: [50, 50],
                maxZoom: 15
            });
        }
        
        console.log('✅ Route displayed on map');
        
    } catch (error) {
        console.error('❌ Error displaying route:', error);
    }
}

function updateMapStats(data) {
    if (!data.distance) return;
    
    // Calculate estimated duration (assuming 60km/h average speed)
    const durationMinutes = Math.round((data.distance / 60) * 60);
    
    // Update map stats display
    const distanceElement = document.getElementById('mapDistance');
    const durationElement = document.getElementById('mapDuration');
    const vehicleElement = document.getElementById('mapVehicle');
    
    if (distanceElement) {
        distanceElement.textContent = `${data.distance.toFixed(1)} km`;
    }
    
    if (durationElement) {
        durationElement.textContent = `${durationMinutes} min`;
    }
    
    if (vehicleElement) {
        vehicleElement.textContent = VEHICLE_NAMES[selectedVehicle];
    }
}

function displayErrorOnMap() {
    if (!map) return;
    
    routeLayer.clearLayers();
    
    // Add error marker
    const errorMarker = L.marker([-26.2041, 28.0473], {
        icon: L.divIcon({
            className: 'custom-marker',
            html: `<div class="map-marker error"><i class="fas fa-exclamation-triangle"></i></div>`,
            iconSize: [50, 50],
            iconAnchor: [25, 50]
        })
    }).bindPopup('<b>Route Calculation Failed</b><br>Please check addresses and try again');
    
    routeLayer.addLayer(errorMarker);
    map.setView([-26.2041, 28.0473], 11);
}

function resetMapView() {
    if (!map) return;
    
    routeLayer.clearLayers();
    map.setView([-26.2041, 28.0473], 11);
    currentRoute = null;
    
    // Reset map stats
    document.getElementById('mapDistance').textContent = '0 km';
    document.getElementById('mapDuration').textContent = '0 min';
    document.getElementById('mapVehicle').textContent = 'Sedan';
    
    // Hide price display
    document.getElementById('priceDisplay').style.display = 'none';
    
    showStatus('Map reset to default view', 'info');
}

function locateUser() {
    if (!navigator.geolocation) {
        showStatus('Geolocation is not supported by your browser', 'error');
        return;
    }
    
    showStatus('Locating your position...', 'info');
    
    navigator.geolocation.getCurrentPosition(
        (position) => {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            
            if (map) {
                map.setView([lat, lng], 15);
                
                // Add location marker
                L.marker([lat, lng], {
                    icon: L.divIcon({
                        className: 'custom-marker',
                        html: `<div class="map-marker current-location"><i class="fas fa-location-dot"></i></div>`,
                        iconSize: [40, 40],
                        iconAnchor: [20, 40]
                    })
                }).addTo(map)
                .bindPopup('<b>Your Current Location</b>')
                .openPopup();
                
                showStatus('Location found!', 'success');
            }
        },
        (error) => {
            let errorMessage = 'Unable to retrieve your location';
            switch (error.code) {
                case error.PERMISSION_DENIED:
                    errorMessage = 'Location permission denied. Please enable location services.';
                    break;
                case error.POSITION_UNAVAILABLE:
                    errorMessage = 'Location information unavailable.';
                    break;
                case error.TIMEOUT:
                    errorMessage = 'Location request timed out.';
                    break;
            }
            showStatus(errorMessage, 'error');
        },
        {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0
        }
    );
}

// ===== BOOKING SUBMISSION =====
async function handleBooking(event) {
    event.preventDefault();
    
    // Validate form
    if (!validateForm()) {
        showStatus('Please correct the errors in the form', 'error');
        return;
    }
    
    // Check if route is calculated
    if (!currentRoute) {
        showStatus('Please calculate route first', 'error');
        document.getElementById('calculateBtn').scrollIntoView({ behavior: 'smooth' });
        return;
    }
    
    // Check terms agreement
    if (!document.getElementById('terms').checked) {
        showStatus('Please accept the Terms & Conditions', 'error');
        document.getElementById('terms').focus();
        return;
    }
    
    // Show loading state
    const submitBtn = document.getElementById('submitBtn');
    const originalText = submitBtn.innerHTML;
    submitBtn.classList.add('loading');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
    
    showStatus('Preparing your booking quote...', 'info');
    
    // Prepare booking data
    const bookingData = {
        // Passenger information
        name: document.getElementById('name').value.trim(),
        email: document.getElementById('email').value.trim(),
        phone: document.getElementById('phone').value.trim(),
        passengers: parseInt(document.getElementById('passengers').value),
        
        // Trip details
        pickup: document.getElementById('pickup').value.trim(),
        dropoff: document.getElementById('dropoff').value.trim(),
        date: document.getElementById('date').value || new Date().toISOString().split('T')[0],
        time: document.getElementById('time').value || '09:00',
        tripType: document.getElementById('tripType').value,
        sameDayReturn: document.getElementById('sameDayReturn').value,
        returnDate: document.getElementById('returnDate').value || null,
        returnTime: document.getElementById('returnTime').value || null,
        
        // Vehicle and pricing
        vehicleType: selectedVehicle,
        vehicleRate: VEHICLE_RATES[selectedVehicle],
        distance: currentRoute.distance,
        baseFee: BASE_FEE,
        distanceCharge: currentRoute.distanceCharge,
        price: currentRoute.price,
        
        // Additional data
        timestamp: new Date().toISOString(),
        websiteOwnerEmail: 'modjadjishuttle@gmail.com',
        pickupAddress: currentRoute.pickupAddress || document.getElementById('pickup').value.trim(),
        dropoffAddress: currentRoute.dropoffAddress || document.getElementById('dropoff').value.trim(),
        bookingSource: 'payment-system',
        userAgent: navigator.userAgent
    };
    
    try {
        console.log('📤 Sending booking data:', bookingData);
        
        // Send booking request
        const result = await sendBookingRequest(bookingData);
        
        console.log('✅ Booking successful:', result);
        
        // Build success message
        let successMessage = `✓ Booking confirmed! Quote sent to ${bookingData.email}`;
        
        if (result.bookingReference) {
            successMessage += ` (Reference: ${result.bookingReference})`;
        }
        
        if (result.message) {
            successMessage += ` - ${result.message}`;
        }
        
        showStatus(successMessage, 'success');
        
        // Reset form after delay
        setTimeout(() => {
            resetForm();
            showStatus('Ready for new booking. Thank you for choosing Modjadji\'s Shuttle Service!', 'info');
        }, 10000);
        
    } catch (error) {
        console.error('❌ Booking submission error:', error);
        
        let errorMessage = 'Booking submission failed';
        if (error.message.includes('email') || error.message.includes('Email')) {
            errorMessage = 'Email service error. Please try again or contact support.';
        } else if (error.message.includes('network') || error.message.includes('Network')) {
            errorMessage = 'Network error. Please check your connection and try again.';
        } else {
            errorMessage = error.message;
        }
        
        showStatus(`Booking failed: ${errorMessage}`, 'error');
        
        // Re-enable submit button
        submitBtn.disabled = false;
        
    } finally {
        // Restore button state
        submitBtn.classList.remove('loading');
        submitBtn.innerHTML = originalText;
    }
}

async function sendBookingRequest(data) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/quote`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(data)
        });
        
        const responseText = await response.text();
        console.log('📧 Server response:', { status: response.status, text: responseText });
        
        if (!response.ok) {
            let errorData;
            try {
                errorData = JSON.parse(responseText);
            } catch (e) {
                errorData = { error: `Server error (${response.status})` };
            }
            throw new Error(errorData.error || `Request failed with status ${response.status}`);
        }
        
        let result;
        try {
            result = JSON.parse(responseText);
        } catch (e) {
            throw new Error('Invalid response from server');
        }
        
        if (!result.success) {
            throw new Error(result.error || 'Booking request failed');
        }
        
        return result;
        
    } catch (error) {
        console.error('❌ Request failed:', error);
        throw error;
    }
}

// ===== FORM MANAGEMENT =====
function updateSubmitButton() {
    const submitBtn = document.getElementById('submitBtn');
    const termsAccepted = document.getElementById('terms').checked;
    
    submitBtn.disabled = !(termsAccepted && currentRoute);
}

function resetForm() {
    // Reset form fields but keep URL parameters
    const form = document.getElementById('bookingForm');
    const urlParams = new URLSearchParams(window.location.search);
    
    // Don't reset fields that came from URL
    const preserveFields = ['name', 'email', 'phone', 'pickup', 'dropoff', 'date', 'time', 'passengers'];
    
    // Reset all form elements
    Array.from(form.elements).forEach(element => {
        if (element.type !== 'hidden' && element.type !== 'submit' && element.type !== 'button') {
            if (element.type === 'radio' || element.type === 'checkbox') {
                element.checked = false;
            } else if (!preserveFields.includes(element.id) || !urlParams.has(element.id)) {
                element.value = '';
            }
        }
    });
    
    // Reset specific controls
    document.getElementById('tripType').value = 'single';
    document.getElementById('returnDetails').style.display = 'none';
    document.getElementById('sameDayReturn').value = 'yes';
    document.getElementById('returnDateTimeFields').style.display = 'none';
    
    // Reset vehicle selection
    const defaultVehicle = document.querySelector('input[name="vehicleType"][value="premier-sedan"]');
    if (defaultVehicle) {
        defaultVehicle.checked = true;
        selectedVehicle = 'premier-sedan';
        document.querySelectorAll('.vehicle-option').forEach(opt => {
            opt.classList.remove('selected');
        });
        defaultVehicle.closest('.vehicle-option').classList.add('selected');
    }
    
    // Reset map and route
    resetMapView();
    
    // Hide price display
    document.getElementById('priceDisplay').style.display = 'none';
    
    // Reset terms
    document.getElementById('terms').checked = false;
    
    // Reset submit button
    updateSubmitButton();
    
    console.log('🔄 Form reset');
}

// ===== HELPER FUNCTIONS =====
function showStatus(message, type) {
    const statusEl = document.getElementById('statusMessage');
    if (!statusEl) return;
    
    statusEl.textContent = message;
    statusEl.className = `status-message ${type}`;
    statusEl.style.display = 'block';
    
    // Auto-hide success messages after 10 seconds
    if (type === 'success') {
        setTimeout(() => {
            statusEl.style.display = 'none';
        }, 10000);
    }
    
    // Scroll to status message
    statusEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// ===== UTILITY FUNCTIONS =====
function formatCurrency(amount) {
    return new Intl.NumberFormat('en-ZA', {
        style: 'currency',
        currency: 'ZAR',
        minimumFractionDigits: 2
    }).format(amount);
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-ZA', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}

function generateBookingId() {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `MSS-${timestamp}-${random}`.toUpperCase();
}

// ===== EXPORT FUNCTIONS FOR GLOBAL ACCESS =====
window.showTermsModal = function() {
    document.getElementById('termsModal').style.display = 'flex';
};

window.showPrivacyModal = function() {
    document.getElementById('privacyModal').style.display = 'flex';
};

window.closeModal = function() {
    document.querySelectorAll('.modal').forEach(modal => {
        modal.style.display = 'none';
    });
};

// ===== STYLE INJECTION FOR MAP MARKERS =====
(function injectMapStyles() {
    const style = document.createElement('style');
    style.textContent = `
        .map-marker {
            width: 40px;
            height: 40px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-size: 16px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            border: 3px solid white;
        }
        
        .map-marker.pickup {
            background: linear-gradient(135deg, #10b981 0%, #059669 100%);
        }
        
        .map-marker.dropoff {
            background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
        }
        
        .map-marker.error {
            background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
            width: 50px;
            height: 50px;
            font-size: 20px;
        }
        
        .map-marker.current-location {
            background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
        }
        
        .leaflet-popup-content {
            font-family: 'Inter', sans-serif;
            font-size: 14px;
            line-height: 1.5;
        }
        
        .leaflet-popup-content b {
            color: #1e40af;
        }
    `;
    document.head.appendChild(style);
})();