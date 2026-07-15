
const mongoose = require('mongoose');
const crypto = require('crypto');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
const AppClient = require('../models/AppClient');

mongoose.connect(process.env.MONGO_URI)
    .then(async () => {
        console.log('Connected to DB');

        const appId = 'admin-dashboard';
        let app = await AppClient.findOne({ appId });

        if (!app) {
            console.log('Admin App not found. Creating...');
            const secret = crypto.randomBytes(32).toString('hex');
            app = await AppClient.create({
                appName: '星轨轻具坊后台',
                appId,
                secret,
                domain: 'localhost', // Or production domain
                status: 'enabled',
                redirectUrl: ''
            });
            console.log('Created Admin App successfully.');
        } else {
            console.log('Admin App already exists.');
            if (app.status !== 'enabled') {
                app.status = 'enabled';
                await app.save();
                console.log('Enabled Admin App.');
            }
        }

        console.log(`AppID: ${app.appId}`);
        // Be careful logging secret in production logs, but for setup it's okay locally
        console.log(`Secret: ${app.secret}`);

        process.exit(0);
    })
    .catch(err => {
        console.error(err);
        process.exit(1);
    });
