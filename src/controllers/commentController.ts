// src/controllers/commentController.ts
import { Response } from 'express';
import prisma from '../models';
import { AuthRequest } from '../middleware/authMiddleware';
import { createNotification } from './notificationController';

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
        },
        include: { author: { select: { fullName: true, avatarUrl: true } } }
    });

    // Notify author of the manuscript
    if (chapter.manuscript.authorId !== authorId) {
        await createNotification(
            chapter.manuscript.authorId,
            'COMMENT',
            'New Comment',
            `${req.user.fullName || 'Someone'} commented on Chapter "${chapter.title}": "${content.substring(0, 30)}..."`,
            { manuscriptId: chapter.manuscriptId, chapterId: chapter.id, commentId: comment.id }
        );
    }

    return res.status(201).json({ message: 'Comment added', comment });
};

export const getCommentsByChapter = async (req: AuthRequest, res: Response) => {
    const { chapterId } = req.params;

    const comments = await prisma.comment.findMany({
        where: { chapterId: Number(chapterId) },
        include: { author: { select: { id: true, fullName: true, avatarUrl: true } } },
        orderBy: { createdAt: 'asc' },
    });

    return res.status(200).json({ comments });
};

export const deleteComment = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const userId = req.user.userId;

    const comment = await prisma.comment.findUnique({
        where: { id: Number(id) }
    });

    if (!comment) return res.status(404).json({ message: 'Comment not found' });

    if (comment.authorId !== userId) {
        return res.status(403).json({ message: 'Permission denied' });
    }

    await prisma.comment.delete({ where: { id: Number(id) } });

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
            'SYSTEM', // Or MENTION, but let's use SYSTEM for reviews or define a new one if needed
            'New Review',
            `${req.user.fullName || 'Someone'} gave a ${rating}-star review on Chapter "${chapter.title}".`,
            { manuscriptId: chapter.manuscriptId, chapterId: chapter.id, reviewId: review.id }
        );
    }

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
