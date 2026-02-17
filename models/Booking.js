const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
    customerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    providerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Provider',
        required: true
    },
    service: {
        category: String,
        description: String,
        priceRange: String
    },
    bookingDate: {
        type: Date,
        required: true
    },
    bookingTime: {
        type: String,
        required: true
    },
    status: {
        type: String,
        enum: ['pending', 'accepted', 'confirmed', 'rejected', 'completed', 'cancelled'],
        default: 'pending'
    },
    totalAmount: {
        type: Number,
        default: 0
    },
    proposedAmount: {
        type: Number,
        default: 0
    },
    notes: String,
    reviewed: {
        type: Boolean,
        default: false
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    paymentStatus: {
        type: String,
        enum: ['pending', 'paid'],
        default: 'pending'
    },
    paymentMethod: {
        type: String,
        enum: ['cash', 'online'],
        default: 'cash'
    }
});

module.exports = mongoose.model('Booking', bookingSchema);
