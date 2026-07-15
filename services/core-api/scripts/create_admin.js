require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/miniprogram';

mongoose.connect(MONGO_URI)
    .then(async () => {
        console.log('Connected to MongoDB');

        const adminId = 'admin_001';
        const password = 'admin_password'; // Change this!
        const hashedPassword = await bcrypt.hash(password, 10);

        const admin = {
            _id: adminId,
            userId: 'admin',
            nickName: 'Super Admin',
            role: 'super_admin',
            password: hashedPassword,
            status: 'active'
        };

        try {
            await User.updateOne({ _id: adminId }, { $set: admin }, { upsert: true });
            console.log(`Admin user created/updated. ID: ${adminId}, Password: ${password}`);
        } catch (err) {
            console.error('Error creating admin:', err);
        } finally {
            mongoose.disconnect();
        }
    })
    .catch(err => {
        console.error('MongoDB connection error:', err);
        process.exit(1);
    });
