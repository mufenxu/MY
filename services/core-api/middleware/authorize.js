/**
 * 角色鉴权中间件
 * 在 verifyToken 之后使用，检查用户角色是否有权限访问
 * 
 * 用法: router.get('/admin/list', verifyToken, authorize('admin', 'super_admin'), handler)
 */
const authorize = (...allowedRoles) => {
    return (req, res, next) => {
        if (!req.user || !req.user.role) {
            return res.status(403).json({
                success: false,
                error: '无法确认用户角色，访问被拒绝'
            });
        }

        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                error: '权限不足，仅限管理员操作'
            });
        }

        next();
    };
};

module.exports = authorize;
