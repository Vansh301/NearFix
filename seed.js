require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');
const Provider = require('./models/Provider');

const seedData = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/nearfix');
        console.log('Connected to MongoDB for seeding...');

        // Clear existing data
        await User.deleteMany({});
        await Provider.deleteMany({});

        // Create Admin
        const admin = new User({
            fullName: 'Platform Admin',
            email: 'admin@nearfix.com',
            phone: '1234567890',
            role: 'admin',
            address: { location: { type: 'Point', coordinates: [0, 0] } }
        });
        await User.register(admin, 'admin123');

        // Create Customer
        const customer = new User({
            fullName: 'Test Customer',
            email: 'user@example.com',
            phone: '9876543210',
            role: 'customer',
            address: { location: { type: 'Point', coordinates: [0, 0] } }
        });
        await User.register(customer, 'user123');

        // Create Providers
        const providerData = [
            {
                fullName: 'Rajesh Sharma',
                email: 'rajesh@example.com',
                phone: '9812345678',
                category: 'Electrician',
                city: 'Delhi'
            },
            {
                fullName: 'Amit Kumar',
                email: 'amit@example.com',
                phone: '9823456789',
                category: 'Plumber',
                city: 'Mumbai'
            },
            {
                fullName: 'Sunita Devi',
                email: 'sunita@example.com',
                phone: '9834567890',
                category: 'Cleaner',
                city: 'Bangalore'
            }
        ];

        for (const p of providerData) {
            const user = new User({
                fullName: p.fullName,
                email: p.email,
                phone: p.phone,
                role: 'provider',
                address: { 
                    city: p.city,
                    location: { 
                        type: 'Point', 
                        coordinates: p.city === 'Delhi' ? [77.2090, 28.6139] : 
                                   p.city === 'Mumbai' ? [72.8777, 19.0760] : 
                                   p.city === 'Bangalore' ? [77.5946, 12.9716] : [77.2090, 28.6139]
                    }
                }
            });
            await User.register(user, 'worker123');

            const provider = new Provider({
                userId: user._id,
                bio: `Professional ${p.fullName.split(' ')[1]} service with over 5 years of experience in ${p.city}. I provide high-quality work and guarantee satisfaction.`,
                experience: 5 + Math.floor(Math.random() * 10),
                services: [{
                    category: p.category,
                    description: `Expert ${p.category} services for your home and office.`,
                    priceRange: '₹500 - ₹2000'
                }],
                isVerified: true,
                averageRating: (4 + Math.random()).toFixed(1),
                totalReviews: 10 + Math.floor(Math.random() * 50)
            });
            await provider.save();
        }

        console.log('Seed data created successfully!');
        process.exit(0);
    } catch (err) {
        console.error('Seeding error:', err);
        process.exit(1);
    }
};

seedData();
