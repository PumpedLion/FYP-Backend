// src/controllers/paymentController.ts
import { Request, Response } from 'express';
import prisma from '../models/index.js';
import { AuthRequest } from '../middleware/authMiddleware.js';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { sendInvoiceEmail } from './invoiceController.js';

// ─── Config ──────────────────────────────────────────────────────────────────
// Use environment variables in production; these are sandbox/test keys
const KHALTI_SECRET_KEY = process.env.KHALTI_SECRET_KEY || '8b414d3e75ad41d88e16184c75bf6eea';
// Sandbox / test: https://dev.khalti.com/api/v2
// Live / production: https://khalti.com/api/v2
const KHALTI_BASE_URL = process.env.KHALTI_BASE_URL || 'https://khalti.com/api/v2';

const ESEWA_MERCHANT_ID = process.env.ESEWA_MERCHANT_ID || 'EPAYTEST';
const ESEWA_SECRET_KEY = process.env.ESEWA_SECRET_KEY || '8gBm/:&EnhH.1/q'; // UAT secret key
const ESEWA_BASE_URL = 'https://rc-epay.esewa.com.np'; // UAT URL
const BACKEND_URL = process.env.BACKEND_URL || 'https://fyp-backend-qzhc.onrender.com';

// ─── Check Purchase ──────────────────────────────────────────────────────────
export const checkPurchase = async (req: AuthRequest, res: Response) => {
    const userId = req.user.userId;
    const { manuscriptId } = req.params;

    const purchase = await prisma.purchase.findUnique({
        where: { userId_manuscriptId: { userId, manuscriptId: Number(manuscriptId) } },
    });

    return res.status(200).json({ purchased: purchase?.status === 'COMPLETED' });
};

// --- Purchase History ---
export const getPurchaseHistory = async (req: AuthRequest, res: Response) => {
    const userId = req.user.userId;
    try {
        const purchases = await prisma.purchase.findMany({
            where: { userId, status: 'COMPLETED' },
            include: { manuscript: true },
            orderBy: { createdAt: 'desc' },
        });
        return res.status(200).json({ purchases });
    } catch (err) {
        return res.status(500).json({ message: 'Error fetching purchase history' });
    }
};

// ─── Khalti ──────────────────────────────────────────────────────────────────
export const initKhaltiPayment = async (req: AuthRequest, res: Response) => {
    const userId = req.user.userId;
    const { manuscriptId } = req.body;

    const manuscript = await prisma.manuscript.findUnique({ where: { id: Number(manuscriptId) } });
    if (!manuscript) return res.status(404).json({ message: 'Manuscript not found' });
    if (manuscript.price <= 0) return res.status(400).json({ message: 'This manuscript is free' });

    // Amount in Paisa (Khalti requires integer paisa)
    const amountPaisa = Math.round(manuscript.price * 100);

    // Upsert a PENDING purchase record
    const purchase = await prisma.purchase.upsert({
        where: { userId_manuscriptId: { userId, manuscriptId: Number(manuscriptId) } },
        update: { status: 'PENDING', gateway: 'KHALTI' },
        create: {
            userId,
            manuscriptId: Number(manuscriptId),
            amount: manuscript.price,
            gateway: 'KHALTI',
            status: 'PENDING',
        },
    });

    // Initiate Khalti payment
   const payload = {
        return_url: `${BACKEND_URL}/api/payments/khalti/return`,
        website_url: 'https://yourtales.app',
        amount: amountPaisa,
        purchase_order_id: `MANUSCRIPT-${manuscriptId}-USER-${userId}`,
        purchase_order_name: manuscript.title,
        customer_info: { name: 'Reader' },
    };
    
    console.log('--- Initiating Khalti Payment ---');
    console.log('Payload:', JSON.stringify(payload));
    
    let khaltiRes;
    try {
        khaltiRes = await fetch(`${KHALTI_BASE_URL}/epayment/initiate/`, {
            method: 'POST',
            headers: {
                'Authorization': `Key ${KHALTI_SECRET_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });
    } catch (err) {
        console.error('Fetch to Khalti failed:', err);
        return res.status(500).json({ message: 'Network error to Khalti', error: err });
    }

    const khaltiData = await khaltiRes.json() as any;
    console.log('Khalti Response Status:', khaltiRes.status);
    console.log('Khalti Response Data:', JSON.stringify(khaltiData));
    
    if (!khaltiData.pidx) {
        return res.status(500).json({ message: 'Failed to initiate Khalti payment', error: khaltiData });
    }

    // Save pidx to purchase record
    await prisma.purchase.update({
        where: { id: purchase.id },
        data: { pidx: khaltiData.pidx },
    });

    return res.status(200).json({
        payment_url: khaltiData.payment_url,
        pidx: khaltiData.pidx,
    });
};

export const verifyKhaltiPayment = async (req: AuthRequest, res: Response) => {
    const userId = req.user.userId;
    const { pidx, manuscriptId } = req.body;

    // Call Khalti lookup API to verify
    const lookupRes = await fetch(`${KHALTI_BASE_URL}/epayment/lookup/`, {
        method: 'POST',
        headers: {
            'Authorization': `Key ${KHALTI_SECRET_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ pidx }),
    });

    const lookupData = await lookupRes.json() as any;

    if (lookupData.status !== 'Completed') {
        return res.status(400).json({ message: `Payment not completed. Status: ${lookupData.status}` });
    }

    // Mark purchase as completed
    await prisma.purchase.update({
        where: { userId_manuscriptId: { userId, manuscriptId: Number(manuscriptId) } },
        data: { status: 'COMPLETED' },
    });

    // Send invoice email asynchronously
    sendInvoiceEmail(userId, Number(manuscriptId)).catch(console.error);

    return res.status(200).json({ message: 'Payment verified successfully', purchased: true });
};

// ─── Khalti Redirect Handler (unauthenticated — called by Khalti redirect) ────
export const khaltiReturn = async (req: Request, res: Response) => {
    console.log('--- Khalti Return Hit ---');
    console.log('Original URL:', req.originalUrl);
    console.log('Query:', req.query);

    const { pidx, transaction_id, status } = req.query as Record<string, string>;

    if (!pidx || !transaction_id) {
        return res.status(400).send('<h1>Missing payment parameters.</h1>');
    }

    if (status !== 'Completed') {
        const failedHtml = `<!DOCTYPE html>
<html>
<head>
    <title>Payment Failed</title>
    <style>
        body { font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #FEF2F2; }
        .card { text-align: center; padding: 40px; border-radius: 12px; background: white; box-shadow: 0 4px 20px rgba(0,0,0,.1); }
        .icon { font-size: 64px; margin-bottom: 16px; color: #EF4444; }
        h1 { color: #111827; margin: 0 0 10px 0; }
        p { color: #6B7280; margin: 0; }
    </style>
</head>
<body>
    <div class="card">
        <div class="icon">❌</div>
        <h1>Payment Failed</h1>
        <p>Khalti payment was cancelled or failed. Status: ${status}</p>
        <p style="margin-top: 10px;"><b>You can close this tab and try again in the YourTales app.</b></p>
    </div>
    <script>
        setTimeout(() => window.close(), 3000);
    </script>
</body>
</html>`;
        return res.status(200).send(failedHtml);
    }

    // Call lookup API to verify
    try {
        const lookupRes = await fetch(`${KHALTI_BASE_URL}/epayment/lookup/`, {
            method: 'POST',
            headers: {
                'Authorization': `Key ${KHALTI_SECRET_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ pidx }),
        });

        const lookupData = await lookupRes.json() as any;

        if (lookupData.status === 'Completed') {
            // Update purchase record
            const updatedPurchases = await prisma.purchase.findMany({
                where: { pidx: pidx, gateway: 'KHALTI' }
            });

            if (updatedPurchases.length > 0) {
                // If it isn't already completed, we just update it and send an email
                const firstPurchase = updatedPurchases[0];
                if (firstPurchase && firstPurchase.status !== 'COMPLETED') {
                   await prisma.purchase.update({
                       where: { id: firstPurchase.id },
                       data: { status: 'COMPLETED', transactionCode: transaction_id },
                   });
                   sendInvoiceEmail(firstPurchase.userId, firstPurchase.manuscriptId).catch(console.error);
                }
            }

            const successHtml = `<!DOCTYPE html>
<html>
<head>
    <title>Payment Successful</title>
    <style>
        body { font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #ECFDF5; }
        .card { text-align: center; padding: 40px; border-radius: 12px; background: white; box-shadow: 0 4px 20px rgba(0,0,0,.1); }
        .icon { font-size: 64px; margin-bottom: 16px; color: #10B981; }
        h1 { color: #111827; margin: 0 0 10px 0; }
        p { color: #6B7280; margin: 0; }
    </style>
</head>
<body>
    <div class="card">
        <div class="icon">✅</div>
        <h1>Payment Successful</h1>
        <p>Your Khalti payment has been successfully recorded.</p>
        <p style="margin-top: 10px;"><b>You can now close this tab and return to the YourTales app.</b></p>
    </div>
    <script>
        setTimeout(() => window.close(), 3000);
    </script>
</body>
</html>`;
            return res.status(200).send(successHtml);
        } else {
            return res.status(400).send(`<h1>Payment verification failed. Status: ${lookupData.status}</h1>`);
        }
    } catch (e) {
        return res.status(500).send('<h1>Error verifying payment</h1>');
    }
};

// ─── eSewa ───────────────────────────────────────────────────────────────────
export const initEsewaPayment = async (req: AuthRequest, res: Response) => {
    const userId = req.user.userId;
    const { manuscriptId } = req.body;

    const manuscript = await prisma.manuscript.findUnique({ where: { id: Number(manuscriptId) } });
    if (!manuscript) return res.status(404).json({ message: 'Manuscript not found' });
    if (manuscript.price <= 0) return res.status(400).json({ message: 'This manuscript is free' });

    const amount = manuscript.price.toFixed(2);
    const transactionUuid = `MANUSCRIPT-${manuscriptId}-USER-${userId}-${Date.now()}`;

    // eSewa v2 HMAC-SHA256 signature: "total_amount,transaction_uuid,product_code"
    const signatureMessage = `total_amount=${amount},transaction_uuid=${transactionUuid},product_code=${ESEWA_MERCHANT_ID}`;
    const signature = crypto
        .createHmac('sha256', ESEWA_SECRET_KEY)
        .update(signatureMessage)
        .digest('base64');

    // Create/update purchase record
    await prisma.purchase.upsert({
        where: { userId_manuscriptId: { userId, manuscriptId: Number(manuscriptId) } },
        update: { status: 'PENDING', gateway: 'ESEWA', transactionCode: transactionUuid },
        create: {
            userId,
            manuscriptId: Number(manuscriptId),
            amount: manuscript.price,
            gateway: 'ESEWA',
            status: 'PENDING',
            transactionCode: transactionUuid,
        },
    });

    const successUrl = `${BACKEND_URL}/api/payments/esewa/return`;
    const failureUrl = `${BACKEND_URL}/api/payments/esewa/failure`;
    const paymentUrl = `${ESEWA_BASE_URL}/api/epay/main/v2/form`;

    const formData = {
        amount: amount,
        tax_amount: '0',
        total_amount: amount,
        transaction_uuid: transactionUuid,
        product_code: ESEWA_MERCHANT_ID,
        product_service_charge: '0',
        product_delivery_charge: '0',
        success_url: successUrl,
        failure_url: failureUrl,
        signed_field_names: 'total_amount,transaction_uuid,product_code',
        signature: signature,
    };

    // If type=html is requested, return an auto-submitting HTML form (for Web POST redirect)
    if (req.query.type === 'html') {
        const formInputs = Object.entries(formData)
            .map(([key, value]) => `<input type="hidden" name="${key}" value="${value}">`)
            .join('\n');

        const html = `
            <!DOCTYPE html>
            <html>
            <head><title>Redirecting to eSewa...</title></head>
            <body onload="document.forms['esewaForm'].submit()">
                <p>Redirecting to eSewa secure payment...</p>
                <form id="esewaForm" action="${paymentUrl}" method="POST">
                    ${formInputs}
                </form>
            </body>
            </html>
        `;
        return res.status(200).send(html);
    }

    // Default JSON response
    return res.status(200).json({ payment_url: paymentUrl, formData });
};

// ─── eSewa HTML Form (Chrome/Desktop fallback) ────────────────────────────────
// Public GET endpoint: accepts ?manuscriptId=X&token=JWT, returns HTML form page.
// This is needed because launchUrl (external browser) can't send headers,
// and data: URI auto-submit is blocked in Chrome 60+.
export const initEsewaForm = async (req: Request, res: Response) => {
    const { manuscriptId, token } = req.query as Record<string, string>;

    if (!token || !manuscriptId) {
        return res.status(400).send('<h1>Missing parameters</h1>');
    }

    // Verify JWT manually
    let userId: number;
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret') as { userId: number };
        userId = decoded.userId;
    } catch {
        return res.status(401).send('<h1>Invalid or expired token</h1>');
    }

    const manuscript = await prisma.manuscript.findUnique({ where: { id: Number(manuscriptId) } });
    if (!manuscript) return res.status(404).send('<h1>Manuscript not found</h1>');

    const amount = manuscript.price.toFixed(2);
    const transactionUuid = `MANUSCRIPT-${manuscriptId}-USER-${userId}-${Date.now()}`;

    const signatureMessage = `total_amount=${amount},transaction_uuid=${transactionUuid},product_code=${ESEWA_MERCHANT_ID}`;
    const signature = crypto
        .createHmac('sha256', ESEWA_SECRET_KEY)
        .update(signatureMessage)
        .digest('base64');

    await prisma.purchase.upsert({
        where: { userId_manuscriptId: { userId, manuscriptId: Number(manuscriptId) } },
        update: { status: 'PENDING', gateway: 'ESEWA', transactionCode: transactionUuid },
        create: {
            userId,
            manuscriptId: Number(manuscriptId),
            amount: manuscript.price,
            gateway: 'ESEWA',
            status: 'PENDING',
            transactionCode: transactionUuid,
        },
    });

    const successUrl = `${BACKEND_URL}/api/payments/esewa/return`;
    const failureUrl = `${BACKEND_URL}/api/payments/esewa/failure`;
    const paymentUrl = `${ESEWA_BASE_URL}/api/epay/main/v2/form`;

    const formData: Record<string, string> = {
        amount,
        tax_amount: '0',
        total_amount: amount,
        transaction_uuid: transactionUuid,
        product_code: ESEWA_MERCHANT_ID,
        product_service_charge: '0',
        product_delivery_charge: '0',
        success_url: successUrl,
        failure_url: failureUrl,
        signed_field_names: 'total_amount,transaction_uuid,product_code',
        signature,
    };

    const formInputs = Object.entries(formData)
        .map(([key, value]) => `<input type="hidden" name="${key}" value="${value}">`)
        .join('\n');

    const html = `<!DOCTYPE html>
<html>
<head>
  <title>Redirecting to eSewa...</title>
  <style>
    body { font-family: sans-serif; display: flex; align-items: center;
           justify-content: center; height: 100vh; margin: 0; background: #f0f9f0; }
    .card { text-align: center; padding: 40px; border-radius: 12px;
            background: white; box-shadow: 0 4px 20px rgba(0,0,0,.1); }
    .logo { font-size: 48px; margin-bottom: 16px; }
    p { color: #555; }
  </style>
</head>
<body onload="document.getElementById('esewaForm').submit()">
  <div class="card">
    <div class="logo">🟢</div>
    <h2>Redirecting to eSewa...</h2>
    <p>Please wait while we redirect you to the eSewa payment page.</p>
    <form id="esewaForm" action="${paymentUrl}" method="POST">
      ${formInputs}
    </form>
  </div>
</body>
</html>`;

    return res.status(200).send(html);
};


export const verifyEsewaPayment = async (req: AuthRequest, res: Response) => {
    const userId = req.user.userId;
    const { data, manuscriptId } = req.body; // 'data' is the base64 encoded response from eSewa

    let decoded: any;
    try {
        decoded = JSON.parse(Buffer.from(data, 'base64').toString('utf-8'));
    } catch {
        return res.status(400).json({ message: 'Invalid eSewa response data' });
    }

    // Verify the signature
    const { total_amount, transaction_uuid, product_code, signed_field_names, signature } = decoded;
    const signedFields = signed_field_names?.split(',') ?? [];
    const signatureMessage = signedFields.map((f: string) => `${f}=${decoded[f]}`).join(',');
    
    const expectedSignature = crypto
        .createHmac('sha256', ESEWA_SECRET_KEY)
        .update(signatureMessage)
        .digest('base64');

    if (signature !== expectedSignature) {
        return res.status(400).json({ message: 'Signature mismatch. Payment verification failed.' });
    }

    if (decoded.status !== 'COMPLETE') {
        return res.status(400).json({ message: `Payment not completed. Status: ${decoded.status}` });
    }

    // Mark purchase as completed
    await prisma.purchase.update({
        where: { userId_manuscriptId: { userId, manuscriptId: Number(manuscriptId) } },
        data: { status: 'COMPLETED', transactionCode: transaction_uuid },
    });

    // Send invoice email asynchronously
    sendInvoiceEmail(userId, Number(manuscriptId)).catch(console.error);

    return res.status(200).json({ message: 'Payment verified successfully', purchased: true });
};

// ─── eSewa Redirect Handlers (unauthenticated — called by eSewa servers) ─────
export const esewaReturn = async (req: Request, res: Response) => {
    console.log('--- eSewa Return Hit ---');
    console.log('Original URL:', req.originalUrl);
    console.log('Query:', req.query);

    const { data } = req.query as Record<string, string>;

    if (!data) {
        return res.status(400).json({ success: false, message: 'No payment data received from eSewa.' });
    }

    let decoded: any;
    try {
        decoded = JSON.parse(Buffer.from(data, 'base64').toString('utf-8'));
    } catch {
        return res.status(400).json({ success: false, message: 'Invalid eSewa response data.' });
    }

    // Verify HMAC-SHA256 signature
    const { signed_field_names, signature } = decoded;
    const signedFields = (signed_field_names as string)?.split(',') ?? [];
    const signatureMessage = signedFields.map((f: string) => `${f}=${decoded[f]}`).join(',');
    const expectedSignature = crypto
        .createHmac('sha256', ESEWA_SECRET_KEY)
        .update(signatureMessage)
        .digest('base64');

    if (signature !== expectedSignature) {
        return res.status(400).json({ success: false, message: 'Signature mismatch. Payment verification failed.' });
    }

    if (decoded.status !== 'COMPLETE') {
        return res.status(400).json({ success: false, message: `Payment not completed. Status: ${decoded.status}` });
    }

    // Mark purchase COMPLETED using the transaction_uuid
    const transactionCode = decoded.transaction_uuid || decoded.transaction_code;
    if (transactionCode) {
        const matchingPurchases = await prisma.purchase.findMany({
            where: { transactionCode: transactionCode, gateway: 'ESEWA' }
        });

        if (matchingPurchases.length > 0) {
             const purchase = matchingPurchases[0];
             if (purchase && purchase.status !== 'COMPLETED') {
                 await prisma.purchase.update({
                     where: { id: purchase.id },
                     data: { status: 'COMPLETED' },
                 });
                 // Fire and forget email
                 sendInvoiceEmail(purchase.userId, purchase.manuscriptId).catch(console.error);
             }
        }
    }

    const html = `<!DOCTYPE html>
<html>
<head>
    <title>Payment Successful</title>
    <style>
        body { font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #ECFDF5; }
        .card { text-align: center; padding: 40px; border-radius: 12px; background: white; box-shadow: 0 4px 20px rgba(0,0,0,.1); }
        .icon { font-size: 64px; margin-bottom: 16px; color: #10B981; }
        h1 { color: #111827; margin: 0 0 10px 0; }
        p { color: #6B7280; margin: 0; }
    </style>
</head>
<body>
    <div class="card">
        <div class="icon">✅</div>
        <h1>Payment Successful</h1>
        <p>Your payment has been successfully recorded.</p>
        <p style="margin-top: 10px;"><b>You can now close this tab and return to the YourTales app.</b></p>
    </div>
    <script>
        // Attempt to auto-close the tab if the browser permits it
        setTimeout(() => window.close(), 3000);
    </script>
</body>
</html>`;

    return res.status(200).send(html);
};

export const esewaFailure = async (_req: Request, res: Response) => {
    const html = `<!DOCTYPE html>
<html>
<head>
    <title>Payment Failed</title>
    <style>
        body { font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #FEF2F2; }
        .card { text-align: center; padding: 40px; border-radius: 12px; background: white; box-shadow: 0 4px 20px rgba(0,0,0,.1); }
        .icon { font-size: 64px; margin-bottom: 16px; color: #EF4444; }
        h1 { color: #111827; margin: 0 0 10px 0; }
        p { color: #6B7280; margin: 0; }
    </style>
</head>
<body>
    <div class="card">
        <div class="icon">❌</div>
        <h1>Payment Failed</h1>
        <p>Your payment was cancelled or failed.</p>
        <p style="margin-top: 10px;"><b>You can close this tab and try again in the YourTales app.</b></p>
    </div>
    <script>
        setTimeout(() => window.close(), 3000);
    </script>
</body>
</html>`;

    return res.status(200).send(html);
};

// eSewa server-side verify (no redirect data required)
export const verifyEsewaByManuscript = async (req: AuthRequest, res: Response) => {
    const userId = req.user.userId;
    const { manuscriptId } = req.body;

    console.log(`\n--- Verify eSewa By Manuscript Hit [User: ${userId}, Manuscript: ${manuscriptId}] ---`);

    const purchase = await prisma.purchase.findUnique({
        where: { userId_manuscriptId: { userId, manuscriptId: Number(manuscriptId) } },
    });

    if (!purchase) {
        console.log('Error: Purchase not found in DB');
        return res.status(400).json({ message: 'No pending eSewa payment found. Please initiate payment first.' });
    }
    if (purchase.gateway !== 'ESEWA') {
        console.log(`Error: Gateway is ${purchase.gateway}, not ESEWA`);
        return res.status(400).json({ message: 'No pending eSewa payment found. Please initiate payment first.' });
    }
    if (!purchase.transactionCode) {
        console.log(`Error: transactionCode is missing in DB`);
        return res.status(400).json({ message: 'No pending eSewa payment found. Please initiate payment first.' });
    }

    // If the redirect handler (esewaReturn) already verified and marked this completed,
    // we can immediately return true without hitting the eSewa API again.
    if (purchase.status === 'COMPLETED') {
        return res.status(200).json({ message: 'eSewa payment already verified successfully', purchased: true });
    }

    const transactionUuid = purchase.transactionCode;
    const amount = purchase.amount.toFixed(2);

    console.log(`Purchase found. Status: ${purchase.status}. Falling back to eSewa Transaction API [UUID: ${transactionUuid}]`);

    // Call eSewa status check API
    const statusRes = await fetch(
        `${ESEWA_BASE_URL}/api/epay/transaction/status/?product_code=${ESEWA_MERCHANT_ID}&total_amount=${amount}&transaction_uuid=${transactionUuid}`,
        { method: 'GET', headers: { 'Content-Type': 'application/json' } }
    );

    const statusData = await statusRes.json() as any;
    console.log(`eSewa Transaction Status Response:`, statusData);

    if (statusData.status !== 'COMPLETE') {
        console.log(`Error: Status is ${statusData.status}, returning 400 to Flutter.`);
        return res.status(400).json({ 
            message: `Payment not confirmed by eSewa. Status: ${statusData.status ?? 'UNKNOWN'}. Please complete the payment in the browser first.` 
        });
    }

    await prisma.purchase.update({
        where: { id: purchase.id },
        data: { status: 'COMPLETED' },
    });

    sendInvoiceEmail(userId, Number(manuscriptId)).catch(console.error);

    return res.status(200).json({ message: 'eSewa payment verified successfully', purchased: true });
};

// eSewa SDK mobile verify — using refId from SDK success result
export const verifyEsewaByRefId = async (req: AuthRequest, res: Response) => {
    const userId = req.user.userId;
    const { manuscriptId, refId, amount, productId } = req.body;

    // Verify via eSewa Transaction API (Method 1: by refId)
    const verifyRes = await fetch(
        `https://rc.esewa.com.np/mobile/transaction?txnRefId=${refId}`,
        {
            method: 'GET',
            headers: {
                'merchantId': ESEWA_MERCHANT_ID,
                'merchantSecret': ESEWA_SECRET_KEY,
                'Content-Type': 'application/json',
            },
        }
    );

    const verifyData = await verifyRes.json() as any[];
    const txn = Array.isArray(verifyData) ? verifyData[0] : verifyData;

    if (txn?.transactionDetails?.status !== 'COMPLETE') {
        return res.status(400).json({
            message: `eSewa verification failed. Status: ${txn?.transactionDetails?.status ?? 'UNKNOWN'}`,
        });
    }

    // Upsert purchase as COMPLETED
    await prisma.purchase.upsert({
        where: { userId_manuscriptId: { userId, manuscriptId: Number(manuscriptId) } },
        update: { status: 'COMPLETED', gateway: 'ESEWA', transactionCode: refId },
        create: {
            userId,
            manuscriptId: Number(manuscriptId),
            amount: Number(amount),
            gateway: 'ESEWA',
            status: 'COMPLETED',
            transactionCode: refId,
        },
    });

    // Note: upsert returns the affected record
    // We only want to send it if it wasn't already completed... but for safety, we just send.
    // Ideally we check if it was PENDING first, but this is a simplified approach.
    sendInvoiceEmail(userId, Number(manuscriptId)).catch(console.error);

    return res.status(200).json({ message: 'eSewa payment verified', purchased: true });
};

