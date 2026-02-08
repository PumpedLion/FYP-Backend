// src/routers/commentRoutes.ts
import express from 'express';
import {
    addComment,
    getCommentsByChapter,
    deleteComment,
    addReview,
    getReviewsByChapter,
} from '../controllers/commentController';
import { protect } from '../middleware/authMiddleware';
import catchAsync from '../utils/catchAsync';

const router = express.Router();

// Public Routes
router.get('/comment/chapter/:chapterId', catchAsync(getCommentsByChapter));
router.get('/review/chapter/:chapterId', catchAsync(getReviewsByChapter));

// Protected Routes
router.use(protect);

// Comments
router.post('/comment', catchAsync(addComment));
router.delete('/comment/:id', catchAsync(deleteComment));

// Reviews
router.post('/review', catchAsync(addReview));

export default router;
