export default async function handler(req, res) {
    // Only accept POST requests
    if (req.method !== 'POST') {
        return res.status(405).json({ 
            success: false,
            error: 'Method not allowed. Please use POST.' 
        });
    }

    // Load environment variables
    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    const SENDER_EMAIL = process.env.SENDER_EMAIL;
    const OWNER_EMAIL = process.env.OWNER_EMAIL;
    
    // Validate environment configuration
    if (!RESEND_API_KEY) {
        console.error('RESEND_API_KEY environment variable is not configured');
        return res.status(500).json({ 
            success: false,
            error: 'Email service not configured. Please contact support.'
        });
    }

    if (!OWNER_EMAIL) {
        console.error('OWNER_EMAIL environment variable is not configured');
        return res.status(500).json({ 
            success: false,
            error: 'Admin notification email not configured. Please contact support.'
        });
    }

    // Extract booking data from request body
    const { 
        name, email, phone, pickup, dropoff, date, time,
        tripType, sameDayReturn, returnDate, returnTime,
        passengers, vehicleType, vehicleRate, 
        distance, baseFee, distanceCharge, price,
        pickupAddress, dropoffAddress
    } = req.body;

    // Validate required fields
    const requiredFields = ['name', 'email', 'phone', 'pickup', 'dropoff', 'distance', 'price'];
    const missingFields = requiredFields.filter(field => !req.body[field]);
    
    if (missingFields.length > 0) {
        return res.status(400).json({ 
            success: false,
            error: `Missing required fields: ${missingFields.join(', ')}`
        });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return res.status(400).json({ 
            success: false,
            error: 'Invalid email address format'
        });
    }

    console.log(`📨 Processing booking for ${name} (${email})`);

    try {
        // Generate unique booking reference
        const bookingReference = generateBookingReference();
        
        // Prepare booking data for email templates
        const bookingData = {
            name, 
            email, 
            phone, 
            pickup: pickupAddress || pickup, 
            dropoff: dropoffAddress || dropoff, 
            date: date || 'Flexible', 
            time: time || 'Flexible',
            tripType, 
            sameDayReturn, 
            returnDate, 
            returnTime,
            passengers, 
            vehicleType, 
            vehicleRate,
            distance, 
            baseFee, 
            distanceCharge, 
            price,
            bookingReference
        };

        // Send customer confirmation email
        const customerEmailResponse = await sendEmail({
            apiKey: RESEND_API_KEY,
            from: SENDER_EMAIL,
            to: [email],
            subject: `Your Shuttle Quote #${bookingReference} - R${parseFloat(price).toFixed(2)}`,
            html: generateCustomerEmailHTML(bookingData),
            tags: [
                { name: 'category', value: 'booking-quote' }
            ]
        });

        if (!customerEmailResponse.ok) {
            const errorText = await customerEmailResponse.text();
            console.error('Customer email failed:', errorText);
            throw new Error('Failed to send customer confirmation email');
        }

        console.log(`✅ Customer email sent to ${email}`);

        // Send owner notification email
        const ownerEmailResponse = await sendEmail({
            apiKey: RESEND_API_KEY,
            from: SENDER_EMAIL,
            to: [OWNER_EMAIL],
            subject: `🚗 New Booking #${bookingReference} - ${name}`,
            html: generateOwnerEmailHTML(bookingData),
            tags: [
                { name: 'category', value: 'new-booking' },
                { name: 'priority', value: 'high' }
            ]
        });

        if (!ownerEmailResponse.ok) {
            const errorText = await ownerEmailResponse.text();
            console.error('Owner email failed:', errorText);
            // Don't throw error here - customer already got their email
            console.warn('Owner notification failed but customer was notified');
        } else {
            console.log(`✅ Admin email sent to ${OWNER_EMAIL}`);
        }

        // Log successful booking
        console.log(`🎉 Booking ${bookingReference} completed successfully`);
        console.log(`   Customer: ${name} (${email})`);
        console.log(`   Route: ${pickup} → ${dropoff}`);
        console.log(`   Price: R${price}`);
        console.log(`   Vehicle: ${vehicleType}`);

        // Return success response
        return res.status(200).json({
            success: true,
            message: 'Quote sent successfully to your email',
            bookingReference: bookingReference,
            data: {
                customer: { name, email, phone },
                trip: { 
                    pickup: pickupAddress || pickup, 
                    dropoff: dropoffAddress || dropoff, 
                    distance, 
                    price 
                },
                reference: bookingReference,
                timestamp: new Date().toISOString()
            }
        });

    } catch (error) {
        console.error('❌ Email sending error:', error);
        
        return res.status(500).json({ 
            success: false,
            error: error.message || 'Failed to send quote email. Please try again or contact support.',
            debug: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
}

/**
 * Send email via Resend API
 * @param {Object} params - Email parameters
 * @param {string} params.apiKey - Resend API key
 * @param {string} params.from - Sender email address
 * @param {string[]} params.to - Recipient email addresses
 * @param {string} params.subject - Email subject
 * @param {string} params.html - HTML email content
 * @param {Array} params.tags - Email tags for categorization
 * @returns {Promise<Response>} Fetch response
 */
async function sendEmail({ apiKey, from, to, subject, html, tags = [] }) {
    const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            from,
            to,
            subject,
            html,
            tags
        })
    });
    
    return response;
}

/**
 * Generate unique booking reference
 * Format: MSS-{timestamp}-{random}
 * @returns {string} Booking reference code
 */
function generateBookingReference() {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `MSS-${timestamp}-${random}`;
}

/**
 * Generate customer confirmation email HTML
 * (Template unchanged - original implementation)
 */
function generateCustomerEmailHTML(data) {
    const {
        name, email, phone, pickup, dropoff, date, time,
        tripType, sameDayReturn, returnDate, returnTime,
        passengers, vehicleType, vehicleRate,
        distance, baseFee, distanceCharge, price,
        bookingReference
    } = data;

    const vehicleNames = {
        'premier-sedan': 'Premier Sedan',
        'luxury-sedan': 'Luxury Sedan',
        'suv': 'SUV',
        'van-7-seater': 'Van (7 Seater)',
        'van-14-seater': 'Van (14 Seater)',
        'minibus': 'Minibus'
    };

    const isReturnTrip = tripType === 'return';
    const vehicleName = vehicleNames[vehicleType] || vehicleType;

    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Your Shuttle Quote - Modjadji's Shuttle Service</title>
    <style>
        body { 
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
            line-height: 1.6; 
            color: #333; 
            max-width: 600px; 
            margin: 0 auto; 
            padding: 20px; 
            background-color: #f5f7fa;
        }
        .email-container {
            background: white;
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 4px 20px rgba(0,0,0,0.1);
        }
        .email-header {
            background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%);
            color: white;
            padding: 40px 30px;
            text-align: center;
        }
        .email-header h1 {
            margin: 0;
            font-size: 28px;
            font-weight: 700;
        }
        .email-header p {
            margin: 10px 0 0;
            opacity: 0.9;
            font-size: 16px;
        }
        .email-content {
            padding: 40px 30px;
        }
        .reference-box {
            background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
            border: 2px solid #f59e0b;
            border-radius: 10px;
            padding: 20px;
            text-align: center;
            margin: 0 0 30px;
        }
        .reference-label {
            font-size: 14px;
            color: #92400e;
            margin-bottom: 5px;
        }
        .reference-code {
            font-size: 24px;
            font-weight: 800;
            color: #92400e;
            letter-spacing: 1px;
        }
        .section {
            background: #f8fafc;
            border-radius: 10px;
            padding: 25px;
            margin-bottom: 25px;
            border: 1px solid #e2e8f0;
        }
        .section-title {
            color: #1e40af;
            font-size: 18px;
            font-weight: 600;
            margin-bottom: 20px;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .detail-row {
            display: flex;
            justify-content: space-between;
            padding: 12px 0;
            border-bottom: 1px solid #e2e8f0;
        }
        .detail-row:last-child {
            border-bottom: none;
        }
        .detail-label {
            font-weight: 500;
            color: #475569;
        }
        .detail-value {
            font-weight: 600;
            color: #0f172a;
            text-align: right;
        }
        .price-section {
            background: linear-gradient(135deg, #dbeafe 0%, #eff6ff 100%);
            border: 2px solid #3b82f6;
            padding: 30px;
            border-radius: 10px;
            text-align: center;
        }
        .total-price {
            font-size: 42px;
            font-weight: 800;
            color: #1e40af;
            margin: 15px 0;
        }
        .price-note {
            font-size: 14px;
            color: #64748b;
            margin-top: 10px;
        }
        .action-box {
            background: linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%);
            border: 2px solid #10b981;
            border-radius: 10px;
            padding: 25px;
            margin: 30px 0;
        }
        .action-title {
            color: #065f46;
            font-size: 18px;
            font-weight: 600;
            margin-bottom: 15px;
        }
        .contact-info {
            background: #f1f5f9;
            border-radius: 10px;
            padding: 25px;
            margin-top: 30px;
        }
        .contact-item {
            display: flex;
            align-items: center;
            gap: 15px;
            margin-bottom: 15px;
        }
        .contact-item:last-child {
            margin-bottom: 0;
        }
        .contact-icon {
            color: #3b82f6;
            font-size: 20px;
            width: 24px;
        }
        .email-footer {
            text-align: center;
            color: #64748b;
            font-size: 14px;
            margin-top: 40px;
            padding-top: 20px;
            border-top: 1px solid #e2e8f0;
        }
        @media (max-width: 600px) {
            .email-content {
                padding: 25px 20px;
            }
            .detail-row {
                flex-direction: column;
                gap: 5px;
            }
            .total-price {
                font-size: 32px;
            }
        }
    </style>
</head>
<body>
    <div class="email-container">
        <div class="email-header">
            <h1>🚐 Your Shuttle Quote</h1>
            <p>Modjadji's Shuttle Service - Professional Transportation</p>
        </div>
        
        <div class="email-content">
            <div class="reference-box">
                <div class="reference-label">BOOKING REFERENCE</div>
                <div class="reference-code">${bookingReference}</div>
                <div style="font-size: 12px; color: #92400e; margin-top: 8px;">
                    Save this number for all communications
                </div>
            </div>
            
            <h2 style="color: #1e40af; margin-bottom: 25px;">Hello ${name}!</h2>
            <p style="color: #475569; margin-bottom: 30px; font-size: 16px;">
                Thank you for choosing Modjadji's Shuttle Service! Your booking request has been received 
                and a quote has been prepared based on your requirements.
            </p>
            
            <div class="section">
                <div class="section-title">👤 Passenger Information</div>
                <div class="detail-row">
                    <span class="detail-label">Name: </span>
                    <span class="detail-value">${name}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Email: </span>
                    <span class="detail-value">${email}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Phone: </span>
                    <span class="detail-value">${phone}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Passengers: </span>
                    <span class="detail-value">${passengers} person(s)</span>
                </div>
            </div>
            
            <div class="section">
                <div class="section-title">📍 Trip Details</div>
                <div class="detail-row">
                    <span class="detail-label">Trip Type: </span>
                    <span class="detail-value">${isReturnTrip ? 'Return Trip' : 'Single Trip'}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Pickup Location</span>
                    <span class="detail-value">${pickup}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Drop-off Location</span>
                    <span class="detail-value">${dropoff}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Date: </span>
                    <span class="detail-value">${date}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Time: </span>
                    <span class="detail-value">${time}</span>
                </div>
                ${isReturnTrip ? `
                <div class="detail-row">
                    <span class="detail-label">Same Day Return</span>
                    <span class="detail-value">${sameDayReturn === 'yes' ? 'Yes' : 'No'}</span>
                </div>
                ${sameDayReturn === 'no' && returnDate ? `
                <div class="detail-row">
                    <span class="detail-label">Return Date</span>
                    <span class="detail-value">${returnDate}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Return Time</span>
                    <span class="detail-value">${returnTime}</span>
                </div>
                ` : ''}
                ` : ''}
            </div>
            
            <div class="section">
                <div class="section-title">🚗 Vehicle & Pricing Details</div>
                <div class="detail-row">
                    <span class="detail-label">Vehicle Type: </span>
                    <span class="detail-value">${vehicleName}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Distance: </span>
                    <span class="detail-value">${parseFloat(distance).toFixed(1)} km ${isReturnTrip ? '× 2 for return' : ''}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Vehicle Rate: </span>
                    <span class="detail-value">R${vehicleRate}/km</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Base Fee: </span>
                    <span class="detail-value">R${parseFloat(baseFee).toFixed(2)}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Distance Charge: </span>
                    <span class="detail-value">R${parseFloat(distanceCharge).toFixed(2)}</span>
                </div>
            </div>
            
            <div class="price-section">
                <div style="font-size: 18px; color: #475569;">Total Price</div>
                <div class="total-price">R${parseFloat(price).toFixed(2)}</div>
                <div class="price-note">
                    Includes 15% VAT • Price guaranteed for 24 hours
                </div>
            </div>
            
            <div class="action-box">
                <div class="action-title">📋 Next Steps</div>
                <ol style="margin: 0; padding-left: 20px; color: #475569;">
                    <li style="margin-bottom: 10px;">We will contact you within <strong>2 hours</strong> to confirm vehicle availability</li>
                    <li style="margin-bottom: 10px;">Payment details will be provided upon confirmation</li>
                    <li style="margin-bottom: 10px;">Accepted payment methods: Bank Transfer, Cash, Card</li>
                    <li>Keep your booking reference: <strong>${bookingReference}</strong></li>
                </ol>
            </div>
            
            <div class="contact-info">
                <div class="contact-item">
                    <span class="contact-icon">📧</span>
                    <div>
                        <div style="font-size: 12px; color: #64748b;">Email Support</div>
                        <div style="font-weight: 600; color: #0f172a;">modjadjishuttle@gmail.com</div>
                    </div>
                </div>
                <div class="contact-item">
                    <span class="contact-icon">📞</span>
                    <div>
                        <div style="font-size: 12px; color: #64748b;">Phone Support</div>
                        <div style="font-weight: 600; color: #0f172a;">+27 11 123 4567</div>
                    </div>
                </div>
                <div class="contact-item">
                    <span class="contact-icon">⏰</span>
                    <div>
                        <div style="font-size: 12px; color: #64748b;">Cancellation Policy</div>
                        <div style="font-weight: 600; color: #0f172a;">Free cancellation up to 2 hours before pickup</div>
                    </div>
                </div>
            </div>
            
            <div class="email-footer">
                <p>This is an automated quote from Modjadji's Shuttle Service</p>
                <p>&copy; ${new Date().getFullYear()} Modjadji's Shuttle Service | All Rights Reserved</p>
                <p style="font-size: 12px; margin-top: 10px;">
                    Please do not reply to this email. For inquiries, use the contact information above.
                </p>
            </div>
        </div>
    </div>
</body>
</html>
    `;
}

/**
 * Generate owner notification email HTML
 * (Template unchanged - original implementation)
 */
function generateOwnerEmailHTML(data) {
    const {
        name, email, phone, pickup, dropoff, date, time,
        tripType, sameDayReturn, returnDate, returnTime,
        passengers, vehicleType, vehicleRate,
        distance, baseFee, distanceCharge, price,
        bookingReference
    } = data;

    const vehicleNames = {
        'premier-sedan': 'Premier Sedan',
        'luxury-sedan': 'Luxury Sedan',
        'suv': 'SUV',
        'van-7-seater': 'Van (7 Seater)',
        'van-14-seater': 'Van (14 Seater)',
        'minibus': 'Minibus'
    };

    const isReturnTrip = tripType === 'return';
    const vehicleName = vehicleNames[vehicleType] || vehicleType;
    const totalPrice = parseFloat(price).toFixed(2);

    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>New Booking Alert #${bookingReference}</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 800px; margin: 0 auto; padding: 20px; }
        .header { 
            background: linear-gradient(135deg, #dc2626 0%, #ef4444 100%); 
            color: white; 
            padding: 30px; 
            border-radius: 10px 10px 0 0;
            text-align: center;
        }
        .urgent-alert {
            background: #fef3c7;
            border: 2px solid #f59e0b;
            border-radius: 8px;
            padding: 20px;
            margin: 20px 0;
            display: flex;
            align-items: center;
            gap: 15px;
        }
        .info-card {
            background: white;
            border: 1px solid #e5e7eb;
            border-radius: 8px;
            padding: 25px;
            margin-bottom: 20px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
        .info-card h3 {
            color: #1e40af;
            margin-top: 0;
            border-bottom: 2px solid #e5e7eb;
            padding-bottom: 10px;
        }
        .detail-table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 15px;
        }
        .detail-table td {
            padding: 12px 15px;
            border-bottom: 1px solid #e5e7eb;
        }
        .detail-table td:first-child {
            font-weight: 600;
            color: #4b5563;
            width: 200px;
        }
        .price-highlight {
            background: #dbeafe;
            border: 2px solid #3b82f6;
            border-radius: 8px;
            padding: 20px;
            margin: 20px 0;
            text-align: center;
        }
        .total-price {
            font-size: 36px;
            font-weight: 800;
            color: #1e40af;
            margin: 10px 0;
        }
        .footer {
            text-align: center;
            color: #6b7280;
            font-size: 14px;
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #e5e7eb;
        }
        .timestamp {
            background: #f3f4f6;
            padding: 10px 15px;
            border-radius: 6px;
            font-size: 14px;
            color: #4b5563;
            margin-bottom: 20px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1 style="margin: 0;">🚨 NEW BOOKING REQUEST</h1>
            <h2 style="margin: 10px 0 0; opacity: 0.9;">Reference: ${bookingReference}</h2>
        </div>
        
        <div class="urgent-alert">
            <span style="font-size: 24px;">⏰</span>
            <div>
                <strong style="font-size: 18px; color: #92400e;">ACTION REQUIRED</strong>
                <p style="margin: 5px 0 0; color: #92400e;">
                    Contact customer within <strong>2 hours</strong> to confirm booking availability
                </p>
            </div>
        </div>
        
        <div class="timestamp">
            📅 Received: ${new Date().toLocaleString('en-ZA', { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                timeZoneName: 'short'
            })}
        </div>
        
        <div class="info-card">
            <h3>👤 Customer Information</h3>
            <table class="detail-table">
                <tr><td>Name</td><td>${name}</td></tr>
                <tr><td>Email</td><td>${email}</td></tr>
                <tr><td>Phone</td><td>${phone}</td></tr>
                <tr><td>Passengers</td><td>${passengers} person(s)</td></tr>
            </table>
        </div>
        
        <div class="info-card">
            <h3>📍 Trip Details</h3>
            <table class="detail-table">
                <tr><td>Trip Type</td><td>${isReturnTrip ? 'Return Trip' : 'Single Trip'}</td></tr>
                ${isReturnTrip ? `
                <tr><td>Same Day Return</td><td>${sameDayReturn === 'yes' ? 'Yes' : 'No'}</td></tr>
                ${sameDayReturn === 'no' && returnDate ? `
                <tr><td>Return Date</td><td>${returnDate}</td></tr>
                <tr><td>Return Time</td><td>${returnTime}</td></tr>
                ` : ''}
                ` : ''}
                <tr><td>Pickup Location</td><td>${pickup}</td></tr>
                <tr><td>Drop-off Location</td><td>${dropoff}</td></tr>
                <tr><td>Date</td><td>${date}</td></tr>
                <tr><td>Time</td><td>${time}</td></tr>
                <tr><td>Vehicle Type</td><td>${vehicleName} (${vehicleType})</td></tr>
                <tr><td>Distance</td><td>${parseFloat(distance).toFixed(1)} km ${isReturnTrip ? '(one way, ×2 for return)' : ''}</td></tr>
            </table>
        </div>
        
        <div class="info-card">
            <h3>💰 Pricing Breakdown</h3>
            <table class="detail-table">
                <tr><td>Base Fee</td><td>R${parseFloat(baseFee).toFixed(2)}</td></tr>
                <tr><td>Vehicle Rate</td><td>R${vehicleRate}/km</td></tr>
                <tr><td>Distance Charge</td><td>R${parseFloat(distanceCharge).toFixed(2)}</td></tr>
                <tr style="background: #f0f9ff;">
                    <td><strong>TOTAL PRICE</strong></td>
                    <td><strong>R${totalPrice}</strong></td>
                </tr>
            </table>
        </div>
        
        <div class="price-highlight">
            <div style="font-size: 18px; color: #1e40af;">Booking Total</div>
            <div class="total-price">R${totalPrice}</div>
            <div style="color: #6b7280; margin-top: 10px;">
                Booking Reference: <strong>${bookingReference}</strong>
            </div>
        </div>
        
        <div class="info-card">
            <h3>📋 Action Items</h3>
            <ol style="margin: 0; padding-left: 20px; color: #4b5563;">
                <li style="margin-bottom: 10px;">Contact customer at <strong>${phone}</strong> or <strong>${email}</strong></li>
                <li style="margin-bottom: 10px;">Confirm vehicle availability for requested date/time</li>
                <li style="margin-bottom: 10px;">Provide payment instructions</li>
                <li style="margin-bottom: 10px;">Update booking status in system</li>
                <li>Send confirmation email to customer</li>
            </ol>
            
            <div style="margin-top: 25px; text-align: center; padding-top: 20px; border-top: 2px solid #e5e7eb;">
                <a href="mailto:${email}?subject=Payment Method Confirmed&body=This is a confirmation that we have agreed on the payment method for your booking reference ${bookingReference}. Thank you for choosing Modjadji's Shuttle Service." 
                   style="display: inline-block; background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%); color: white; padding: 15px 40px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                    Confirm Payment Method
                </a>
                <p style="margin: 15px 0 0; font-size: 13px; color: #6b7280;">
                    Click after calling customer and agreeing on payment method
                </p>
            </div>
        </div>
        
        <div class="footer">
            <p>This is an automated notification from Modjadji's Shuttle Service Payment System</p>
            <p>&copy; ${new Date().getFullYear()} Modjadji's Shuttle Service</p>
        </div>
    </div>
</body>
</html> `;
}


