const mongoose = require('mongoose');
const User = require('./models/User');

async function check() {
    try {
        await mongoose.connect('mongodb://localhost:27017/nearfix');
        const users = await User.find({ email: /raj/i });
        console.log('RAJ USERS FOUND:', users.length);
        users.forEach(u => console.log(`- ${u.email} (Role: ${u.role})`));
        
        const all = await User.countDocuments();
        console.log('TOTAL USERS:', all);
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

check();
