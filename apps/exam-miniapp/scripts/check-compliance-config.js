const path = require('path');

const profiles = require(path.join('..', 'miniprogram', 'config', 'compliance-profile.js'));

function getComplianceErrors(profile = {}) {
    const companyName = String(profile.companyName || '').trim();
    const supportEmail = String(profile.supportEmail || '').trim();
    const errors = [];

    if (!companyName || companyName.startsWith('__REQUIRED_') || /不可发布|请在发布前/.test(companyName)) {
        errors.push('companyName must contain the real operating entity name');
    }
    if (
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(supportEmail)
        || supportEmail.startsWith('__REQUIRED_')
        || /@(example\.(com|invalid)|localhost)$/i.test(supportEmail)
    ) {
        errors.push('supportEmail must contain a real support mailbox');
    }

    return errors;
}

function checkEnvironment(envVersion) {
    if (!['trial', 'release'].includes(envVersion)) {
        throw new Error('envVersion must be trial or release');
    }
    return getComplianceErrors(profiles[envVersion]);
}

if (require.main === module) {
    const envVersion = process.argv[2];
    const errors = checkEnvironment(envVersion);
    if (errors.length > 0) {
        console.error(`${envVersion} compliance check failed:\n${errors.join('\n')}`);
        process.exit(1);
    }
    console.log(`${envVersion} compliance config ok`);
}

module.exports = { checkEnvironment, getComplianceErrors };
