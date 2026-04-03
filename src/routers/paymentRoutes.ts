// src/routers/paymentRoutes.ts
import express from 'express';
import {
    checkPurchase,
    initKhaltiPayment,
    verifyKhaltiPayment,
    initEsewaPayment,
    verifyEsewaPayment,
    verifyEsewaByManuscript,
    verifyEsewaByRefId,
    esewaReturn,
    esewaFailure,
    initEsewaForm,
    khaltiReturn,
} from '../controllers/paymentController';
import { protect } from '../middleware/authMiddleware';
import catchAsync from '../utils/catchAsync';

const router = express.Router();

// Unauthenticated redirect endpoints — eSewa redirects here after payment
router.get('/esewa/return', catchAsync(esewaReturn));
router.get('/esewa/failure', catchAsync(esewaFailure));
router.get('/khalti/return', catchAsync(khaltiReturn));

// Public form endpoint for Chrome/desktop (authenticates via ?token= query param)
router.get('/esewa/init-form', catchAsync(initEsewaForm));

// All routes below require authentication
router.use(protect);

router.get('/check/:manuscriptId', catchAsync(checkPurchase));
router.post('/khalti/init', catchAsync(initKhaltiPayment));
router.post('/khalti/verify', catchAsync(verifyKhaltiPayment));
router.post('/esewa/init', catchAsync(initEsewaPayment));
router.post('/esewa/verify', catchAsync(verifyEsewaPayment));
router.post('/esewa/verify-by-manuscript', catchAsync(verifyEsewaByManuscript));
router.post('/esewa/verify-by-ref', catchAsync(verifyEsewaByRefId));

export default router;
