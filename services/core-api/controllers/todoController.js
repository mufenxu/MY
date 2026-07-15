const TodoList = require('../models/TodoList');

exports.getTodos = async (req, res) => {
    try {
        const todoList = await TodoList.findById(req.user._id);

        if (!todoList) {
            return res.status(200).json({
                success: true,
                data: []
            });
        }

        res.status(200).json({
            success: true,
            data: todoList.tasks || []
        });
    } catch (err) {
        console.error('Get todos error:', err);
        res.status(500).json({
            success: false,
            error: 'Server Error'
        });
    }
};

exports.syncTodos = async (req, res) => {
    try {
        const { tasks } = req.body;

        // 查找或创建用户的 TodoList
        let todoList = await TodoList.findById(req.user._id);

        if (!todoList) {
            todoList = new TodoList({
                _id: req.user._id,
                tasks: [],
                ownerName: req.user.username || 'User'
            });
        }

        // 更新任务列表
        todoList.tasks = tasks || [];
        todoList.updatedAt = Date.now();
        todoList.pendingCount = (tasks || []).filter(t => !t.completed).length;

        await todoList.save();

        res.status(200).json({
            success: true,
            data: todoList.tasks
        });
    } catch (err) {
        console.error('Sync todos error:', err);
        res.status(500).json({
            success: false,
            error: 'Server Error'
        });
    }
};
