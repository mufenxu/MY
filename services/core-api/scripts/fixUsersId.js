require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const Counter = require('../models/Counter');

// Use MONGO_URI from .env as in server.js
let MONGODB_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/miniprogram';
// If it contains the container name 'mongodb' from docker-compose, replace it with 'localhost' for local script execution
if (MONGODB_URI.includes('mongodb:')) {
    MONGODB_URI = MONGODB_URI.replace('mongodb:', 'localhost:');
}

async function fix() {
    try {
        console.log('Connecting to:', MONGODB_URI);
        await mongoose.connect(MONGODB_URI);
        console.log('Connected to MongoDB');

        // 1. Find users whose userId matches openid (typical string length for openid is ~28)
        // or any userId that is not a numeric string.
        const users = await User.find({});
        console.log(`Found ${users.length} users to check.`);

        let count = 0;
        for (const user of users) {
            // If userId is same as _id/openid, it's an old format
            if (user.userId === user._id || (user.userId && user.userId.length > 20)) {
                // Get next UID
                let counter = await Counter.findByIdAndUpdate(
                    'userId',
                    { $inc: { seq: 1 } },
                    { new: true, upsert: true }
                );

                const oldId = user.userId;
                user.userId = String(counter.seq);
                await user.save();
                console.log(`Fixed user ${user.nickName || 'Unknown'}: ${oldId} -> ${user.userId}`);
                count++;
            } else {
                console.log(`Skipping user ${user.nickName || 'Unknown'} (ID: ${user.userId}) - already a custom ID?`);
            }
        }

        console.log(`Total ${count} users fixed.`);
        process.exit(0);
    } catch (err) {
        console.error('Error fixing users:', err);
        process.exit(1);
    }
}

fix();
