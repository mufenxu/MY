const bcrypt = require('bcryptjs');
const User = require('../models/User');
const logAudit = require('../utils/auditLogger');

function requireReauthentication(action) {
    return async (req, res, next) => {
        const fail = async (reason) => {
            await logAudit(req, {
                action,
                targetId: req.params?.id || req.params?.key || req.body?.key || '',
                payload: { reason },
                result: 'failure',
            });
            return res.status(403).json({
                success: false,
                message: 'Reauthentication failed.',
                code: 'REAUTHENTICATION_FAILED',
            });
        };

        try {
            if (req.platformSso) {
                const reauthExpiresAt = Number(req.platformSso.reauth_exp);
                if (
                    req.platformSso.role === 'super_admin'
                    && Number.isFinite(reauthExpiresAt)
                    && reauthExpiresAt > Math.floor(Date.now() / 1000)
                ) {
                    req.reauthenticated = true;
                    return next();
                }
                return fail('central_reauthentication_required');
            }
            const userId = req.user?._id || req.user?.id;
            const password = String(req.body?.currentPassword || req.body?.password || '');
            if (!userId || !password) return fail('credentials_missing');
            const user = await User.findById(userId).select('+password').lean();
            if (!user?.password || !await bcrypt.compare(password, user.password)) {
                return fail('invalid_password');
            }
            req.reauthenticated = true;
            return next();
        } catch (error) {
            return next(error);
        }
    };
}

module.exports = requireReauthentication;
