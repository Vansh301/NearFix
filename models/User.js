const mongoose = require('mongoose');
const passportLocalMongoose = require('passport-local-mongoose').default || require('passport-local-mongoose');

const userSchema = new mongoose.Schema({
    fullName: {
        type: String,
        required: true,
        trim: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true
    },
    phone: {
        type: String,
        required: true
    },
    role: {
        type: String,
        enum: ['customer', 'provider', 'admin'],
        default: 'customer'
    },
    profileImage: {
        type: String,
        default: '/img/default-avatar.png'
    },
    address: {
        street: String,
        city: String,
        state: String,
        zipCode: String,
        location: {
            type: { type: String, default: 'Point', enum: ['Point'] },
            coordinates: { type: [Number], default: [0, 0] }
        }
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    resetPasswordToken: String,
    resetPasswordExpires: Date
});

// userSchema.index({ "address.location": "2dsphere" });
userSchema.plugin(passportLocalMongoose, { usernameField: 'email' });

module.exports = mongoose.model('User', userSchema);
