// src/controllers/commentController.ts
import { Response } from 'express';
import prisma from '../models/index.js';
import { AuthRequest } from '../middleware/authMiddleware.js';
import { createNotification } from './notificationController.js';

import { emitToChapter, emitToUser } from '../services/socketService.js';

// --- Comments ---

export const addComment = async (req: AuthRequest, res: Response) => {
    const { chapterId, content } = req.body;
    const authorId = req.user.userId;

    const chapter = await prisma.chapter.findUnique({
        where: { id: Number(chapterId) },
        include: { manuscript: true }
    });

    if (!chapter) return res.status(404).json({ message: 'Chapter not found' });

    const comment = await prisma.comment.create({
        data: {
            chapterId: Number(chapterId),
            authorId,
            content,
            type: req.body.type || 'EDITORIAL',
        },
        include: { author: { select: { fullName: true, avatarUrl: true } } }
    });

    // Notify author of the manuscript via database notification
    if (chapter.manuscript.authorId !== authorId) {
        await createNotification(
            chapter.manuscript.authorId,
            'COMMENT',
            'New Comment',
            `${req.user.fullName || 'Someone'} commented on Chapter "${chapter.title}": "${content.substring(0, 30)}..."`,
            { manuscriptId: chapter.manuscriptId, chapterId: chapter.id, commentId: comment.id }
        );
    }

    // Emit real-time comment via Socket.io to the chapter room
    emitToChapter(Number(chapterId), 'new_comment', comment);

    // Emit to author for dashboard refresh
    emitToUser(chapter.manuscript.authorId, 'stats_update', { type: 'COMMENT_ADDED' });

    return res.status(201).json({ message: 'Comment added', comment });
};

export const getCommentsByChapter = async (req: AuthRequest, res: Response) => {
    const { chapterId } = req.params;

    const { type } = req.query;

    const comments = await prisma.comment.findMany({
        where: {
            chapterId: Number(chapterId),
            ...(type && { type: type as any })
        },
        include: { author: { select: { id: true, fullName: true, avatarUrl: true } } },
        orderBy: { createdAt: 'asc' },
    });

    return res.status(200).json({ comments });
};

export const deleteComment = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const userId = req.user.userId;

    const comment = await prisma.comment.findUnique({
        where: { id: Number(id) },
        include: { chapter: { include: { manuscript: true } } }
    });

    if (!comment) return res.status(404).json({ message: 'Comment not found' });

    if (comment.authorId !== userId) {
        return res.status(403).json({ message: 'Permission denied' });
    }

    await prisma.comment.delete({ where: { id: Number(id) } });

    // Clean up associated notifications so they disappear from "Recent Activity"
    try {
        await prisma.notification.deleteMany({
            where: {
                data: {
                    path: ['commentId'],
                    equals: Number(id)
                }
            }
        });
    } catch (e) {
        console.error("Failed to delete notification for comment:", e);
        // Fallback: try raw match if path filter fails depending on prisma version/db
        await prisma.notification.deleteMany({
            where: {
                data: {
                    equals: { commentId: Number(id) }
                }
            }
        }).catch(() => { });
    }

    // Emit to the chapter room (for people in the editor)
    emitToChapter(comment.chapterId, 'comment_deleted', { id: Number(id), chapterId: comment.chapterId });

    // Emit to the manuscript author's user room (for dashboard refresh)
    emitToUser(comment.chapter.manuscript.authorId, 'comment_deleted', { id: Number(id) });

    return res.status(200).json({ message: 'Comment deleted' });
};

// --- Reviews ---

export const addReview = async (req: AuthRequest, res: Response) => {
    const { chapterId, rating, content } = req.body;
    const authorId = req.user.userId;

    const chapter = await prisma.chapter.findUnique({
        where: { id: Number(chapterId) },
        include: { manuscript: true }
    });

    if (!chapter) return res.status(404).json({ message: 'Chapter not found' });

    const review = await prisma.review.create({
        data: {
            chapterId: Number(chapterId),
            authorId,
            rating: Number(rating),
            content,
        },
        include: { author: { select: { fullName: true, avatarUrl: true } } }
    });

    // Notify author
    if (chapter.manuscript.authorId !== authorId) {
        await createNotification(
            chapter.manuscript.authorId,
            'SYSTEM',
            'New Review',
            `${req.user.fullName || 'Someone'} gave a ${rating}-star review on Chapter "${chapter.title}".`,
            { manuscriptId: chapter.manuscriptId, chapterId: chapter.id, reviewId: review.id }
        );
    }

    // Emit real-time stats update to the author
    emitToUser(chapter.manuscript.authorId, 'stats_update', { type: 'REVIEW_ADDED' });

    return res.status(201).json({ message: 'Review submitted', review });
};

export const getReviewsByChapter = async (req: AuthRequest, res: Response) => {
    const { chapterId } = req.params;

    const reviews = await prisma.review.findMany({
        where: { chapterId: Number(chapterId) },
        include: { author: { select: { id: true, fullName: true, avatarUrl: true } } },
        orderBy: { createdAt: 'desc' },
    });

    return res.status(200).json({ reviews });
};

export const deleteReview = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const userId = req.user.userId;

    const review = await prisma.review.findUnique({
        where: { id: Number(id) },
        include: { chapter: { include: { manuscript: true } } }
    });

    if (!review) return res.status(404).json({ message: 'Review not found' });

    if (review.authorId !== userId) {
        return res.status(403).json({ message: 'Permission denied' });
    }

    await prisma.review.delete({ where: { id: Number(id) } });

    // Emit to the chapter room
    emitToChapter(review.chapterId, 'review_deleted', { id: Number(id), chapterId: review.chapterId });

    // Emit to the manuscript author's user room
    emitToUser(review.chapter.manuscript.authorId, 'review_deleted', { id: Number(id) });

    return res.status(200).json({ message: 'Review deleted' });
};
