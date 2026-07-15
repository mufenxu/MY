const Ct8Run = require('../models/Ct8Run');

/**
 * 获取 CT8 任务执行历史
 */
exports.getRunHistory = async (req, res) => {
    try {
        const { page = 1, pageSize = 10 } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(pageSize);
        const limit = parseInt(pageSize);

        const total = await Ct8Run.countDocuments();
        const runsData = await Ct8Run.find()
            .select('-details')
            .sort({ create_time: -1 })
            .skip(skip)
            .limit(limit)
            .lean();

        const runs = runsData.map(run => ({
            ...run,
            total_accounts: run.stats?.total || 0,
            success_count: run.stats?.success || 0,
            failed_count: run.stats?.failed || 0
        }));

        res.json({
            success: true,
            total,
            runs
        });
    } catch (error) {
        console.error('获取 CT8 运行历史失败:', error);
        res.status(500).json({ success: false, error: '获取执行历史失败' });
    }
};

/**
 * 获取单次任务详细日志
 */
exports.getRunDetails = async (req, res) => {
    try {
        const { runId } = req.params;
        const run = await Ct8Run.findOne({ run_id: runId });
        
        if (!run) {
            return res.status(404).json({ success: false, error: '未找到任务记录' });
        }
        
        res.json({ success: true, run });
    } catch (error) {
        console.error('获取任务详情失败:', error);
        res.status(500).json({ success: false, error: '获取任务详情失败' });
    }
};

/**
 * 获取 CT8 统计大盘数据
 */
exports.getCt8Stats = async (req, res) => {
    try {
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        // 最近一次的运行结果（看是否成功）
        const latestRun = await Ct8Run.findOne().sort({ start_time: -1 });

        // 今日运行次数
        const todayRuns = await Ct8Run.countDocuments({ start_time: { $gte: todayStart } });

        res.json({
            success: true,
            stats: {
                totalHosts: latestRun ? latestRun.details.length : 0,
                successHosts: latestRun ? latestRun.stats.success : 0,
                failedHosts: latestRun ? latestRun.stats.failed : 0,
                todayRuns,
                lastRunTime: latestRun ? latestRun.start_time : null,
                lastRunStatus: latestRun ? latestRun.status : 'unknown'
            }
        });
    } catch (error) {
        console.error('获取 CT8 统计数据失败:', error);
        res.status(500).json({ success: false, error: '获取统计数据失败' });
    }
};
