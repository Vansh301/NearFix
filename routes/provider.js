const express = require('express');
const router = express.Router();
const Booking = require('../models/Booking');
const Provider = require('../models/Provider');
const Requirement = require('../models/Requirement');
const Message = require('../models/Message');
const User = require('../models/User'); // Added User model

console.log('DEBUG: Provider Routes File Loaded');

router.use((req, res, next) => {
    console.log(`DEBUG: Provider Path Hit: ${req.method} ${req.url}`);
    next();
});

const { isProvider } = require('../middleware/auth');

// Provider Dashboard
router.get('/dashboard', isProvider, async (req, res) => {
    try {
        const provider = await Provider.findOne({ userId: req.user._id });
        if (!provider) return res.redirect('/provider/setup');

        const bookings = await Booking.find({ providerId: provider._id })
            .populate('customerId')
            .sort({ createdAt: -1 });
        
        const stats = {
            totalBookings: bookings.length,
            pendingBookings: bookings.filter(b => b.status === 'pending').length,
            completedBookings: bookings.filter(b => b.status === 'completed').length,
            earnings: provider.earnings || 0
        };

        // Sulekha-style: Fetch matching leads (Requirements)
        const categories = provider.services.map(s => s.category);
        const leads = await Requirement.find({
            category: { $in: categories },
            status: 'open'
        }).populate('customerId').sort({ urgency: -1, createdAt: -1 });

        res.render('provider/dashboard', { bookings, stats, provider, leads });
    } catch (err) {
        res.redirect('/');
    }
});

// Send Quote/Price
router.post('/booking/:id/quote', isProvider, async (req, res) => {
    console.log(`POST request received for booking: ${req.params.id}`);
    try {
        const { amount, description } = req.body;
        console.log(`Amount: ${amount}, Description: ${description}`);
        const booking = await Booking.findById(req.params.id).populate('providerId');
        
        if (!booking) {
            console.log('Booking not found');
            req.flash('error', 'Booking not found.');
            return res.redirect('back');
        }

        // Update booking with proposed amount
        booking.proposedAmount = parseFloat(amount);
        await booking.save();

        const Message = require('../models/Message');
        const quoteMsg = new Message({
            sender: req.user._id,
            receiver: booking.customerId,
            content: `Price Quote: ₹${amount}`,
            messageType: 'quote',
            proposedPrice: parseFloat(amount),
            bookingId: booking._id
        });
        await quoteMsg.save();

        const io = req.app.get('io');
        if (io) {
            const targetRoom = `user-${booking.customerId.toString()}`;
            io.to(targetRoom).emit('notification', {
                title: 'New Price Quote! 🏷️',
                content: `${req.user.fullName} sent a quote for ₹${amount}`,
                type: 'success',
                senderId: req.user._id.toString(),
                senderName: req.user.fullName,
                bookingId: booking._id.toString()
            });

            const chatRoom = [req.user._id.toString(), booking.customerId.toString()].sort().join('-');
            io.to(chatRoom).emit('message', {
                sender: req.user._id.toString(),
                content: quoteMsg.content,
                messageType: 'quote',
                proposedPrice: quoteMsg.proposedPrice,
                bookingId: booking._id.toString(),
                createdAt: quoteMsg.createdAt
            });
        }

        req.flash('success', 'Price quote sent successfully!');
        res.redirect('/provider/dashboard');
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to send quote.');
        res.redirect('back');
    }
});

// Update Booking Status
router.post('/booking/:id/status', isProvider, async (req, res) => {
    try {
        const { status } = req.body;
        const booking = await Booking.findById(req.params.id);
        
        if (!booking) {
            req.flash('error', 'Booking not found.');
            return res.redirect('back');
        }

        if (status === 'completed') {
            // Safety check: Ensure a price has been proposed
            if (booking.proposedAmount <= 0) {
                req.flash('error', 'You must send a price quote first.');
                return res.redirect('back');
            }

            booking.status = 'completed';
            booking.totalAmount = booking.proposedAmount; // Finalize the price
            
            // Only increment earnings if it's already paid (e.g. online)
            // Otherwise wait for 'receive payment' action for cash
            if (booking.paymentStatus === 'paid') {
                await Provider.findByIdAndUpdate(booking.providerId, {
                    $inc: { earnings: booking.totalAmount || 0 }
                });
            }
            
            await booking.save();

            // Send automated completion message in chat
            const doneMsg = new Message({
                sender: req.user._id,
                receiver: booking.customerId,
                content: `Success! Your project is now officially complete. 🛠️✅\n\nIt was a pleasure serving you! If you're happy with the results, please consider leaving a review in your "My Bookings" section. Your feedback helps me continue providing top-quality service. Thank you!`,
                messageType: 'text',
                bookingId: booking._id
            });
            await doneMsg.save();

            // Send real-time notification to client
            const io = req.app.get('io');
            if (io) {
                const targetRoom = `user-${booking.customerId.toString()}`;
                
                // 1. Toast Notification
                io.to(targetRoom).emit('notification', {
                    title: 'Project Completed! ✅',
                    content: `Your ${booking.service.category || 'service'} has been marked as complete. Please leave a review!`,
                    type: 'success', // Green theme
                    senderId: req.user._id.toString(),
                    senderName: req.user.fullName,
                    bookingId: booking._id.toString()
                });

                // 2. Emit chat message
                const chatRoom = [req.user._id.toString(), booking.customerId.toString()].sort().join('-');
                io.to(chatRoom).emit('message', {
                    sender: req.user._id.toString(),
                    content: doneMsg.content,
                    messageType: 'text',
                    bookingId: booking._id.toString(),
                    createdAt: doneMsg.createdAt
                });
            }
        } else {
            booking.status = status;
            await booking.save();

            // Send real-time notification to client
            const io = req.app.get('io');
            if (io) {
                const targetRoom = `user-${booking.customerId.toString()}`;
                
                if (status === 'rejected') {
                    // 1. Toast Notification
                    io.to(targetRoom).emit('notification', {
                        title: 'Booking Rejected ❌',
                        content: `The worker has rejected your booking for ${booking.service.category || 'service'}.`,
                        type: 'cancel', // Red theme
                        senderId: req.user._id.toString(),
                        senderName: req.user.fullName,
                        bookingId: booking._id.toString()
                    });

                    // 2. Automated Chat Message for record
                    const rejectMsg = new Message({
                        sender: req.user._id,
                        receiver: booking.customerId,
                        content: `I'm sorry, I cannot take this booking for ${booking.service.category} at this time.`,
                        messageType: 'text',
                        bookingId: booking._id
                    });
                    await rejectMsg.save();

                    // 3. Emit message to chat window
                    const chatRoom = [req.user._id.toString(), booking.customerId.toString()].sort().join('-');
                    io.to(chatRoom).emit('message', {
                        sender: req.user._id.toString(),
                        content: rejectMsg.content,
                        messageType: 'text',
                        bookingId: booking._id.toString(),
                        createdAt: rejectMsg.createdAt
                    });
                } else if (status === 'accepted') {
                    io.to(targetRoom).emit('notification', {
                        title: 'Booking Accepted! ✅',
                        content: `The worker has accepted your booking for ${booking.service.category || 'service'}. Check the chat for price details!`,
                        type: 'success', // Green theme
                        senderId: req.user._id.toString(),
                        senderName: req.user.fullName,
                        bookingId: booking._id.toString()
                    });
                }
            }
        }

        req.flash('success', `Booking ${status} successfully!`);
        res.redirect('/provider/dashboard');
    } catch (err) {
        req.flash('error', 'Failed to update status.');
        res.redirect('back');
    }
});

// Confirm Payment Received
router.post('/booking/:id/received-payment', isProvider, async (req, res) => {
    try {
        const booking = await Booking.findById(req.params.id);
        if (!booking) return res.redirect('back');
        
        if (booking.paymentStatus === 'pending') {
            booking.paymentStatus = 'paid';
            
            // Critical Fix: Ensure we use the correct amount for earnings
            // If totalAmount is 0 (missing), fallback to the proposed price
            const finalAmount = booking.totalAmount || booking.proposedAmount || 0;
            if (booking.totalAmount === 0) booking.totalAmount = finalAmount;
            
            await booking.save();

            // Increment provider's total earnings
            await Provider.findByIdAndUpdate(booking.providerId, {
                $inc: { earnings: finalAmount }
            });

            // Log the payment as a message in the chat for the record
            const Message = require('../models/Message');
            const confirmMsg = new Message({
                sender: req.user._id,
                receiver: booking.customerId,
                content: `Payment Received! 💰 Thank you for choosing my service. Your support means a lot!`,
                messageType: 'text',
                bookingId: booking._id
            });
            await confirmMsg.save();

            // Real-time Updates via Sockets
            const io = req.app.get('io');
            if (io) {
                // 1. Notify the chat room to update the UI
                const chatRoom = [req.user._id.toString(), booking.customerId.toString()].sort().join('-');
                io.to(chatRoom).emit('quoteUpdate', {
                    bookingId: booking._id.toString(),
                    status: booking.status,
                    paymentStatus: 'paid',
                    message: 'Payment Received!'
                });

                // 2. Send a live popup notification to the client
                io.to(`user-${booking.customerId}`).emit('notification', {
                    title: 'Payment Confirmed! 💰',
                    content: 'The provider has confirmed receiving your payment. Thank you!',
                    type: 'success',
                    bookingId: booking._id.toString(),
                    senderName: req.user.fullName
                });
                
                // 3. Notify the dashboard (if open) to reload
                io.emit('paymentUpdate', { bookingId: booking._id });
            }

            req.flash('success', `Payment confirmed! ₹${finalAmount} added to your balance.`);
        }
        res.redirect('back');
    } catch (err) {
        console.error(err);
        res.redirect('back');
    }
});

// Provider Setup GET
router.get('/setup', isProvider, (req, res) => {
    res.render('provider/setup');
});

// Provider Setup POST
router.post('/setup', isProvider, async (req, res) => {
    try {
        const { bio, experience, category, city, priceRange } = req.body;
        
        // Update user location
        // Update user location
        const User = require('../models/User');
        await User.findByIdAndUpdate(req.user._id, {
            'address.city': city
        });

        const provider = new Provider({
            userId: req.user._id,
            bio,
            experience,
            services: [{ 
                category,
                priceRange, // Save selected price range
                description: `Professional ${category} services in ${city}.`
            }],
            isVerified: true // Auto-verify for immediate visibility
        });
        await provider.save();
        req.flash('success', 'Profile setup complete!');
        res.redirect('/provider/dashboard');
    } catch (err) {
        req.flash('error', 'Setup failed.');
        res.redirect('back');
    }
});

// Instant Book a Lead
router.post('/instant-book', isProvider, async (req, res) => {
    console.log('DEBUG: Instant Book Request Received', req.body);
    try {
        const { customerId, category, leadId, proposedPrice, description } = req.body;
        
        if (!customerId || !proposedPrice) {
            req.flash('error', 'Missing customer or price information.');
            return res.redirect('back');
        }

        const provider = await Provider.findOne({ userId: req.user._id });
        if (!provider) {
            req.flash('error', 'Provider profile not found.');
            return res.redirect('back');
        }

        // 1. Create the booking (Pending Client Acceptance)
        const booking = new Booking({
            customerId: customerId,
            providerId: provider._id,
            service: {
                category: category || 'General Service',
                description: "Marketplace Lead: " + (description || "No additional details")
            },
            bookingDate: new Date(),
            bookingTime: "ASAP",
            status: 'pending',
            paymentStatus: 'pending',
            paymentMethod: 'cash',
            totalAmount: 0, // Not finalized yet
            proposedAmount: parseFloat(proposedPrice),
            notes: "Initial Offer from Marketplace Lead"
        });
        await booking.save();
        console.log('DEBUG: Booking Created', booking._id);

        // 2. Create the quote message (now pre-confirmed)
        const quoteMessage = new Message({
            sender: req.user._id,
            receiver: customerId,
            content: description || "I can help with your request!",
            messageType: 'quote',
            proposedPrice: parseFloat(proposedPrice),
            bookingId: booking._id
        });
        await quoteMessage.save();
        await confirmMessage.save();

        // Send real-time notification and message to client
        const io = req.app.get('io');
        if (io) {
            const clientRoom = `user-${customerId.toString()}`;
            const providerRoom = req.user._id.toString();

            // 1. Send the Quote Card
            io.to(providerRoom).emit('message', {
                sender: req.user._id.toString(),
                content: quoteMessage.content,
                messageType: 'quote',
                proposedPrice: quoteMessage.proposedPrice,
                bookingId: booking._id.toString(),
                createdAt: quoteMessage.createdAt
            });

            // 2. Send the Notification Text
            io.to(providerRoom).emit('message', {
                sender: req.user._id.toString(),
                content: confirmMessage.content,
                messageType: 'text',
                bookingId: booking._id.toString(),
                createdAt: confirmMessage.createdAt
            });

            // 3. Trigger Premium Toast for Client
            io.to(clientRoom).emit('notification', {
                title: 'New Service Offer! 🏷️',
                content: `${req.user.fullName} has sent you a quote for ${category}. Check your chat now!`,
                type: 'success',
                senderId: req.user._id.toString(),
                senderName: req.user.fullName,
                bookingId: booking._id.toString()
            });
        }

        // 4. Mark the requirement as fulfilled (claimed by this provider)
        if (leadId && /^[0-9a-fA-F]{24}$/.test(leadId)) {
            await Requirement.findByIdAndUpdate(leadId, { status: 'fulfilled' });
            console.log('DEBUG: Lead Fulfilled/Claimed', leadId);
        }

        req.flash('success', 'Service Offer Sent! Client can now accept your quote.');
        res.redirect(`/chat/${customerId}`);
    } catch (err) {
        console.error('DEBUG: Instant Book Error', err);
        req.flash('error', 'Failed to complete instant booking.');
        res.redirect('/provider/dashboard');
    }
});

module.exports = router;
