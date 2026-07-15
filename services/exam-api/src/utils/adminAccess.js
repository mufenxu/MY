const Admin = require('../models/Admin');
const ConsoleAccount = require('../models/ConsoleAccount');

const CONSOLE_ADMIN_ROLES = ['ops_admin', 'super_admin'];

async function hasBoundAdminAccount(openid) {
    if (!openid) {
        return false;
    }

    return Boolean(await Admin.exists({ wechatOpenId: openid }));
}

async function hasConsoleAdminAccount(openid) {
    if (!openid) {
        return false;
    }

    return Boolean(await ConsoleAccount.exists({
        openid,
        status: 'active',
        role: { $in: CONSOLE_ADMIN_ROLES },
    }));
}

async function hasAdminCatalogAccess(openid) {
    if (!openid) {
        return false;
    }

    const [boundAdmin, consoleAdmin] = await Promise.all([
        hasBoundAdminAccount(openid),
        hasConsoleAdminAccount(openid),
    ]);

    return boundAdmin || consoleAdmin;
}

module.exports = {
    CONSOLE_ADMIN_ROLES,
    hasBoundAdminAccount,
    hasConsoleAdminAccount,
    hasAdminCatalogAccess,
};
