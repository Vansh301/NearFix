const mongoose = require('mongoose');

const requirementSchema = new mongoose.Schema({
    customerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    category: {
        type: String,
        required: true
    },
    description: {
        type: String,
        required: true
    },
    location: {
        city: String,
        address: String
    },
    status: {
        type: String,
        enum: ['open', 'closed', 'fulfilled'],
        default: 'open'
    },
    budget: String,
    urgency: {
        type: String,
        enum: ['standard', 'emergency', 'asap'],
        default: 'standard'
    },
    responses: [{
        providerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Provider'
        },
        message: String,
        at: { type: Date, default: Date.now }
    }]
}, { timestamps: true });

module.exports = mongoose.model('Requirement', requirementSchema);
