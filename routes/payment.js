const express = require('express');
const router = express.Router();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const Booking = require('../models/Booking');
const { isCustomer } = require('../middleware/auth');

// Fallback GET handler (Redirects back to bookings)
// This prevents "Cannot GET" errors if a user refreshes the page or goes back
router.get('/create-checkout-session/:bookingId', isCustomer, (req, res) => {
    res.redirect('/user/bookings');
});

// Create Stripe Checkout Session
router.post('/create-checkout-session/:bookingId', isCustomer, async (req, res) => {
    try {
        // Special case for "back" string if it accidentally enters the URL
        if (req.params.bookingId === 'back') {
            return res.redirect('/user/bookings');
        }

        const booking = await Booking.findById(req.params.bookingId).populate({
            path: 'providerId',
            populate: { path: 'userId' }
        });

        if (!booking) {
            req.flash('error', 'Booking not found.');
            return res.redirect('back');
        }

        // Use proposedAmount if totalAmount isn't set
        const amount = booking.totalAmount > 0 ? booking.totalAmount : booking.proposedAmount;

        if (amount <= 0) {
            req.flash('error', 'Payment amount must be greater than zero.');
            return res.redirect('back');
        }

        // Create Checkout Session
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [
                {
                    price_data: {
                        currency: 'inr',
                        product_data: {
                            name: `Service: ${booking.service.category}`,
                            description: `Provider: ${booking.providerId.userId.fullName}`,
                        },
                        unit_amount: amount * 100, // Stripe uses paise/cents
                    },
                    quantity: 1,
                },
            ],
            mode: 'payment',
            success_url: `${req.protocol}://${req.get('host')}/payment/success/${booking._id}?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${req.protocol}://${req.get('host')}/user/bookings`,
            customer_email: req.user.email,
            metadata: {
                bookingId: booking._id.toString()
            }
        });

        res.redirect(303, session.url);
    } catch (err) {
        console.error('Stripe Session Error:', err);
        req.flash('error', 'Failed to initialize Stripe payment. Check your API keys.');
        res.redirect('back');
    }
});

// Success Page / Handle Successful Payment
router.get('/success/:bookingId', isCustomer, async (req, res) => {
    try {
        const { session_id } = req.query;
        const session = await stripe.checkout.sessions.retrieve(session_id);

        if (session.payment_status === 'paid') {
            const booking = await Booking.findById(req.params.bookingId).populate('providerId');
            
            if (booking && booking.paymentStatus !== 'paid') {
                booking.paymentStatus = 'paid';
                booking.paymentMethod = 'online';
                
                // If the booking was pending/received, accept it automatically on payment
                if (booking.status === 'pending') {
                    booking.status = 'accepted';
                    // Synchronize totalAmount if it was just a quote
                    if (booking.totalAmount <= 0) {
                        booking.totalAmount = booking.proposedAmount;
                    }
                }
                
                await booking.save();

                // Notify provider (similar to manual payment logic)
                const io = req.app.get('io');
                if (io) {
                    const providerUserId = booking.providerId.userId;
                    io.to(`user-${providerUserId}`).emit('notification', {
                        title: 'Payment Confirmed! 💰',
                        content: `${req.user.fullName} has paid ₹${booking.totalAmount || booking.proposedAmount} via Stripe. Check your dashboard.`,
                        type: 'success',
                        bookingId: booking._id
                    });
                }

                req.flash('success', 'Payment successful! Thank you for using NearFix.');
            }
        }
        res.redirect('/user/bookings');
    } catch (err) {
        console.error('Payment Success Error:', err);
        res.redirect('/user/bookings');
    }
});

module.exports = router;
