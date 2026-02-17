const express = require('express');
const router = express.Router();
const Provider = require('../models/Provider');
const User = require('../models/User');

// Home Page
router.get('/', async (req, res) => {
    try {
        const topProviders = await Provider.find({ isVerified: true })
            .populate('userId')
            .sort({ averageRating: -1 })
            .limit(6);
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
        let query = { isVerified: true };

        // 1. Flexible Category Handling
        if (category && category.trim() !== '') {
            // Forgiving regex search (e.g., "Plumb" matches "Plumber")
            query['services.category'] = { $regex: new RegExp(category.trim(), 'i') };
        }

        // 2. Fetch all verified providers
        let providers = await Provider.find(query).populate('userId');

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

        if (req.query.minRating) {
            providers = providers.filter(p => p.averageRating >= parseFloat(req.query.minRating));
        }
        
        res.render('search-results', { 
            providers, 
            category: category || '', 
            location: location || '' 
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
        res.render('provider-profile', { provider, reviews });
    } catch (err) {
        req.flash('error', 'Provider not found.');
        res.redirect('/');
    }
});

module.exports = router;
