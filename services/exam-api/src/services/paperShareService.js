/**
 * 试卷分享服务层
 * 封装分享码的生成、格式化、状态判断等业务逻辑。
 */
const crypto = require('crypto');
const PaperShare = require('../models/PaperShare');
const PaperShareReceipt = require('../models/PaperShareReceipt');
const Category = require('../models/Category');
const MajorCategory = require('../models/MajorCategory');
const Question = require('../models/Question');
const { AppError, NotFoundError } = require('../utils/errors');
const {
    ADMIN_SCOPE,
    PERSONAL_SCOPE,
    buildScopeAssignment,
    buildAdminScopeQuery,
} = require('../utils/libraryScope');
const { QUESTION_ORDER_SORT } = require('../utils/questionOrder');

const SHARE_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function normalizeShareCode(value) {
    return String(value || '').trim().replace(/[\s-]/g, '').toUpperCase();
}

function formatShareCode(code) {
    const normalized = normalizeShareCode(code);
    return normalized.length > 4
        ? `${normalized.slice(0, 4)}-${normalized.slice(4)}`
        : normalized;
}

function buildShareUrl(req, shareCode) {
    const origin = `${req.protocol}://${req.get('host')}`;
    return `${origin}/login?shareCode=${encodeURIComponent(normalizeShareCode(shareCode))}`;
}

function getPermissionLabel(permission) {
    return permission === 'edit' ? '可编辑副本' : '只读副本';
}

function getShareState(share) {
    const expired = Boolean(share.expiresAt && new Date(share.expiresAt).getTime() <= Date.now());
    const reachedLimit = Boolean(share.maxAcceptCount > 0 && share.acceptedCount >= share.maxAcceptCount);

    if (share.status === 'revoked') return 'revoked';
    if (expired) return 'expired';
    if (reachedLimit) return 'limited';
    return 'active';
}

function assertShareUsable(share) {
    if (!share) {
        throw new NotFoundError('分享不存在或分享码错误');
    }

    const state = getShareState(share);
    if (state === 'revoked') {
        throw new AppError('该分享已被撤销', 400);
    }
    if (state === 'expired') {
        throw new AppError('该分享已过期', 400);
    }
    if (state === 'limited') {
        throw new AppError('该分享已达到接收次数上限', 400);
    }
}

async function reserveShareAcceptance(share) {
    const now = new Date();
    const reservedShare = await PaperShare.findOneAndUpdate(
        {
            _id: share._id,
            status: 'active',
            $or: [
                { expiresAt: null },
                { expiresAt: { $exists: false } },
                { expiresAt: { $gt: now } },
            ],
            $and: [
                {
                    $or: [
                        { maxAcceptCount: { $lte: 0 } },
                        { $expr: { $lt: ['$acceptedCount', '$maxAcceptCount'] } },
                    ],
                },
            ],
        },
        {
            $inc: { acceptedCount: 1 },
            $set: { lastAcceptedAt: now },
        },
        { new: true },
    );

    if (!reservedShare) {
        const latestShare = await PaperShare.findById(share._id).lean();
        assertShareUsable(latestShare);
        throw new AppError('分享接收失败，请稍后再试', 409);
    }

    return reservedShare;
}

const SHARED_MAJOR_CATEGORY_NAME = '来自分享';

async function ensureSharedMajorCategory(ownerOpenid) {
    let majorCategory = await MajorCategory.findOne({
        scopeType: PERSONAL_SCOPE,
        ownerOpenid,
        name: SHARED_MAJOR_CATEGORY_NAME,
    });

    if (!majorCategory) {
        majorCategory = await MajorCategory.create({
            name: SHARED_MAJOR_CATEGORY_NAME,
            sortOrder: 9999,
            showOnHome: true,
            ...buildScopeAssignment(PERSONAL_SCOPE, ownerOpenid),
        });
    }

    return majorCategory;
}

async function copySharedPaperToRecipient(share, recipientOpenid) {
    if (!share) {
        throw new NotFoundError('分享不存在或分享码错误');
    }

    const existingReceipt = await PaperShareReceipt.findOne({
        shareId: share._id,
        recipientOpenid,
    })
        .populate('newCategoryId')
        .lean();

    if (existingReceipt?.newCategoryId) {
        return {
            receipt: existingReceipt,
            category: existingReceipt.newCategoryId,
            created: false,
        };
    }

    if (existingReceipt) {
        await PaperShareReceipt.deleteOne({ _id: existingReceipt._id });
    }

    if (share.ownerOpenid === recipientOpenid) {
        throw new AppError('不能接收自己创建的分享', 400);
    }

    assertShareUsable(share);

    const sourceCategoryQuery = share.sourceScopeType === ADMIN_SCOPE
        ? buildAdminScopeQuery({ _id: share.categoryId })
        : {
            _id: share.categoryId,
            scopeType: PERSONAL_SCOPE,
            ownerOpenid: share.ownerOpenid,
        };
    const sourceQuestionQuery = share.sourceScopeType === ADMIN_SCOPE
        ? buildAdminScopeQuery({ categoryId: share.categoryId })
        : {
            categoryId: share.categoryId,
            scopeType: PERSONAL_SCOPE,
            ownerOpenid: share.ownerOpenid,
        };

    const [sourceCategory, sourceQuestions, targetMajorCategory] = await Promise.all([
        Category.findOne(sourceCategoryQuery).lean(),
        Question.find(sourceQuestionQuery).sort(QUESTION_ORDER_SORT).lean(),
        ensureSharedMajorCategory(recipientOpenid),
    ]);

    if (!sourceCategory) {
        throw new NotFoundError('分享来源试卷不存在');
    }

    await reserveShareAcceptance(share);

    const now = new Date();
    let copiedCategory = null;

    try {
        copiedCategory = await Category.create({
            name: sourceCategory.name,
            description: sourceCategory.description || '',
            count: sourceQuestions.length,
            duration: sourceCategory.duration || 0,
            passingScore: sourceCategory.passingScore || 60,
            isPublished: true,
            majorCategoryId: targetMajorCategory._id,
            ...buildScopeAssignment(PERSONAL_SCOPE, recipientOpenid),
            shareOrigin: {
                shareId: share._id,
                sourceCategoryId: sourceCategory._id,
                sourceOwnerOpenid: share.ownerOpenid,
                permission: share.permission,
                acceptedAt: now,
            },
        });

        if (sourceQuestions.length > 0) {
            await Question.insertMany(sourceQuestions.map((question, index) => ({
                type: question.type,
                content: question.content,
                options: question.options,
                answer: question.answer,
                analysis: question.analysis,
                analysisSource: question.analysisSource || 'manual',
                categoryId: copiedCategory._id,
                sortOrder: index,
                ...buildScopeAssignment(PERSONAL_SCOPE, recipientOpenid),
            })));
        }

        const receipt = await PaperShareReceipt.create({
            shareId: share._id,
            shareCode: share.shareCode,
            sourceCategoryId: sourceCategory._id,
            newCategoryId: copiedCategory._id,
            ownerOpenid: share.ownerOpenid,
            recipientOpenid,
            permission: share.permission,
        });

        return {
            receipt,
            category: copiedCategory,
            created: true,
        };
    } catch (error) {
        await PaperShare.findByIdAndUpdate(share._id, {
            $inc: { acceptedCount: -1 },
        }).catch(() => {});

        if (copiedCategory?._id) {
            await Promise.all([
                Question.deleteMany({ categoryId: copiedCategory._id }),
                Category.deleteOne({ _id: copiedCategory._id }),
            ]).catch(() => {});
        }

        if (error.code === 11000) {
            const latestReceipt = await PaperShareReceipt.findOne({
                shareId: share._id,
                recipientOpenid,
            })
                .populate('newCategoryId')
                .lean();

            if (latestReceipt?.newCategoryId) {
                return {
                    receipt: latestReceipt,
                    category: latestReceipt.newCategoryId,
                    created: false,
                };
            }
        }

        throw error;
    }
}

function toSharePayload(share, req = null) {
    const item = share.toObject ? share.toObject() : share;
    const state = getShareState(item);
    return {
        ...item,
        state,
        isActive: state === 'active',
        permissionLabel: getPermissionLabel(item.permission),
        shareCodeText: formatShareCode(item.shareCode),
        shareUrl: req ? buildShareUrl(req, item.shareCode) : undefined,
    };
}

function createRandomShareCode(length = 8) {
    let code = '';
    for (let i = 0; i < length; i += 1) {
        code += SHARE_CODE_ALPHABET[crypto.randomInt(0, SHARE_CODE_ALPHABET.length)];
    }
    return code;
}

async function generateUniqueShareCode() {
    for (let i = 0; i < 10; i += 1) {
        const code = createRandomShareCode();
        const exists = await PaperShare.exists({ shareCode: code });
        if (!exists) return code;
    }
    throw new AppError('分享码生成失败，请稍后再试', 500);
}

function getAdminShareOwner(req) {
    return `admin:${req.user.id}`;
}

module.exports = {
    normalizeShareCode,
    formatShareCode,
    buildShareUrl,
    getPermissionLabel,
    getShareState,
    assertShareUsable,
    reserveShareAcceptance,
    copySharedPaperToRecipient,
    toSharePayload,
    generateUniqueShareCode,
    getAdminShareOwner,
};
