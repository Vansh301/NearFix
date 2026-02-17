const mongoose = require('mongoose');

const providerSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    bio: {
        type: String,
        required: true
    },
    experience: {
        type: Number, // In years
        required: true
    },
    services: [{
        category: {
            type: String, // e.g., 'Electrician', 'Plumber'
            required: true
        },
        description: String,
        priceRange: String
    }],
    isVerified: {
        type: Boolean,
        default: false
    },
    averageRating: {
        type: Number,
        default: 0
    },
    totalReviews: {
        type: Number,
        default: 0
    },
    availability: {
        days: [String], // e.g., ['Monday', 'Tuesday']
        startTime: String,
        endTime: String
    },
    earnings: {
        type: Number,
        default: 0
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Provider', providerSchema);
