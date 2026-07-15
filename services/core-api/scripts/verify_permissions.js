require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const User = require('../models/User');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/miniprogram';

async function verify() {
    try {
        await mongoose.connect(MONGO_URI);
        console.log('Connected to MongoDB');

        const testId = 'test_user_perm';
        const permissions = ['view_heat_pump', 'view_bmi'];

        // 1. Create/Update User with permissions
        await User.updateOne(
            { _id: testId },
            {
                $set: {
                    nickName: 'Test Perm User',
                    role: 'user',
                    status: 'active',
                    permissions: permissions
                }
            },
            { upsert: true }
        );
        console.log('Test user updated with permissions.');

        // 2. Retrieve User
        const user = await User.findById(testId);
        console.log('Retrieved user permissions:', user.permissions);

        // 3. Verify
        const hasHeatPump = user.permissions.includes('view_heat_pump');
        const hasBMI = user.permissions.includes('view_bmi');
        const hasTodo = user.permissions.includes('view_todo');

        if (hasHeatPump && hasBMI && !hasTodo) {
            console.log('SUCCESS: Permissions verified correctly.');
        } else {
            console.error('FAILED: Permissions mismatch.', { hasHeatPump, hasBMI, hasTodo });
            process.exit(1);
        }

        // 4. Cleanup
        await User.deleteOne({ _id: testId });
        console.log('Test user cleaned up.');

    } catch (err) {
        console.error('Verification failed:', err);
        process.exit(1);
    } finally {
        mongoose.disconnect();
    }
}

verify();
