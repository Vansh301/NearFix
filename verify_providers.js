require('dotenv').config();
const mongoose = require('mongoose');
const Provider = require('./models/Provider');

const verifyAllProviders = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/nearfix');
        console.log('Connected to MongoDB...');

        const result = await Provider.updateMany({}, { isVerified: true });
        console.log(`Updated ${result.modifiedCount} providers to verified status.`);
        
        process.exit(0);
    } catch (err) {
        console.error('Error verifying providers:', err);
        process.exit(1);
    }
};

verifyAllProviders();
