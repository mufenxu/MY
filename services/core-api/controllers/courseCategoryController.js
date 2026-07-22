const CourseCategory = require('../models/CourseCategory');
const PlatformConfig = require('../models/PlatformConfig');
const { parsePagination } = require('../utils/pagination');

const MAX_REFERENCE_ROWS = 200;

// ======================= 小程序端使用 =======================
// 获取正常状态的平台网课用于选单
exports.getActiveCategories = async (req, res) => {
    try {
        const [categories, platformStats] = await Promise.all([
            CourseCategory.find({ status: 1 })
                .sort({ sort: 1, createdAt: -1 })
                .limit(MAX_REFERENCE_ROWS)
                .lean(),
            PlatformConfig.find({}, 'platformCode queryCount orderCount')
                .sort({ platformCode: 1 })
                .limit(MAX_REFERENCE_ROWS)
                .lean(),
        ]);
        
        res.json({ 
            success: true, 
            code: 200, 
            data: { 
                categories, 
                stats: platformStats 
            } 
        });
    } catch (error) {
        res.json({ success: false, code: 500, message: '获取平台网课列表失败: ' + error.message });
    }
};

// ======================= 管理后台专用 =======================
// 分页获取分类列表
exports.getAdminCategories = async (req, res) => {
    try {
        const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 15 });
        const query = {};
        const [total, list, platforms] = await Promise.all([
            CourseCategory.countDocuments(query),
            CourseCategory.find(query)
                .sort({ sort: 1, createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            // Only return display metadata. Credentials and endpoint URLs stay server-side.
            PlatformConfig.find({}, 'platformCode name status')
                .sort({ platformCode: 1 })
                .limit(MAX_REFERENCE_ROWS)
                .lean(),
        ]);
        
        res.json({ 
            success: true, 
            code: 200, 
            data: { list, total, page, limit, _platforms: platforms }
        });
    } catch (error) {
        res.json({ success: false, code: 500, message: '获取分类失败', error: error.message });
    }
};

// 添加/保存分类
exports.saveCategory = async (req, res) => {
    try {
        const { _id, name, getnoun, noun, ...rest } = req.body;
        
        if (!name || !getnoun || !noun) {
            return res.json({ success: false, code: 400, message: '平台名字、查询参数、对接参数不能为空' });
        }

        if (_id) {
            // Edit
            await CourseCategory.findByIdAndUpdate(_id, { name, getnoun, noun, ...rest }, { new: true });
            res.json({ success: true, code: 200, message: '成功更新平台网课' });
        } else {
            // Form Add
            const newCategory = new CourseCategory({ name, getnoun, noun, ...rest });
            await newCategory.save();
            res.json({ success: true, code: 200, message: '平台网课添加成功' });
        }
    } catch (error) {
        res.json({ success: false, code: 500, message: '保存分类失败', error: error.message });
    }
};

// 删除分类
exports.deleteCategory = async (req, res) => {
    try {
        const id = req.params.id;
        await CourseCategory.findByIdAndDelete(id);
        res.json({ success: true, code: 200, message: '已删除成功' });
    } catch (error) {
        res.json({ success: false, code: 500, message: '删除失败', error: error.message });
    }
};
