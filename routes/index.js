const express = require('express');
const router = express.Router();
const Provider = require('../models/Provider');
const User = require('../models/User');

// Home Page
router.get('/', async (req, res) => {
    try {
        let topProviders = await Provider.find({ isVerified: true }) // Only show verified professionals
            .populate('userId')
            .sort({ averageRating: -1 })
            .limit(20); 
        
        // Filter out orphaned records and duplicates
        const seenUsers = new Set();
        topProviders = topProviders.filter(p => {
            if (!p.userId || seenUsers.has(p.userId._id.toString())) return false;
            seenUsers.add(p.userId._id.toString());
            return true;
        }).slice(0, 3);
        
        res.render('index', { topProviders });
    } catch (err) {
        console.error(err);
        res.render('index', { topProviders: [] });
    }
});

// Search Services
router.get('/search', async (req, res) => {
    try {
        let { category, location } = req.query;
        let query = { isVerified: true }; // ONLY show verified workers

        // 1. Flexible Category Handling
        if (category && category.trim() !== '') {
            // Forgiving regex search (e.g., "Plumb" matches "Plumber")
            query['services.category'] = { $regex: new RegExp(category.trim(), 'i') };
        }

        // 2. Fetch all providers
        let providers = await Provider.find(query).populate('userId');
        
        // Remove orphaned records (missing users) and handle duplicates
        const seenUsers = new Set();
        providers = providers.filter(p => {
            if (!p.userId || seenUsers.has(p.userId._id.toString())) return false;
            seenUsers.add(p.userId._id.toString());
            return true;
        });

        // 3. Robust Location Filtering
        if (location && location.trim() !== '') {
            const searchLoc = location.trim().toLowerCase();
            providers = providers.filter(p => {
                if (!p.userId || !p.userId.address) return false;
                
                const city = p.userId.address.city || '';
                const state = p.userId.address.state || '';
                const street = p.userId.address.street || '';
                
                return city.toLowerCase().includes(searchLoc) || 
                       state.toLowerCase().includes(searchLoc) || 
                       street.toLowerCase().includes(searchLoc);
            });
        }

        // 4. Advanced Filters (Price, Rating)
        if (req.query.priceRange) {
            const ranges = Array.isArray(req.query.priceRange) ? req.query.priceRange : [req.query.priceRange];
            providers = providers.filter(p => 
                p.services.some(s => ranges.includes(s.priceRange))
            );
        }

        const minRating = req.query.minRating ? parseFloat(req.query.minRating) : 0;
        providers = providers.filter(p => p.averageRating >= minRating);
        
        res.render('search-results', { 
            providers, 
            category: category || '', 
            location: location || '',
            minRating,
            priceRange: req.query.priceRange || []
        });
    } catch (err) {
        console.error('Search Error:', err);
        req.flash('error', 'Something went wrong with the search.');
        res.redirect('/');
    }
});

// View Provider Profile
router.get('/profile/:id', async (req, res) => {
    try {
        const provider = await Provider.findById(req.params.id).populate('userId');
        const Review = require('../models/Review');
        const reviews = await Review.find({ providerId: req.params.id }).populate('customerId');
        const Booking = require('../models/Booking');
        const bookings = await Booking.find({ 
            providerId: req.params.id, 
            status: { $in: ['pending', 'accepted', 'confirmed'] } 
        });

        const bookedTimeSlots = bookings.map(b => {
             const d = new Date(b.bookingDate);
             return `${d.toISOString().split('T')[0]}_${b.bookingTime}`;
        });

        res.render('provider-profile', { provider, reviews, bookedTimeSlots });
    } catch (err) {
        req.flash('error', 'Provider not found.');
        res.redirect('/');
    }
});

module.exports = router;
