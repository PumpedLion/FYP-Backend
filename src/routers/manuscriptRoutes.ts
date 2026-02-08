// src/routers/manuscriptRoutes.ts
import express from 'express';
import {
    createManuscript,
    getMyManuscripts,
    getManuscriptById,
    updateManuscript,
    deleteManuscript,
    inviteCollaborator,
    respondToInvitation,
    getAllManuscripts,
    getDashboardStats
} from '../controllers/manuscriptController';
import { protect } from '../middleware/authMiddleware';
import catchAsync from '../utils/catchAsync';

const router = express.Router();

// Public Routes
router.get('/', catchAsync(getAllManuscripts));
router.get('/my-manuscripts', protect, catchAsync(getMyManuscripts));
router.get('/stats', protect, catchAsync(getDashboardStats));
router.get('/:id', catchAsync(getManuscriptById));

// Protected Routes
router.use(protect);

// Manuscript CRUD
router.post('/', catchAsync(createManuscript));
router.patch('/:id', catchAsync(updateManuscript));
router.delete('/:id', catchAsync(deleteManuscript));

// Collaboration
router.post('/invite', catchAsync(inviteCollaborator));
router.post('/respond', catchAsync(respondToInvitation));

export default router;
