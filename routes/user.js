const express = require('express');
const router = express.Router();
const Review = require('../models/Review');
const Booking = require('../models/Booking');
const Provider = require('../models/Provider');
const Requirement = require('../models/Requirement');

const { isCustomer } = require('../middleware/auth');

// Post Service Requirement (Sulekha Style)
router.post('/requirement', isCustomer, async (req, res) => {
    try {
        const { category, description, urgency, budget } = req.body;
        
        await Requirement.create({
            customerId: req.user._id,
            category,
            description,
            urgency: urgency || 'standard',
            budget,
            status: 'open',
            location: req.user.address
        });

        req.flash('success', 'Your requirement has been posted! Relevant experts will contact you soon.');
        res.redirect('/user/bookings');
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to post requirement.');
        res.redirect('/');
    }
});

// View Bookings
router.get('/bookings', isCustomer, async (req, res) => {
    try {
        const bookings = await Booking.find({ customerId: req.user._id })
            .populate({
                path: 'providerId',
                populate: { path: 'userId' }
            })
            .sort({ createdAt: -1 });
        res.render('user/bookings', { bookings });
    } catch (err) {
        res.redirect('/');
    }
});

// Post Review
router.post('/review/:bookingId', isCustomer, async (req, res) => {
    try {
        const { rating, comment } = req.body;
        const booking = await Booking.findById(req.params.bookingId);
        
        if (!booking || booking.reviewed) {
            req.flash('error', 'Invalid review request.');
            return res.redirect('back');
        }

        const review = new Review({
            bookingId: booking._id,
            customerId: req.user._id,
            providerId: booking.providerId,
            rating: parseInt(rating),
            comment
        });

        await review.save();
        
        // Update booking
        booking.reviewed = true;
        await booking.save();

        // Update provider stats
        const allReviews = await Review.find({ providerId: booking.providerId });
        const avgRating = allReviews.reduce((acc, curr) => acc + curr.rating, 0) / allReviews.length;
        
        await Provider.findByIdAndUpdate(booking.providerId, {
            averageRating: avgRating.toFixed(1),
            totalReviews: allReviews.length
        });

        req.flash('success', 'Review submitted! Thank you.');
        res.redirect('/user/bookings');
    } catch (err) {
        req.flash('error', 'Failed to submit review.');
        res.redirect('back');
    }
});

// Book a Service
router.post('/book/:providerId', isCustomer, async (req, res) => {
    try {
        const { serviceCategory, bookingDate, bookingTime, notes } = req.body;
        const provider = await Provider.findById(req.params.providerId);
        
        if (!provider) {
            req.flash('error', 'Service provider not found.');
            return res.redirect('back');
        }

        // Find the specific service to get price/details if needed
        const service = provider.services.find(s => s.category === serviceCategory);
        
        const booking = new Booking({
            customerId: req.user._id,
            providerId: provider._id,
            service: {
                category: serviceCategory,
                description: service ? service.description : '',
                priceRange: service ? service.priceRange : ''
            },
            bookingDate,
            bookingTime,
            notes,
            totalAmount: 0, // In a real app, this would be based on service price
            status: 'pending'
        });

        await booking.save();

        // Create initial message to startup chat
        const Message = require('../models/Message');
        const priceInfo = service && service.priceRange ? `\n\nStarting Price: ${service.priceRange}` : '';
        const initialMsg = new Message({
            sender: req.user._id,
            receiver: provider.userId, // Send to the provider's User ID
            content: `Hi! I just booked your ${serviceCategory} service for ${new Date(bookingDate).toLocaleDateString()} at ${bookingTime}.${priceInfo}\nLooking forward to it!`,
            bookingId: booking._id
        });
        await initialMsg.save();

        // Send real-time notification and message to worker
        const io = req.app.get('io');
        if (io) {
            const targetRoom = `user-${provider.userId.toString()}`;
            const customerRoom = req.user._id.toString(); // The room the worker joined to chat with this client

            // 1. Emit the actual chat message so chat window updates live
            io.to(customerRoom).emit('message', {
                sender: req.user._id.toString(),
                content: initialMsg.content,
                messageType: 'text',
                bookingId: booking._id.toString(),
                createdAt: initialMsg.createdAt
            });

            // 2. Emit the premium notification toast (System Style)
            io.to(targetRoom).emit('notification', {
                title: 'New Service Request! 🚀',
                content: `${req.user.fullName} has requested your ${serviceCategory} service. Check the chat for details!`,
                type: 'booking', 
                senderId: req.user._id.toString(),
                senderName: req.user.fullName,
                bookingId: booking._id.toString(),
                // Extra data for live dashboard update
                serviceCategory: serviceCategory,
                bookingDate: bookingDate,
                bookingTime: bookingTime
            });

            // 3. Emit the actual message content as a notification (Chat Style like screenshot)
            io.to(targetRoom).emit('notification', {
                title: req.user.fullName,
                content: initialMsg.content,
                type: 'message',
                senderId: req.user._id.toString(),
                senderName: req.user.fullName,
                bookingId: booking._id.toString()
            });
        }

        req.flash('success', 'Booking confirmed! Start a chat with the professional below.');
        res.redirect(`/chat/${provider.userId}`);
    } catch (err) {
        console.error('Booking error:', err);
        req.flash('error', 'Failed to request booking. Please try again.');
        res.redirect('back');
    }
});

// Cancel Booking
router.post('/booking/:id/cancel', isCustomer, async (req, res) => {
    try {
        const booking = await Booking.findById(req.params.id);
        
        if (!booking) return res.redirect('back');

        // Only enforce 24h policy if the booking is already confirmed/accepted and has a specific date
        // If it's still 'pending' (new request), allow immediate cancellation
        if (booking.status !== 'pending') {
            const now = new Date();
            const bookingTime = new Date(booking.bookingDate);
            const diffHours = (bookingTime - now) / 1000 / 60 / 60;

            if (diffHours < 24) {
                 req.flash('error', 'Cancellations for confirmed bookings are only allowed 24 hours in advance.');
                 return res.redirect('back');
            }
        }

        booking.status = 'cancelled';
        await booking.save();

        // Notify provider via Chat
        const Message = require('../models/Message');
        const populatedBooking = await Booking.findById(booking._id).populate('providerId');
        const cancelMsg = new Message({
            sender: req.user._id,
            receiver: populatedBooking.providerId.userId,
            content: `🚫 Request Cancelled: The customer has cancelled this service request.`,
            messageType: 'text',
            bookingId: booking._id
        });
        await cancelMsg.save();

        // Send real-time notification and message to worker
        const io = req.app.get('io');
        if (io) {
            const targetRoom = `user-${populatedBooking.providerId.userId.toString()}`;
            const customerRoom = req.user._id.toString();

            // 1. Emit the actual chat message so chat window updates live
            io.to(customerRoom).emit('message', {
                sender: req.user._id.toString(),
                content: cancelMsg.content,
                messageType: 'text',
                bookingId: booking._id.toString(),
                createdAt: cancelMsg.createdAt
            });

            // 2. Emit the premium notification toast
            io.to(targetRoom).emit('notification', {
                title: 'Request Cancelled 🚫',
                content: `${req.user.fullName} has cancelled their ${populatedBooking.service.category} request.`,
                type: 'cancel', // Redesigned for alert icon
                senderId: req.user._id.toString(),
                senderName: req.user.fullName,
                bookingId: booking._id.toString()
            });

            // Emit socket event for real-time UI/card update
            io.emit('quoteUpdate', { 
                bookingId: booking._id.toString(), 
                status: 'cancelled',
                message: 'Request Cancelled'
            });
        }
        
        req.flash('success', 'Request has been cancelled successfully.');
        res.redirect('back');
    } catch (err) {
        console.error('Cancel Error:', err);
        req.flash('error', 'Failed to cancel request.');
        res.redirect('back');
    }
});

// Safe Return Route (Back to Bookings)
router.get('/booking/:id/back', isCustomer, (req, res) => {
    res.redirect('/user/bookings');
});

// Process Payment
router.post('/booking/:id/pay', isCustomer, async (req, res) => {
    try {
        const { method } = req.body;
        const booking = await Booking.findById(req.params.id);
        
        const payableStatuses = ['accepted', 'completed'];
        if (booking && payableStatuses.includes(booking.status)) {
            // Set totalAmount to proposedAmount if it's not set yet
            if (booking.totalAmount <= 0 && booking.proposedAmount > 0) {
                booking.totalAmount = booking.proposedAmount;
            }

            booking.paymentMethod = method;
            booking.paymentStatus = 'paid';
            await booking.save();

            // 1. Send automated chat notification
            const Message = require('../models/Message');
            const payMsg = new Message({
                sender: req.user._id,
                receiver: booking.providerId, // Note: Need to verify if this is UserID or ProviderID
                content: `I've confirmed payment via ${method === 'cash' ? 'Cash' : 'Online'}. ✅\nPlease complete the project once the service is finished.`,
                messageType: 'text',
                bookingId: booking._id
            });
            
            // To be safe, fetch the provider's USER ID for the chat
            const populatedBooking = await Booking.findById(booking._id).populate('providerId');
            payMsg.receiver = populatedBooking.providerId.userId;
            await payMsg.save();

            // 2. Trigger real-time socket update for the provider's dashboard
            const io = req.app.get('io');
            if (io) {
                const targetRoom = `user-${populatedBooking.providerId.userId.toString()}`;
                
                // Dashboard Stat Update
                io.emit('paymentUpdate', { 
                    bookingId: booking._id, 
                    status: 'paid',
                    method: method 
                });

                // Premium Toast Notification
                io.to(targetRoom).emit('notification', {
                    title: 'Payment Received! 💰',
                    content: `${req.user.fullName} has confused payment via ${method.toUpperCase()}. You can now complete the job.`,
                    type: 'success', // Green theme
                    senderId: req.user._id.toString(),
                    senderName: req.user.fullName,
                    bookingId: booking._id.toString()
                });

                // Chat message emit
                const chatRoom = [req.user._id.toString(), populatedBooking.providerId.userId.toString()].sort().join('-');
                io.to(chatRoom).emit('message', {
                    sender: req.user._id.toString(),
                    content: payMsg.content,
                    messageType: 'text',
                    bookingId: booking._id.toString(),
                    createdAt: payMsg.createdAt
                });
            }

            if (method === 'online') {
                req.flash('success', 'Redirecting to secure payment gateway... (Simulated)');
                return res.redirect('/user/bookings?payment_success=true');
            } else {
                req.flash('success', `Payment confirmed via ${method.toUpperCase()}! Your professional has been notified.`);
            }
        } else {
            req.flash('error', 'This booking is not ready for payment yet.');
        }
        res.redirect('/user/bookings');
    } catch (err) {
        console.error(err);
        req.flash('error', 'Payment failed.');
        res.redirect('/user/bookings');
    }
});

module.exports = router;
