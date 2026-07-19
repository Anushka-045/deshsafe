const express = require('express');
const { ObjectId } = require('mongodb');
const { getDB } = require('../db');
const { createReport, validateReport } = require('../models/Report');
const { verifyToken, verifyAdmin } = require('../middleware/auth');
const { distanceKm, parseNearbyQuery } = require('../utils/geo');

const router = express.Router();
const COLLECTION = 'reports';

const FALLBACK_REPORTS = [
    {
        _id: 'rep-001',
        type: 'flood',
        description: 'Waterlogging — Minto Road underpass. Traffic closed.',
        location: {
            lat: 28.6358,
            lng: 77.2245,
            address: 'Central Delhi'
        },
        createdAt: new Date(Date.now() - 25 * 60 * 1000), // 25 mins ago
        severity: 'high',
        status: 'verified'
    },
    {
        _id: 'rep-002',
        type: 'other',
        description: 'Power outage — Sector 15 Rohini. Substation issue.',
        location: {
            lat: 28.7158,
            lng: 77.1183,
            address: 'North Delhi'
        },
        createdAt: new Date(Date.now() - 60 * 60 * 1000), // 1 hour ago
        severity: 'medium',
        status: 'verified'
    },
    {
        _id: 'rep-003',
        type: 'other',
        description: 'Tree fallen on road — Golf Links. MCD notified.',
        location: {
            lat: 28.5879,
            lng: 77.2294,
            address: 'South Delhi'
        },
        createdAt: new Date(Date.now() - 180 * 60 * 1000), // 3 hours ago
        severity: 'low',
        status: 'resolved'
    }
];
// PUBLIC: reports near a location (radius search)
router.get('/nearby', async (req, res, next) => {
    try {
        const { latitude, longitude, radius } = parseNearbyQuery(req.query);
        const { status } = req.query;
        const VALID_STATUSES = ['pending', 'verified', 'rejected', 'resolved'];

        let pool;
        try {
            const filter = {};
            if (status === 'all') {
                // no status filter
            } else if (status && VALID_STATUSES.includes(status)) {
                filter.status = status;
            } else {
                filter.status = { $in: ['verified', 'resolved'] };
            }
            pool = await getDB().collection(COLLECTION).find(filter).toArray();
        } catch (dbErr) {
            pool = [...FALLBACK_REPORTS];
            if (status && status !== 'all' && VALID_STATUSES.includes(status)) {
                pool = pool.filter(r => r.status === status);
            } else if (status !== 'all') {
                pool = pool.filter(r => ['verified', 'resolved'].includes(r.status));
            }
        }

        const nearby = pool
            .filter(r => r.location && typeof r.location.lat === 'number' && typeof r.location.lng === 'number')
            .map(r => ({
                ...r,
                distanceKm: Math.round(distanceKm(latitude, longitude, r.location.lat, r.location.lng) * 10) / 10
            }))
            .filter(r => r.distanceKm <= radius)
            .sort((a, b) => a.distanceKm - b.distanceKm);

        res.json({ total: nearby.length, radiusKm: radius, reports: nearby });
    } catch (err) { next(err); }
});

// PUBLIC: list verified reports
router.get('/', async (req, res, next) => {
    try {
        const { type, severity, state, status, limit = 20, skip = 0, startDate, endDate } = req.query;
        let reports;
        let total;

        let db;
        try {
            db = getDB();
        } catch (dbErr) {
            // DB not connected, use fallback mock data
            reports = [...FALLBACK_REPORTS];
            
            // Filter by type
            if (type) reports = reports.filter(r => r.type === type);
            // Filter by severity
            if (severity) reports = reports.filter(r => r.severity === severity);
            
            // Filter by date range
            if (startDate || endDate) {
                reports = reports.filter(r => {
                    const time = new Date(r.createdAt).getTime();
                    if (startDate && time < new Date(startDate).getTime()) return false;
                    if (endDate) {
                        const end = new Date(endDate);
                        end.setHours(23, 59, 59, 999);
                        if (time > end.getTime()) return false;
                    }
                    return true;
                });
            }

            // Filter by status
            const VALID_STATUSES = ['pending', 'verified', 'rejected', 'resolved'];
            if (status && status !== 'all') {
                if (VALID_STATUSES.includes(status)) {
                    reports = reports.filter(r => r.status === status);
                } else {
                    reports = reports.filter(r => ['verified', 'resolved'].includes(r.status));
                }
            } else if (!status || status !== 'all') {
                reports = reports.filter(r => ['verified', 'resolved'].includes(r.status));
            }

            total = reports.length;
            reports = reports.slice(Number(skip), Number(skip) + Number(limit));
            return res.json({ total, reports });
        }

        // DB connected, do MongoDB queries
        const filter = {};
        if (type) filter.type = type;
        if (severity) filter.severity = severity;
        if (state) filter['location.state'] = { $regex: new RegExp(state, 'i') };
        
        // Support status values: all, pending, verified, rejected, resolved
        const VALID_STATUSES = ['pending', 'verified', 'rejected', 'resolved'];
        if (status) {
            if (status === 'all') {
                // Return reports with any status
            } else if (VALID_STATUSES.includes(status)) {
                filter.status = status;
            } else {
                filter.status = { $in: ['verified', 'resolved'] };
            }
        } else {
            filter.status = { $in: ['verified', 'resolved'] };
        }

        // Support Date filtering
        if (startDate || endDate) {
            filter.createdAt = {};
            if (startDate) filter.createdAt.$gte = new Date(startDate);
            if (endDate) {
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999);
                filter.createdAt.$lte = end;
            }
        }

        reports = await db.collection(COLLECTION)
            .find(filter).sort({ createdAt: -1 })
            .skip(Number(skip)).limit(Math.min(Number(limit), 100)).toArray();
        total = await db.collection(COLLECTION).countDocuments(filter);
        res.json({ total, reports });
    } catch (err) { next(err); }
});

// PUBLIC: get single report
router.get('/:id', async (req, res, next) => {
    try {
        let report;
        try {
            report = await getDB().collection(COLLECTION)
                .findOne({ _id: new ObjectId(req.params.id) });
        } catch (dbErr) {
            report = FALLBACK_REPORTS.find(r => r._id === req.params.id);
        }
        
        if (!report) return res.status(404).json({ error: 'Report not found' });
        res.json(report);
    } catch (err) {
        if (err.message.includes('ObjectId')) return res.status(400).json({ error: 'Invalid report ID' });
        next(err);
    }
});

// AUTH: submit report
router.post('/', verifyToken, async (req, res, next) => {
    try {
        const validation = validateReport(req.body);
        if (!validation.valid) return res.status(400).json({ errors: validation.errors });
        const doc = createReport({ ...req.body, userId: req.user.uid });
        
        let savedReport;
        try {
            const result = await getDB().collection(COLLECTION).insertOne(doc);
            savedReport = { _id: result.insertedId, ...doc };
        } catch (dbErr) {
            savedReport = { _id: 'mock-rep-' + Math.floor(Math.random() * 100000), ...doc };
            FALLBACK_REPORTS.unshift(savedReport); // add to fallback list
        }

        // Emit new-incident event via Socket.io
        const io = req.app.get('io');
        if (io) {
            io.emit('new-incident', savedReport);

            // Also emit to region room if state is available
            const state = savedReport.location && savedReport.location.state;
            if (state) {
                io.to(state.trim().toLowerCase()).emit('new-incident', savedReport);
            }
        }

        res.status(201).json(savedReport);
    } catch (err) { next(err); }
});

// AUTH: my submissions
router.get('/my/submissions', verifyToken, async (req, res, next) => {
    try {
        let reports;
        try {
            reports = await getDB().collection(COLLECTION)
                .find({ userId: req.user.uid }).sort({ createdAt: -1 }).toArray();
        } catch (dbErr) {
            reports = FALLBACK_REPORTS.filter(r => r.userId === req.user.uid);
        }
        res.json({ total: reports.length, reports });
    } catch (err) { next(err); }
});

// ADMIN: all reports
router.get('/admin/all', verifyAdmin, async (req, res, next) => {
    try {
        const { status, limit = 50, skip = 0 } = req.query;
        let reports;
        let total;
        try {
            const filter = {};
            if (status) filter.status = status;
            reports = await getDB().collection(COLLECTION)
                .find(filter).sort({ createdAt: -1 })
                .skip(Number(skip)).limit(Math.min(Number(limit), 200)).toArray();
            total = await getDB().collection(COLLECTION).countDocuments(filter);
        } catch (dbErr) {
            reports = [...FALLBACK_REPORTS];
            if (status) reports = reports.filter(r => r.status === status);
            total = reports.length;
            reports = reports.slice(Number(skip), Number(skip) + Number(limit));
        }
        res.json({ total, reports });
    } catch (err) { next(err); }
});

// ADMIN: update status
router.patch('/:id/status', verifyAdmin, async (req, res, next) => {
    try {
        const { status } = req.body;
        const VALID = ['pending','verified','rejected','resolved'];
        if (!VALID.includes(status)) return res.status(400).json({ error: `status must be one of: ${VALID.join(', ')}` });
        
        let result;
        let previousStatus = null;
        try {
            // Capture previous status before update
            const existing = await getDB().collection(COLLECTION)
                .findOne({ _id: new ObjectId(req.params.id) });
            previousStatus = existing ? existing.status : null;

            result = await getDB().collection(COLLECTION).findOneAndUpdate(
                { _id: new ObjectId(req.params.id) },
                { $set: { status, verifiedBy: req.user.uid, updatedAt: new Date() } },
                { returnDocument: 'after' }
            );
        } catch (dbErr) {
            const index = FALLBACK_REPORTS.findIndex(r => r._id === req.params.id);
            if (index !== -1) {
                previousStatus = FALLBACK_REPORTS[index].status;
                FALLBACK_REPORTS[index].status = status;
                FALLBACK_REPORTS[index].updatedAt = new Date();
                result = FALLBACK_REPORTS[index];
            }
        }
        
        if (!result) return res.status(404).json({ error: 'Report not found' });

        // Emit alert-update event via Socket.io for all status changes
        const io = req.app.get('io');
        if (io) {
            const payload = {
                _id: result._id,
                type: result.type,
                severity: result.severity,
                status: result.status,
                previousStatus,
                location: result.location,
                description: result.description,
                updatedAt: result.updatedAt,
            };
            io.emit('alert-update', payload);

            // Also emit new-incident for verified/resolved so map adds marker
            if (['verified', 'resolved'].includes(status)) {
                io.emit('new-incident', result);
            }

            // Emit to region room if state is available
            const state = result.location && result.location.state;
            if (state) {
                const room = state.trim().toLowerCase();
                io.to(room).emit('alert-update', payload);
                if (['verified', 'resolved'].includes(status)) {
                    io.to(room).emit('new-incident', result);
                }
            }
        }

        res.json(result);
    } catch (err) {
        if (err.message.includes('ObjectId')) return res.status(400).json({ error: 'Invalid report ID' });
        next(err);
    }
});

// ADMIN: delete report
router.delete('/:id', verifyAdmin, async (req, res, next) => {
    try {
        let deletedCount = 0;
        try {
            const result = await getDB().collection(COLLECTION)
                .deleteOne({ _id: new ObjectId(req.params.id) });
            deletedCount = result.deletedCount;
        } catch (dbErr) {
            const index = FALLBACK_REPORTS.findIndex(r => r._id === req.params.id);
            if (index !== -1) {
                FALLBACK_REPORTS.splice(index, 1);
                deletedCount = 1;
            }
        }
        
        if (deletedCount === 0) return res.status(404).json({ error: 'Report not found' });
        res.json({ message: 'Report deleted successfully' });
    } catch (err) {
        if (err.message.includes('ObjectId')) return res.status(400).json({ error: 'Invalid report ID' });
        next(err);
    }
});

module.exports = router;
