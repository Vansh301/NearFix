const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Provider = require('../models/Provider');
const Booking = require('../models/Booking');

const { isAdmin } = require('../middleware/auth');

// Admin Dashboard
router.get('/dashboard', isAdmin, async (req, res) => {
    try {
        const users = await User.find();
        let providers = await Provider.find().populate('userId');
        const bookings = await Booking.find().populate('customerId').populate({
            path: 'providerId',
            populate: { path: 'userId' }
        });

        // Filter out providers where userId is missing (orphaned records)
        providers = providers.filter(p => p.userId !== null);

        const stats = {
            totalUsers: users.length,
            totalProviders: providers.length,
            totalBookings: bookings.length,
            pendingVerifications: providers.filter(p => !p.isVerified).length
        };

        res.render('admin/dashboard', { stats, providers, users, bookings });
    } catch (err) {
        res.redirect('/');
    }
});

// Verify Provider
router.post('/provider/:id/verify', isAdmin, async (req, res) => {
    try {
        const provider = await Provider.findByIdAndUpdate(req.params.id, { isVerified: true });
        
        // Notify worker in real-time
        if (provider) {
             const io = req.app.get('io');
             if (io) {
                 io.to(`user-${provider.userId.toString()}`).emit('notification', {
                     title: 'Profile Verified! ✅',
                     content: 'Congratulations! Your profile has been approved and is now visible to customers.',
                     type: 'success'
                 });
             }
        }

        req.flash('success', 'Provider profile verified!');
        res.redirect('/admin/dashboard');
    } catch (err) {
        req.flash('error', 'Verification failed.');
        res.redirect('back');
    }
});

module.exports = router;
